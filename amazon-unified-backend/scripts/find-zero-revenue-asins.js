require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const days = parseInt(process.env.INTEGRITY_WINDOW_DAYS || '90', 10);
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'app',
    user: process.env.DB_USER || 'app',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    const { rows } = await pool.query(`
      WITH recent AS (
        SELECT oi.asin, SUM(COALESCE(oi.price_amount,0)) AS revenue
        FROM order_items oi
        JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
        WHERE o.purchase_date >= NOW() - ($1 || ' days')::interval
        GROUP BY oi.asin
      )
      SELECT asin
      FROM recent
      WHERE revenue = 0
      ORDER BY asin
      LIMIT 50
    `, [days]);

    if (!rows.length) {
      console.log('No ASINs with zero revenue in recent window.');
    } else {
      console.log('ASINs with zero revenue (recent window):');
      for (const r of rows) console.log('-', r.asin);
      // Show a few sample order items for the first one
      const asin = rows[0].asin;
      console.log('\nSample order_items for', asin);
      const { rows: sample } = await pool.query(`
        SELECT oi.amazon_order_id, oi.quantity_ordered, oi.item_price, oi.listing_price, oi.price_amount
        FROM order_items oi
        JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
        WHERE oi.asin = $1
          AND o.purchase_date >= NOW() - ($2 || ' days')::interval
        ORDER BY o.purchase_date DESC
        LIMIT 10
      `, [asin, days]);
      console.table(sample);
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

