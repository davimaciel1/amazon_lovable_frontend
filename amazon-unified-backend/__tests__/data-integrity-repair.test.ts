import 'dotenv/config';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';

import { repairRecentPrices } from '../src/services/data-integrity.service';
import { systemRouter } from '../src/routes/system.routes';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'app',
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || ''
});

function iso(d: Date) { return d.toISOString(); }

describe('data-integrity: repairs lead to zero inconsistencies', () => {
  const asin = 'TESTASIN_DI1';
  const orderId = 'TESTORDER_DI1';
  const sku = 'SKU_DI1';

  beforeAll(async () => {
    // Clean
    await pool.query('DELETE FROM order_items WHERE asin = $1', [asin]);
    await pool.query('DELETE FROM orders WHERE amazon_order_id = $1', [orderId]);
    await pool.query('DELETE FROM products WHERE asin = $1', [asin]);

    // Product with price for fallback
    await pool.query(
      `INSERT INTO products (asin, sku, title, price, in_stock, inventory_quantity, updated_at)
       VALUES ($1, $2, $3, $4, true, 0, NOW())`,
      [asin, sku, 'Test Product DI1', 10.00]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM order_items WHERE asin = $1', [asin]);
    await pool.query('DELETE FROM orders WHERE amazon_order_id = $1', [orderId]);
    await pool.query('DELETE FROM products WHERE asin = $1', [asin]);
    await pool.end();
  });

  it('repairs recent zero-revenue with qty>0 so the integrity metric returns to baseline', async () => {
    const app = express();
    app.use('/api/system', systemRouter);

    // Baseline
    const base = await request(app).get('/api/system/data-integrity');
    expect(base.status).toBe(200);
    const baseline = base.body.metrics.asinsZeroRevenueRecent as number;

    // Insert faulty data (qty>0, price_amount null) within window
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2*24*60*60*1000);

    await pool.query(
      `INSERT INTO orders (
        amazon_order_id, purchase_date, order_status, order_total_amount, order_total_currency,
        buyer_email, buyer_name, marketplace_id, number_of_items_shipped, number_of_items_unshipped, updated_at
      ) VALUES ($1, $2, 'Shipped', $3, 'USD', NULL, NULL, 'ATVPDKIKX0DER', 0, 0, NOW())
      ON CONFLICT (amazon_order_id) DO NOTHING`,
      [orderId, iso(twoDaysAgo), 0]
    );

    await pool.query(
      `INSERT INTO order_items (
        amazon_order_id, order_item_id, asin, seller_sku, title,
        quantity_ordered, quantity_shipped, item_price, listing_price, price_amount, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 0, NULL, NULL, NULL, NOW())`,
      [orderId, `${orderId}-ITEM1`, asin, sku, 'Test Line DI1', 3]
    );

    // Confirm metric increased by at least 1
    const mid = await request(app).get('/api/system/data-integrity');
    expect(mid.status).toBe(200);
    const midVal = mid.body.metrics.asinsZeroRevenueRecent as number;
    expect(midVal).toBeGreaterThanOrEqual(baseline + 1);

    // Repair recent prices for 30 days
    await repairRecentPrices(30);

    const after = await request(app).get('/api/system/data-integrity');
    expect(after.status).toBe(200);
    const afterVal = after.body.metrics.asinsZeroRevenueRecent as number;

    // Should return to baseline (no zero-revenue with qty>0)
    expect(afterVal).toBeLessThanOrEqual(baseline);
  });
});

