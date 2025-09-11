require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const asin = process.argv[2] || 'B0CLBFSQH1';
  const from = process.argv[3] || '2024-08-01T00:00:00.000Z';
  const to = process.argv[4] || '2025-09-07T00:00:00.000Z';
  const client = new Client({
    host: process.env.DB_HOST || '49.12.191.119',
    port: Number(process.env.DB_PORT || 5456),
    user: process.env.DB_USER || 'saas',
    password: process.env.DB_PASSWORD || 'saas_password_123',
    database: process.env.DB_NAME || 'amazon_monitor'
  });
  await client.connect();
  const q = `
    SELECT 
      SUM(oi.quantity_ordered) AS units,
      SUM(
        COALESCE(
          oi.price_amount,
          oi.listing_price * oi.quantity_ordered,
          oi.item_price * oi.quantity_ordered,
          p."currentPrice" * oi.quantity_ordered,
          0
        )
      ) AS revenue
    FROM order_items oi
    LEFT JOIN "Order" o ON oi.amazon_order_id = o."amazonOrderId"
    LEFT JOIN "Product" p ON oi.asin = p.asin
    WHERE oi.asin = $1 AND o."purchaseDate" BETWEEN $2 AND $3;
  `;
  const { rows } = await client.query(q, [asin, from, to]);
  console.log(rows[0]);
  await client.end();
})();
