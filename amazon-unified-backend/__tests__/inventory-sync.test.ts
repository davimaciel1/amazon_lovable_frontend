import 'dotenv/config';
import { Pool } from 'pg';
import { inventorySyncService } from '../src/services/amazon-inventory-sync.service';
import axios from 'axios';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'app',
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || ''
});

function iso(d: Date) { return d.toISOString(); }

describe('inventorySyncService updates stock from FBA summaries', () => {
  const asin = 'TESTASIN_INV1';
  const sku = 'SKU_INV1';
  const orderId = 'TESTORDER_INV1';

  beforeAll(async () => {
    await pool.query('DELETE FROM order_items WHERE asin = $1', [asin]);
    await pool.query('DELETE FROM orders WHERE amazon_order_id = $1', [orderId]);
    await pool.query('DELETE FROM products WHERE asin = $1', [asin]);

    await pool.query(
      `INSERT INTO products (asin, sku, title, price, in_stock, inventory_quantity, updated_at)
       VALUES ($1, $2, $3, 9.99, false, 0, NOW())`,
      [asin, sku, 'Test Product INV1']
    );

    const now = new Date();
    await pool.query(
      `INSERT INTO orders (
        amazon_order_id, purchase_date, order_status, order_total_amount, order_total_currency,
        marketplace_id, number_of_items_shipped, number_of_items_unshipped, updated_at
      ) VALUES ($1, $2, 'Shipped', 9.99, 'USD', 'ATVPDKIKX0DER', 0, 0, NOW())
      ON CONFLICT (amazon_order_id) DO NOTHING`,
      [orderId, iso(now)]
    );

    await pool.query(
      `INSERT INTO order_items (
        amazon_order_id, order_item_id, asin, seller_sku, title,
        quantity_ordered, quantity_shipped, item_price, price_amount, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 1, 0, 9.99, 9.99, NOW())`,
      [orderId, `${orderId}-ITEM1`, asin, sku, 'Test Line INV1']
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM order_items WHERE asin = $1', [asin]);
    await pool.query('DELETE FROM orders WHERE amazon_order_id = $1', [orderId]);
    await pool.query('DELETE FROM products WHERE asin = $1', [asin]);
    await pool.end();
  });

  it('updates products.inventory_quantity using FBA inventory summaries', async () => {
    // Mock LWA token
    mockedAxios.post.mockResolvedValueOnce({ data: { access_token: 'TEST_TOKEN' } } as any);

    // Mock FBA summaries
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        inventorySummaries: [
          {
            sellerSku: sku,
            asin: asin,
            inventoryDetails: {
              fulfillableQuantity: 7,
              inboundWorkingQuantity: 2,
              inboundShippedQuantity: 1,
              inboundReceivingQuantity: 0,
              reservedQuantity: { totalReservedQuantity: 3 }
            }
          }
        ]
      }
    } as any);

    await inventorySyncService.syncInventory();

    const { rows } = await pool.query('SELECT inventory_quantity, in_stock FROM products WHERE asin = $1', [asin]);
    expect(rows.length).toBe(1);
    // available = (7+2+1+0) - 3 = 7
    expect(Number(rows[0].inventory_quantity)).toBe(7);
    expect(rows[0].in_stock).toBe(true);
  });
});

