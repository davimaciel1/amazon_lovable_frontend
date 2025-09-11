import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { optionalApiKey } from '../middleware/apiKey.middleware';

const router = express.Router();

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const q = `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `;
    const { rows } = await pool.query(q, [table, column]);
    return rows.length > 0;
  } catch (err) {
    logger.warn('columnExists check failed', { table, column, error: (err as Error).message });
    return false;
  }
}

router.get('/images/status', optionalApiKey, async (_req: Request, res: Response) => {
  try {
    const hasMain = await columnExists('products', 'main_image_url');
    const hasLocal = await columnExists('products', 'local_image_url');

    const fields = [
      'COUNT(*) as total_products',
      'COUNT(image_url) as with_image_url',
    ];
    if (hasMain) fields.push('COUNT(main_image_url) as with_main_image_url');
    if (hasLocal) fields.push('COUNT(local_image_url) as with_local_image_url');

    const countSql = `SELECT ${fields.join(', ')} FROM products`;
    const countRes = await pool.query(countSql);

    const placeholderConds = [
      "image_url ILIKE '%placeholder%'",
      "image_url ILIKE '%no%image%'",
      "image_url ILIKE '%01RmK%J4pJL%'",
    ];
    if (hasMain) {
      placeholderConds.push(
        "main_image_url ILIKE '%placeholder%'",
        "main_image_url ILIKE '%no%image%'",
        "main_image_url ILIKE '%01RmK%J4pJL%'",
      );
    }
    if (hasLocal) {
      placeholderConds.push(
        "local_image_url ILIKE '%placeholder%'",
        "local_image_url ILIKE '%no%image%'",
        "local_image_url ILIKE '%01RmK%J4pJL%'",
      );
    }
    const placeholderSql = `SELECT COUNT(*) as placeholders FROM products WHERE ${placeholderConds.join(' OR ')}`;
    const placeholderRes = await pool.query(placeholderSql);

    const lastUpdatedRes = await pool.query(`SELECT MAX(updated_at) as last_updated FROM products`);

    const sampleCols = ['asin', 'title', 'image_url'];
    if (hasMain) sampleCols.push('main_image_url');
    if (hasLocal) sampleCols.push('local_image_url');
    const sampleSql = `
      SELECT ${sampleCols.join(', ')}, updated_at
      FROM products
      WHERE image_url IS NOT NULL
        ${hasMain ? ' OR main_image_url IS NOT NULL' : ''}
        ${hasLocal ? ' OR local_image_url IS NOT NULL' : ''}
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 5
    `;
    const sampleRes = await pool.query(sampleSql);

    // Count local files
    let localFiles = 0;
    try {
      const candidates = [
        path.join(__dirname, '..', 'public', 'product-images'),
        path.join(__dirname, '..', '..', 'public', 'product-images'),
      ];
      let files = [] as string[];
      for (const dir of candidates) {
        if (fs.existsSync(dir)) {
          files = fs.readdirSync(dir);
          if (files.length >= 0) break;
        }
      }
      localFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f)).length;
    } catch (e) {
      logger.warn('Unable to read local product-images directory', { error: (e as Error).message });
    }

    return res.json({
      totals: countRes.rows[0] || {},
      placeholders: Number(placeholderRes.rows[0]?.placeholders || 0),
      lastUpdated: lastUpdatedRes.rows[0]?.last_updated || null,
      localFiles,
      schedule: {
        cron: process.env.IMAGE_SYNC_CRON || '30 2 * * *',
        batchSize: Number(process.env.IMAGE_SYNC_BATCH_SIZE || '500'),
        runOnStart: process.env.IMAGE_SYNC_RUN_ON_START !== 'false',
        disabled: process.env.DISABLE_IMAGE_SYNC === 'true',
      },
      sample: sampleRes.rows,
    });
  } catch (error) {
    logger.error('Error in /system/images/status', error);
    return res.status(500).json({ error: 'Failed to get image status' });
  }
});

// Lightweight auth verification for WebSocket handshake
// Returns authenticated user info if API key or JWT is valid
router.get('/auth/verify', async (req: Request, res: Response) => {
  try {
    // Accept either API key or Bearer JWT
    const { default: jwt } = await import('jsonwebtoken');

    // Check API key first
    const apiKeyHeader = req.header('x-api-key');
    const apiKeyAuth = req.header('authorization') && /^ApiKey\s+/i.test(req.header('authorization')!)
      ? req.header('authorization')!.replace(/^ApiKey\s+/i, '').trim()
      : undefined;
    const providedKey = (apiKeyHeader || apiKeyAuth || '').trim();

    if (providedKey) {
      const keys: string[] = [];
      if (process.env.API_KEYS) {
        keys.push(
          ...process.env.API_KEYS
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        );
      }
      if (process.env.API_KEY) keys.push(process.env.API_KEY.trim());
      const allowed = new Set(keys.filter(Boolean));
      if (allowed.size > 0 && allowed.has(providedKey)) {
        return res.json({ ok: true, userId: 'api-key' });
      }
    }

    // Fallback: Bearer JWT
    const auth = req.header('authorization');
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      const token = auth.substring(7);
      try {
        const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
        const decoded: any = jwt.verify(token, secret);
        return res.json({ ok: true, userId: decoded?.userId || 'jwt-user' });
      } catch (e) {
        return res.status(401).json({ ok: false });
      }
    }

    return res.status(401).json({ ok: false });
  } catch (error) {
    logger.error('WS auth verify error', error);
    return res.status(401).json({ ok: false });
  }
});

// Data integrity summary
router.get('/data-integrity', optionalApiKey, async (_req: Request, res: Response) => {
  try {
    const days = Number(process.env.INTEGRITY_WINDOW_DAYS || '90');
    const q = {
      missingImages: `SELECT COUNT(*)::int AS c FROM products WHERE COALESCE(image_url,'') = '' AND COALESCE(local_image_url,'') = ''`,
      missingBuyBox: `SELECT COUNT(*)::int AS c FROM products WHERE buy_box_seller IS NULL OR buy_box_seller = ''`,
      missingStock: `SELECT COUNT(*)::int AS c FROM products WHERE inventory_quantity IS NULL`,
      missingPriceAmountRecent: `
        SELECT COUNT(*)::int AS c
        FROM order_items oi
        JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
        WHERE o.purchase_date >= NOW() - ($1 || ' days')::interval
          AND oi.quantity_ordered > 0
          AND (oi.price_amount IS NULL OR oi.price_amount = 0)
      `,
      zeroRevenueRecent: `
        WITH agg AS (
          SELECT oi.asin,
                 SUM(oi.quantity_ordered) AS qty,
                 SUM(COALESCE(oi.price_amount,0)) AS rev
          FROM order_items oi
          JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
          WHERE o.purchase_date >= NOW() - ($1 || ' days')::interval
          GROUP BY oi.asin
        )
        SELECT COUNT(*)::int AS c FROM agg WHERE qty > 0 AND rev = 0
      `,
      sampleMissingImages: `
        SELECT asin, title FROM products
        WHERE COALESCE(image_url,'') = '' AND COALESCE(local_image_url,'') = ''
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 10
      `
    } as const;

    const [mi, mb, ms, mp, zr, sm] = await Promise.all([
      pool.query(q.missingImages),
      pool.query(q.missingBuyBox),
      pool.query(q.missingStock),
      pool.query(q.missingPriceAmountRecent, [days]),
      pool.query(q.zeroRevenueRecent, [days]),
      pool.query(q.sampleMissingImages),
    ]);

    res.json({
      windowDays: days,
      metrics: {
        productsMissingImages: mi.rows[0].c,
        productsMissingBuyBox: mb.rows[0].c,
        productsMissingStock: ms.rows[0].c,
        orderItemsMissingPriceAmountRecent: mp.rows[0].c,
        asinsZeroRevenueRecent: zr.rows[0].c,
      },
      samples: {
        missingImages: sm.rows,
      },
      flags: {
        ENABLE_SIMULATED_PRODUCT_DATA: process.env.ENABLE_SIMULATED_PRODUCT_DATA === 'true',
        DISABLE_SCHEDULES: process.env.DISABLE_SCHEDULES === 'true',
      }
    });
  } catch (e) {
    logger.error('Error in /system/data-integrity', e);
    res.status(500).json({ error: 'Failed to compute data integrity' });
  }
});

// Trigger image validation & fix (manual)
router.post('/images/repair', async (req: Request, res: Response) => {
  try {
    // Require API key for this operation
    const provided = (req.header('x-api-key') || '').trim();
    const keys: string[] = [];
    if (process.env.API_KEYS) {
      keys.push(
        ...process.env.API_KEYS
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      );
    }
    if (process.env.API_KEY) keys.push(process.env.API_KEY.trim());
    const allowed = new Set(keys.filter(Boolean));
    if (allowed.size > 0 && !allowed.has(provided)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { ImageValidatorService } = await import('../services/image-validator.service');
    const svc = ImageValidatorService.getInstance();
    const result = await svc.validateAndFixAll();
    return res.json(result);
  } catch (e) {
    logger.error('Error in /system/images/repair', e);
    return res.status(500).json({ error: 'Failed to repair images' });
  }
});

// Apply ML schema from SQL file at repo root
router.post('/db/apply-ml-schema', optionalApiKey, async (_req: Request, res: Response) => {
  try {
    // Try to locate the SQL file from dist
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', 'create-ml-orders-tables.sql'), // repo root
      path.resolve(__dirname, '..', '..', 'create-ml-orders-tables.sql'),      // fallback
    ];
    let sqlPath = '';
    for (const p of candidates) {
      if (fs.existsSync(p)) { sqlPath = p; break; }
    }
    if (!sqlPath) {
      return res.status(404).json({ error: 'SQL file create-ml-orders-tables.sql not found' });
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);

    return res.json({ ok: true, applied: true, file: sqlPath });
  } catch (e: any) {
    logger.error('Failed to apply ML schema', e);
    return res.status(500).json({ ok: false, error: e.message || 'Failed to apply schema' });
  }
});

export { router as systemRouter };
