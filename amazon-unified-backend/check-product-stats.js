require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const asin = process.argv[2] || 'B0CLBFSQH1';
  const client = new Client({
    host: process.env.DB_HOST || '49.12.191.119',
    port: Number(process.env.DB_PORT || 5456),
    user: process.env.DB_USER || 'saas',
    password: process.env.DB_PASSWORD || 'saas_password_123',
    database: process.env.DB_NAME || 'amazon_monitor'
  });
  try {
    await client.connect();
    const q1 = `
      SELECT asin,
             "totalStock",
             "fbaStock",
             "fbmStock",
             "inboundStock",
             "reservedStock",
             "buyBoxWinner",
             "buyBoxPrice"
      FROM "Product"
      WHERE asin = $1
      LIMIT 1;
    `;
    const q2 = `
      SELECT asin,
             seller_count,
             seller_name,
             buy_box_seller
      FROM products
      WHERE asin = $1
      LIMIT 1;
    `;
    const q3 = `
      SELECT fba_available_quantity, fba_reserved_quantity, fba_unfulfillable_quantity,
             fba_inbound_working_quantity, fba_inbound_shipped_quantity, fba_inbound_receiving_quantity,
             total_quantity,
             inventory_updated_at, created_at
      FROM order_items
      WHERE asin = $1
      ORDER BY inventory_updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1;
    `;
    const [r1, r2, r3] = await Promise.all([
      client.query(q1, [asin]).catch(() => ({ rows: [] })),
      client.query(q2, [asin]).catch(() => ({ rows: [] })),
      client.query(q3, [asin]).catch(() => ({ rows: [] })),
    ]);
    console.log({ Product: r1.rows[0] || null, products: r2.rows[0] || null, latestInventoryFromOrderItems: r3.rows[0] || null });
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await client.end();
  }
})();
