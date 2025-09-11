require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const days = parseInt(process.env.BACKFILL_DAYS || '90', 10);
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'app',
    user: process.env.DB_USER || 'app',
    password: process.env.DB_PASSWORD || ''
  });

  function iso(d) { return d.toISOString(); }

  console.log(`Backfill window: ${iso(start)} -> ${iso(end)} (last ${days} days)`);

  try {
    // 1) price_amount using listing_price * qty
    const r1 = await pool.query(`
      UPDATE order_items oi
      SET price_amount = ROUND(oi.listing_price * oi.quantity_ordered, 2)
      FROM orders o
      WHERE oi.amazon_order_id = o.amazon_order_id
        AND o.purchase_date >= $1 AND o.purchase_date <= $2
        AND (oi.price_amount IS NULL OR oi.price_amount = 0)
        AND oi.listing_price IS NOT NULL AND oi.listing_price > 0
        AND oi.quantity_ordered > 0
    `, [iso(start), iso(end)]);
    console.log('Step1 updated (listing_price*qty):', r1.rowCount);

    // 2) price_amount using item_price * qty
    const r2 = await pool.query(`
      UPDATE order_items oi
      SET price_amount = ROUND(oi.item_price * oi.quantity_ordered, 2)
      FROM orders o
      WHERE oi.amazon_order_id = o.amazon_order_id
        AND o.purchase_date >= $1 AND o.purchase_date <= $2
        AND (oi.price_amount IS NULL OR oi.price_amount = 0)
        AND oi.item_price IS NOT NULL AND oi.item_price > 0
        AND oi.quantity_ordered > 0
    `, [iso(start), iso(end)]);
    console.log('Step2 updated (item_price*qty):', r2.rowCount);

    // 3) price_amount using products.price * qty
    const r3 = await pool.query(`
      UPDATE order_items oi
      SET price_amount = ROUND(p.price * oi.quantity_ordered, 2)
      FROM orders o, products p
      WHERE oi.amazon_order_id = o.amazon_order_id
        AND p.asin = oi.asin
        AND o.purchase_date >= $1 AND o.purchase_date <= $2
        AND (oi.price_amount IS NULL OR oi.price_amount = 0)
        AND p.price IS NOT NULL AND p.price > 0
        AND oi.quantity_ordered > 0
    `, [iso(start), iso(end)]);
    console.log('Step3 updated (products.price*qty):', r3.rowCount);

    // 4) price_amount using Product.currentPrice * qty
    const r4 = await pool.query(`
      UPDATE order_items oi
      SET price_amount = ROUND(prod."currentPrice" * oi.quantity_ordered, 2)
      FROM orders o, "Product" prod
      WHERE oi.amazon_order_id = o.amazon_order_id
        AND prod.asin = oi.asin
        AND o.purchase_date >= $1 AND o.purchase_date <= $2
        AND (oi.price_amount IS NULL OR oi.price_amount = 0)
        AND prod."currentPrice" IS NOT NULL AND prod."currentPrice" > 0
        AND oi.quantity_ordered > 0
    `, [iso(start), iso(end)]);
    console.log('Step4 updated (Product.currentPrice*qty):', r4.rowCount);

    // 5) price_amount distributing order_total_amount by qty proportion
    const r5 = await pool.query(`
      WITH order_qty AS (
        SELECT oi.amazon_order_id, SUM(oi.quantity_ordered) AS total_qty
        FROM order_items oi
        JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
        WHERE o.purchase_date >= $1 AND o.purchase_date <= $2
        GROUP BY oi.amazon_order_id
      )
      UPDATE order_items oi
      SET price_amount = ROUND(((o.order_total_amount::numeric / NULLIF(oq.total_qty, 0)) * oi.quantity_ordered), 2)
      FROM orders o
      JOIN order_qty oq ON oq.amazon_order_id = o.amazon_order_id
      WHERE oi.amazon_order_id = o.amazon_order_id
        AND o.purchase_date >= $1 AND o.purchase_date <= $2
        AND (oi.price_amount IS NULL OR oi.price_amount = 0)
        AND o.order_total_amount IS NOT NULL AND o.order_total_amount > 0
        AND oi.quantity_ordered > 0
    `, [iso(start), iso(end)]);
    console.log('Step5 updated (distributed order_total_amount):', r5.rowCount);

    // 6) listing_price fallback when missing
    const r6 = await pool.query(`
      UPDATE order_items oi
      SET listing_price = COALESCE(
        oi.listing_price,
        CASE WHEN oi.quantity_ordered > 0 AND oi.price_amount IS NOT NULL THEN (oi.price_amount / oi.quantity_ordered) END,
        oi.item_price,
        p.price,
        prod."currentPrice"
      )
      FROM orders o, products p, "Product" prod
      WHERE oi.amazon_order_id = o.amazon_order_id
        AND p.asin = oi.asin
        AND prod.asin = oi.asin
        AND o.purchase_date >= $1 AND o.purchase_date <= $2
        AND (oi.listing_price IS NULL OR oi.listing_price = 0)
    `, [iso(start), iso(end)]);
    console.log('Step6 updated listing_price:', r6.rowCount);

    // 7) Recompute orders.order_total_amount when zero or null
    const r7 = await pool.query(`
      WITH sums AS (
        SELECT oi.amazon_order_id, SUM(COALESCE(oi.price_amount, 0)) AS sum_items
        FROM order_items oi
        JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
        WHERE o.purchase_date >= $1 AND o.purchase_date <= $2
        GROUP BY oi.amazon_order_id
      )
      UPDATE orders o
      SET order_total_amount = s.sum_items
      FROM sums s
      WHERE o.amazon_order_id = s.amazon_order_id
        AND (o.order_total_amount IS NULL OR o.order_total_amount = 0)
        AND o.purchase_date >= $1 AND o.purchase_date <= $2
    `, [iso(start), iso(end)]);
    console.log('Step7 updated orders.order_total_amount:', r7.rowCount);

    console.log('Backfill complete.');
  } catch (e) {
    console.error('Backfill error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

