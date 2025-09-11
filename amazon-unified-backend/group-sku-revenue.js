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
      oi.seller_sku,
      SUM(oi.quantity_ordered) AS units,
      SUM(
        CASE 
          WHEN oi.price_amount IS NOT NULL THEN (oi.price_amount)::numeric
          WHEN oi.item_price IS NOT NULL THEN (oi.item_price * oi.quantity_ordered)
          WHEN oi.listing_price IS NOT NULL THEN (oi.listing_price * oi.quantity_ordered)
          ELSE 0
        END
      ) AS revenue
    FROM order_items oi
    LEFT JOIN "Order" o ON oi.amazon_order_id = o."amazonOrderId"
    WHERE oi.asin = $1 AND o."purchaseDate" BETWEEN $2 AND $3
    GROUP BY oi.seller_sku
    ORDER BY revenue DESC NULLS LAST;
  `;
  const { rows } = await client.query(q, [asin, from, to]);
  console.log(rows);
  await client.end();
})();
