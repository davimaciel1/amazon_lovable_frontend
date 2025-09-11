import 'dotenv/config';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';

// sales-simple router is CommonJS
// eslint-disable-next-line @typescript-eslint/no-var-requires
const salesSimpleRouter = require('../src/routes/sales-simple');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'app',
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || ''
});

function iso(d: Date) { return d.toISOString(); }

describe('sales-simple revenue fallbacks', () => {
  const asin = 'TESTASIN_SS1';
  const orderId = 'TESTORDER_SS1';
  const sku = 'SKU_SS1';

  beforeAll(async () => {
    // Clean any remains
    await pool.query('DELETE FROM order_items WHERE asin = $1', [asin]);
    await pool.query('DELETE FROM orders WHERE amazon_order_id = $1', [orderId]);
    await pool.query('DELETE FROM products WHERE asin = $1', [asin]);

    // Insert product with price as fallback
    await pool.query(
      `INSERT INTO products (asin, sku, title, price, in_stock, inventory_quantity, updated_at)
       VALUES ($1, $2, $3, $4, true, 0, NOW())`,
      [asin, sku, 'Test Product SS1', 12.34]
    );

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24*60*60*1000);

    await pool.query(
      `INSERT INTO orders (
        amazon_order_id, purchase_date, order_status, order_total_amount, order_total_currency,
        buyer_email, buyer_name, marketplace_id, number_of_items_shipped, number_of_items_unshipped, updated_at
      ) VALUES ($1, $2, 'Shipped', $3, 'USD', NULL, NULL, 'ATVPDKIKX0DER', 0, 0, NOW())
      ON CONFLICT (amazon_order_id) DO NOTHING`,
      [orderId, iso(yesterday), 0]
    );

    await pool.query(
      `INSERT INTO order_items (
        amazon_order_id, order_item_id, asin, seller_sku, title,
        quantity_ordered, quantity_shipped, item_price, listing_price, price_amount, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 0, NULL, NULL, NULL, NOW())`,
      [orderId, `${orderId}-ITEM1`, asin, sku, 'Test Line SS1', 2]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM order_items WHERE asin = $1', [asin]);
    await pool.query('DELETE FROM orders WHERE amazon_order_id = $1', [orderId]);
    await pool.query('DELETE FROM products WHERE asin = $1', [asin]);
    await pool.end();
  });

  it('computes revenue from products.price * qty when item/unit prices are missing', async () => {
    const app = express();
    app.use('/api/sales-simple', salesSimpleRouter);

    const start = new Date(Date.now() - 7*24*60*60*1000);
    const end = new Date();
    const res = await request(app)
      .get('/api/sales-simple')
      .query({ startDate: iso(start), endDate: iso(end), limit: 50, sortBy: 'revenue', sortDir: 'desc', keyword: asin });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const row = res.body.data.find((r: any) => r.asin === asin);
    expect(row).toBeTruthy();
    expect(row.units).toBe(2);
    // 12.34 * 2 = 24.68
    expect(row.revenue).toBeCloseTo(24.68, 2);
  });
});

