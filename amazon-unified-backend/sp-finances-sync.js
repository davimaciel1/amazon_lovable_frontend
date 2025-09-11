/*
 * SP-API Finances Sync Service
 * Uses the `amazon-sp-api` SDK to pull financial events (fees) and persist them
 * into Postgres. Also updates helpful columns on order_items for direct usage
 * by analytics queries.
 */

const { Client } = require('pg');
const SellingPartner = require('amazon-sp-api');

function getSpApiClient() {
  const region = process.env.SP_API_REGION || 'na';
  const refresh_token = process.env.SP_API_REFRESH_TOKEN || process.env.LWA_REFRESH_TOKEN;
  const client_id = process.env.SP_API_CLIENT_ID || process.env.LWA_CLIENT_ID;
  const client_secret = process.env.SP_API_CLIENT_SECRET || process.env.LWA_CLIENT_SECRET;
  const access_key = process.env.SP_API_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secret_key = process.env.SP_API_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const role = process.env.SP_API_ROLE_ARN || process.env.AWS_ROLE_ARN;

  if (!refresh_token || !client_id || !client_secret || !access_key || !secret_key || !role) {
    throw new Error('Missing SP-API credentials: ensure LWA and AWS keys/role are set in env');
  }

  return new SellingPartner({
    region,
    refresh_token,
    client_id,
    client_secret,
    access_key,
    secret_key,
    role
  });
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS order_item_fees (
      id BIGSERIAL PRIMARY KEY,
      amazon_order_id TEXT,
      order_item_id TEXT,
      asin TEXT,
      sku TEXT,
      fee_type TEXT,
      fee_amount NUMERIC,
      currency_code TEXT,
      posted_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_order_item_fees_item ON order_item_fees(order_item_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_order_item_fees_fee_type ON order_item_fees(fee_type)`);
  // Helpful columns on order_items (best-effort; ignore errors if exist)
  await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS amazon_referral_fee_percent NUMERIC`);
  await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS amazon_fba_fee NUMERIC`);
  await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS amazon_storage_fee NUMERIC`);
  await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS shipping_cost_to_amazon NUMERIC`);
  await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS advertising_cost NUMERIC`);
  await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_amount NUMERIC`);
}

function sumFeeList(itemFeeList = []) {
  let sum = 0;
  const byType = {};
  for (const fee of itemFeeList) {
    const type = fee.FeeType || fee.FeeTypeEnum || 'Unknown';
    const amount = Number(fee.FeeAmount?.CurrencyAmount || 0);
    sum += amount;
    byType[type] = (byType[type] || 0) + amount;
  }
  return { sum, byType };
}

async function insertFee(client, row) {
  const { amazon_order_id, order_item_id, asin, sku, fee_type, fee_amount, currency_code, posted_date } = row;
  await client.query(
    `INSERT INTO order_item_fees (amazon_order_id, order_item_id, asin, sku, fee_type, fee_amount, currency_code, posted_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [amazon_order_id, order_item_id, asin, sku, fee_type, fee_amount, currency_code, posted_date]
  );
}

async function computeItemRevenue(client, order_item_id) {
  const q = await client.query(
    `SELECT price_amount, item_price, listing_price, quantity_ordered FROM order_items WHERE order_item_id = $1 LIMIT 1`,
    [order_item_id]
  );
  if (q.rowCount === 0) return 0;
  const r = q.rows[0];
  const qty = Number(r.quantity_ordered || 0) || 0;
  const revenue = (r.price_amount != null ? Number(r.price_amount) : null)
    ?? (r.item_price != null ? Number(r.item_price) * qty : null)
    ?? (r.listing_price != null ? Number(r.listing_price) * qty : null)
    ?? 0;
  return revenue;
}

function isFbaFeeType(t) {
  if (!t) return false;
  const s = String(t).toLowerCase();
  return s.includes('fba') || s.includes('fulfillment');
}

function isStorageFeeType(t) {
  if (!t) return false;
  const s = String(t).toLowerCase();
  return s.includes('storage');
}

async function updateOrderItemAggregates(client, order_item_id) {
  // Aggregate fees from order_item_fees for this order_item_id
  const agg = await client.query(
    `SELECT 
       SUM(CASE WHEN LOWER(fee_type) = 'commission' THEN fee_amount ELSE 0 END) AS commission_sum,
       SUM(CASE WHEN LOWER(fee_type) LIKE 'fba%' OR LOWER(fee_type) LIKE '%fulfillment%' THEN fee_amount ELSE 0 END) AS fba_sum,
       SUM(CASE WHEN LOWER(fee_type) LIKE '%storage%' THEN fee_amount ELSE 0 END) AS storage_sum
     FROM order_item_fees WHERE order_item_id = $1`,
    [order_item_id]
  );
  const row = agg.rows[0] || {};
  const commission_sum = Number(row.commission_sum || 0);
  const fba_sum = Number(row.fba_sum || 0);
  const storage_sum = Number(row.storage_sum || 0);

  // Need quantity to derive per-unit
  const q = await client.query(`SELECT quantity_ordered FROM order_items WHERE order_item_id = $1 LIMIT 1`, [order_item_id]);
  const qty = q.rowCount ? Number(q.rows[0].quantity_ordered || 0) : 0;
  const revenue = await computeItemRevenue(client, order_item_id);

  const referral_percent = revenue > 0 ? (commission_sum / revenue) * 100.0 : null;
  const fba_per_unit = qty > 0 ? (fba_sum / qty) : null;
  const storage_per_unit = qty > 0 ? (storage_sum / qty) : null;

  await client.query(
    `UPDATE order_items 
       SET amazon_referral_fee_percent = COALESCE($2, amazon_referral_fee_percent),
           amazon_fba_fee = COALESCE($3, amazon_fba_fee),
           amazon_storage_fee = COALESCE($4, amazon_storage_fee)
     WHERE order_item_id = $1`,
    [order_item_id, referral_percent, fba_per_unit, storage_per_unit]
  );
}

async function syncFinances({ startDate, endDate }) {
  const client = new Client({
    host: process.env.DB_HOST || '49.12.191.119',
    port: Number(process.env.DB_PORT || 5456),
    user: process.env.DB_USER || 'saas',
    password: process.env.DB_PASSWORD || 'saas_password_123',
    database: process.env.DB_NAME || 'amazon_monitor'
  });

  await client.connect();
  try {
    await ensureSchema(client);

    const sp = getSpApiClient();

    const query = {
      MaxResultsPerPage: 100
    };
    if (startDate) query.PostedAfter = new Date(startDate).toISOString();
    if (endDate) query.PostedBefore = new Date(endDate).toISOString();

    let resp = await sp.callAPI({ operation: 'listFinancialEvents', endpoint: 'finances', query });
    let processed = 0;

    async function handleEvents(payload) {
      const events = payload?.FinancialEvents || {};
      const shipments = events.ShipmentEventList || [];
      for (const se of shipments) {
        const amazon_order_id = se?.AmazonOrderId;
        const posted_date = se?.PostedDate ? new Date(se.PostedDate) : null;
        const items = se?.ShipmentItemList || [];
        for (const it of items) {
          const order_item_id = it?.OrderItemId;
          if (!order_item_id) continue;

          // Try to enrich with asin/sku from DB
          const oiRow = await client.query(`SELECT asin, sku, currency_code FROM order_items WHERE order_item_id = $1 LIMIT 1`, [order_item_id]);
          const asin = oiRow.rowCount ? oiRow.rows[0].asin : null;
          const sku = oiRow.rowCount ? oiRow.rows[0].sku : null;
          const currency_code = oiRow.rowCount ? oiRow.rows[0].currency_code : null;

          const itemFees = it?.ItemFeeList || [];
          const { byType } = sumFeeList(itemFees);
          for (const [fee_type, fee_amount] of Object.entries(byType)) {
            await insertFee(client, {
              amazon_order_id,
              order_item_id,
              asin,
              sku,
              fee_type,
              fee_amount: Number(fee_amount || 0),
              currency_code,
              posted_date
            });
          }

          await updateOrderItemAggregates(client, order_item_id);
          processed += 1;
        }
      }
    }

    await handleEvents(resp?.payload || resp);

    // Handle pagination
    let nextToken = resp?.payload?.NextToken || resp?.NextToken;
    let safety = 25; // limit pages
    while (nextToken && safety-- > 0) {
      const next = await sp.callAPI({ operation: 'listFinancialEventsByNextToken', endpoint: 'finances', query: { NextToken: nextToken } });
      await handleEvents(next?.payload || next);
      nextToken = next?.payload?.NextToken || next?.NextToken;
    }

    return { success: true, processed };
  } catch (e) {
    console.error('[finances-sync] error:', e?.message || e);
    throw e;
  } finally {
    await client.end();
  }
}

module.exports = { syncFinances };

