require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'app',
    user: process.env.DB_USER || 'app',
    password: process.env.DB_PASSWORD || ''
  });
  const start = process.argv[2] || '2024-07-01';
  const end = process.argv[3] || '2024-09-02';
  const asin = process.argv[4] || 'B0CLBFSQH1';
  const values = [start, end, `%${asin}%`, `%${asin}%`, `%${asin}%`, `%${asin}%`, 5, 0];
  const orderDateWhere = "o.purchase_date >= $1::timestamptz AND o.purchase_date < ($2::timestamptz + interval '1 day')";
  const q = `
    WITH sales_data AS (
      SELECT 
        oi.seller_sku as sku,
        oi.asin,
        COALESCE(p.title, oi.title, 'Product ' || oi.asin) as product,
        p.marketplace_id,
        SUM(oi.quantity_ordered) as units,
        SUM(COALESCE(oi.price_amount, oi.item_price, 0) * oi.quantity_ordered) as revenue,
        COUNT(DISTINCT o.amazon_order_id) as orders,
        AVG(COALESCE(oi.price_amount, oi.item_price, 0)) as price,
        MAX(p.inventory_quantity) as stock,
        MAX(p.seller_count) as seller_count,
        MAX(p.buy_box_seller) as buy_box_seller
      FROM orders o
      INNER JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
      LEFT JOIN products p ON oi.asin = p.asin
      WHERE ${orderDateWhere}
        AND oi.asin IS NOT NULL
        AND (oi.seller_sku ILIKE $3 OR oi.asin ILIKE $4 OR p.title ILIKE $5 OR oi.title ILIKE $6)
      GROUP BY 
        oi.seller_sku,
        oi.asin,
        p.title,
        oi.title,
        p.marketplace_id
    )
    SELECT asin, units, revenue, price, stock, seller_count, buy_box_seller
    FROM sales_data
    ORDER BY revenue DESC
    LIMIT $7 OFFSET $8
  `;
  try {
    const r = await pool.query(q, values);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await pool.end();
  }
})();

