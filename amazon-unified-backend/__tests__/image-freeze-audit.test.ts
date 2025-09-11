import 'dotenv/config';
import { Pool } from 'pg';
import { AmazonSyncService } from '../src/services/amazon-sync.service';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'app',
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || ''
});

describe('CONSISTENCY_LOCK freezes image URL writes and audits changes', () => {
  const asin = 'TESTASIN_IMG_LOCK1';

  beforeAll(async () => {
    await pool.query('DELETE FROM image_change_audit WHERE asin = $1', [asin]).catch(() => {});
    await pool.query('DELETE FROM products WHERE asin = $1', [asin]);
    await pool.query(
      `INSERT INTO products (asin, sku, title, image_url, in_stock, inventory_quantity, updated_at)
       VALUES ($1, $2, $3, $4, true, 0, NOW())`,
      [asin, asin, 'Test Product IMG LOCK', 'https://example.com/old.jpg']
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM image_change_audit WHERE asin = $1', [asin]).catch(() => {});
    await pool.query('DELETE FROM products WHERE asin = $1', [asin]);
    await pool.end();
  });

  it('blocks image_url updates when locked and records an audit row', async () => {
    process.env.CONSISTENCY_LOCK = 'true';
    const svc = new AmazonSyncService();

    const productData: any = {
      asin,
      images: [{ variant: 'MAIN', link: 'https://example.com/new.jpg' }],
      identifiers: [{ identifierType: 'SKU', identifier: asin }],
      summaries: [{ itemName: 'Name', price: { value: 1.23, currency: 'USD' } }],
      title: 'Name'
    };

    // @ts-ignore - access private for test
    await (svc as any).saveProduct(productData);

    const prod = await pool.query('SELECT image_url FROM products WHERE asin = $1', [asin]);
    expect(prod.rows.length).toBe(1);
    expect(prod.rows[0].image_url).toBe('https://example.com/old.jpg');

    const audit = await pool.query('SELECT * FROM image_change_audit WHERE asin = $1 ORDER BY created_at DESC LIMIT 1', [asin]);
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].was_blocked).toBe(true);
    expect(audit.rows[0].new_image_url).toBe('https://example.com/new.jpg');
  });

  it('allows image_url update when unlocked and records audit', async () => {
    process.env.CONSISTENCY_LOCK = 'false';
    const svc = new AmazonSyncService();

    const productData: any = {
      asin,
      images: [{ variant: 'MAIN', link: 'https://example.com/new2.jpg' }],
      identifiers: [{ identifierType: 'SKU', identifier: asin }],
      summaries: [{ itemName: 'Name', price: { value: 1.23, currency: 'USD' } }],
      title: 'Name'
    };

    // @ts-ignore - access private for test
    await (svc as any).saveProduct(productData);

    const prod = await pool.query('SELECT image_url FROM products WHERE asin = $1', [asin]);
    expect(prod.rows.length).toBe(1);
    expect(prod.rows[0].image_url).toBe('https://example.com/new2.jpg');

    const audit = await pool.query('SELECT * FROM image_change_audit WHERE asin = $1 ORDER BY created_at DESC LIMIT 1', [asin]);
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].was_blocked).toBe(false);
    expect(audit.rows[0].new_image_url).toBe('https://example.com/new2.jpg');
  });
});

