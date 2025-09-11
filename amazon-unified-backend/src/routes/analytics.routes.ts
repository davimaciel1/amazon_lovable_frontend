import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { subDays, isAfter, parseISO } from 'date-fns';
import { requireAuthOrApiKey } from '../middleware/apiKey.middleware';

const router = Router();

// Protect analytics endpoints with API key or Bearer token
router.use(requireAuthOrApiKey);

function toYMD(d: Date): string { return d.toISOString().slice(0,10); }
function normalizePeriod(raw?: { start?: string; end?: string }) {
  const defaultDays = Number(process.env.COPILOT_DEFAULT_PERIOD_DAYS || 30);
  const today = new Date();
  let start = raw?.start ? parseISO(raw.start) : subDays(today, defaultDays);
  let end = raw?.end ? parseISO(raw.end) : today;
  if (isAfter(end, today)) end = today;
  if (isAfter(start, end)) start = subDays(end, defaultDays);
  return { start: toYMD(start), end: toYMD(end) };
}

function parseSort(sortBy: string | undefined, allowed: string[], fallback: string) {
  return allowed.includes(sortBy || '') ? sortBy : fallback;
}

function parseDir(dir: string | undefined) {
  return dir === 'asc' ? 'ASC' : 'DESC';
}

// Top products
router.get('/top-products', async (req: Request, res: Response) => {
  try {
    const { start, end, marketplace, channel = 'all', limit = '10', offset = '0', sortBy = 'revenue', sortDir = 'desc' } = req.query as any;
    const norm = normalizePeriod({ start, end });
    const s = norm.start; const e = norm.end;
    const lim = Math.max(1, Math.min(200, Number(limit) || 10));
    const off = Math.max(0, Number(offset) || 0);
    const sort = parseSort(sortBy, ['revenue', 'units', 'title', 'asin', 'sku'], 'revenue');
    const dir = parseDir(String(sortDir));

    const q = `
      WITH base AS (
        SELECT 
          'amazon'::text AS channel,
          oi.asin::text AS product_key,
          COALESCE(p.sku, oi.seller_sku, oi.asin) AS sku,
          COALESCE(p.title, oi.title, oi.asin) AS title,
          oi.quantity_ordered::numeric AS units,
          (COALESCE(oi.price_amount, oi.item_price::numeric) * oi.quantity_ordered::numeric) AS revenue
        FROM orders o
        JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
        LEFT JOIN products p ON p.asin = oi.asin
        WHERE o.purchase_date::date >= $1::date
          AND o.purchase_date::date <= $2::date
          AND ($3::text IS NULL OR o.marketplace_id = $3)
          AND ($4::text IS NULL OR $4 IN ('all','amazon'))
        UNION ALL
        SELECT 
          'ml'::text AS channel,
          COALESCE(oi.seller_sku, oi.item_id)::text AS product_key,
          COALESCE(oi.seller_sku, oi.item_id)::text AS sku,
          COALESCE(oi.title, COALESCE(oi.seller_sku, oi.item_id)::text) AS title,
          COALESCE(oi.quantity,0)::numeric AS units,
          (COALESCE(oi.quantity,0)::numeric * COALESCE(oi.unit_price, oi.full_unit_price, 0)::numeric) AS revenue
        FROM ml_orders o
        LEFT JOIN ml_order_items oi ON o.ml_order_id = oi.ml_order_id
        WHERE o.date_created::date >= $1::date
          AND o.date_created::date <= $2::date
          AND ($4::text IS NULL OR $4 IN ('all','ml'))
      )
      SELECT 
        product_key AS asin,
        sku,
        title,
        SUM(revenue) AS revenue,
        SUM(units) AS units
      FROM base
      GROUP BY product_key, sku, title
      ORDER BY ${sort} ${dir}
      LIMIT $5 OFFSET $6
    `;
    const { rows } = await pool.query(q, [s, e, marketplace || null, channel || 'all', lim, off]);
    return res.json({ items: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'top-products failed' });
  }
});

// Low stock
router.get('/low-stock', async (req: Request, res: Response) => {
  try {
    const { threshold = '10', limit = '50', offset = '0', sortBy = 'inventory_quantity', sortDir = 'asc' } = req.query as any;
    const thr = Math.max(0, Number(threshold) || 10);
    const lim = Math.max(1, Math.min(200, Number(limit) || 50));
    const off = Math.max(0, Number(offset) || 0);
    const sort = parseSort(sortBy, ['inventory_quantity', 'title', 'asin'], 'inventory_quantity');
    const dir = parseDir(String(sortDir));

    const q = `
      SELECT asin, title, inventory_quantity, in_stock
      FROM products
      WHERE inventory_quantity IS NOT NULL AND inventory_quantity <= $1
      ORDER BY ${sort} ${dir}
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(q, [thr, lim, off]);
    return res.json({ items: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'low-stock failed' });
  }
});

// Worst margins
router.get('/worst-margins', async (req: Request, res: Response) => {
  try {
    const { start, end, marketplace, channel = 'all', limit = '10', offset = '0', sortBy = 'est_margin', sortDir = 'asc' } = req.query as any;
    const norm = normalizePeriod({ start, end });
    const s = norm.start; const e = norm.end;
    const lim = Math.max(1, Math.min(200, Number(limit) || 10));
    const off = Math.max(0, Number(offset) || 0);
    const sort = parseSort(sortBy, ['est_margin', 'est_margin_percent', 'revenue', 'units', 'title'], 'est_margin');
    const dir = parseDir(String(sortDir));

    const q = `
      WITH base AS (
        SELECT 
          'amazon'::text AS channel,
          oi.asin::text AS product_key,
          COALESCE(p.title, oi.title, oi.asin) AS title,
          (COALESCE(oi.price_amount, oi.item_price::numeric) * oi.quantity_ordered::numeric) AS revenue,
          oi.quantity_ordered::numeric AS units
        FROM orders o
        JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
        LEFT JOIN products p ON p.asin = oi.asin
        WHERE o.purchase_date::date >= $1::date
          AND o.purchase_date::date <= $2::date
          AND ($3::text IS NULL OR o.marketplace_id = $3)
          AND ($4::text IS NULL OR $4 IN ('all','amazon'))
        UNION ALL
        SELECT 
          'ml'::text AS channel,
          COALESCE(oi.seller_sku, oi.item_id)::text AS product_key,
          COALESCE(oi.title, COALESCE(oi.seller_sku, oi.item_id)::text) AS title,
          (COALESCE(oi.quantity,0)::numeric * COALESCE(oi.unit_price, oi.full_unit_price, 0)::numeric) AS revenue,
          COALESCE(oi.quantity,0)::numeric AS units
        FROM ml_orders o
        LEFT JOIN ml_order_items oi ON o.ml_order_id = oi.ml_order_id
        WHERE o.date_created::date >= $1::date
          AND o.date_created::date <= $2::date
          AND ($4::text IS NULL OR $4 IN ('all','ml'))
      ), agg AS (
        SELECT product_key, MAX(title) AS title, SUM(revenue) AS revenue, SUM(units) AS units
        FROM base
        GROUP BY product_key
      )
      SELECT 
        a.product_key AS asin,
        a.title,
        a.revenue::numeric,
        a.units::numeric,
        CASE WHEN c.asin IS NULL THEN NULL ELSE (
          a.revenue
          - (a.revenue * ((COALESCE(c.imposto_percent,0) + COALESCE(c.custo_variavel_percent,0))/100.0))
          - (a.units * (COALESCE(c.custos_manuais,0) + COALESCE(c.compra_reais,0) + COALESCE(c.armazenagem_reais,0) + COALESCE(c.frete_amazon_reais,0)))
        ) END AS est_margin,
        CASE WHEN c.asin IS NULL OR a.revenue <= 0 THEN NULL ELSE (
          (
            a.revenue
            - (a.revenue * ((COALESCE(c.imposto_percent,0) + COALESCE(c.custo_variavel_percent,0))/100.0))
            - (a.units * (COALESCE(c.custos_manuais,0) + COALESCE(c.compra_reais,0) + COALESCE(c.armazenagem_reais,0) + COALESCE(c.frete_amazon_reais,0)))
          ) / a.revenue
        ) END AS est_margin_percent
      FROM agg a
      LEFT JOIN product_manual_costs c ON c.asin = a.product_key
      ORDER BY ${sort} ${dir}
      LIMIT $5 OFFSET $6
    `;
    const { rows } = await pool.query(q, [s, e, marketplace || null, channel || 'all', lim, off]);
    return res.json({ items: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'worst-margins failed' });
  }
});

// Weekly drops
router.get('/weekly-drops', async (req: Request, res: Response) => {
  try {
    const { start, end, marketplace, channel = 'all', limit = '10', offset = '0', sortBy = 'revenue_diff', sortDir = 'asc' } = req.query as any;
    const norm = normalizePeriod({ start, end });
    const s = norm.start; const e = norm.end;
    const lim = Math.max(1, Math.min(200, Number(limit) || 10));
    const off = Math.max(0, Number(offset) || 0);
    const sort = parseSort(sortBy, ['revenue_diff', 'revenue_diff_percent', 'revenue', 'prev_revenue', 'units'], 'revenue_diff');
    const dir = parseDir(String(sortDir));

    const q = `
      WITH base AS (
        SELECT 
          'amazon'::text AS channel,
          oi.asin::text AS product_key,
          COALESCE(p.title, oi.title, oi.asin) AS title,
          date_trunc('week', o.purchase_date)::date AS week_start,
          (COALESCE(oi.price_amount, oi.item_price::numeric) * oi.quantity_ordered::numeric) AS revenue,
          oi.quantity_ordered::numeric AS units
        FROM orders o
        JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
        LEFT JOIN products p ON p.asin = oi.asin
        WHERE o.purchase_date::date >= $1::date
          AND o.purchase_date::date <= $2::date
          AND ($3::text IS NULL OR o.marketplace_id = $3)
          AND ($4::text IS NULL OR $4 IN ('all','amazon'))
        UNION ALL
        SELECT 
          'ml'::text AS channel,
          COALESCE(oi.seller_sku, oi.item_id)::text AS product_key,
          COALESCE(oi.title, COALESCE(oi.seller_sku, oi.item_id)::text) AS title,
          date_trunc('week', o.date_created)::date AS week_start,
          (COALESCE(oi.quantity,0)::numeric * COALESCE(oi.unit_price, oi.full_unit_price, 0)::numeric) AS revenue,
          COALESCE(oi.quantity,0)::numeric AS units
        FROM ml_orders o
        LEFT JOIN ml_order_items oi ON o.ml_order_id = oi.ml_order_id
        WHERE o.date_created::date >= $1::date
          AND o.date_created::date <= $2::date
          AND ($4::text IS NULL OR $4 IN ('all','ml'))
      ), asin_week AS (
        SELECT product_key, week_start, SUM(revenue) AS revenue, SUM(units) AS units, MAX(title) AS title
        FROM base
        GROUP BY product_key, week_start
      ), with_lag AS (
        SELECT 
          product_key,
          week_start,
          revenue,
          units,
          LAG(revenue) OVER (PARTITION BY product_key ORDER BY week_start) AS prev_revenue,
          LAG(units) OVER (PARTITION BY product_key ORDER BY week_start) AS prev_units,
          MAX(title) OVER (PARTITION BY product_key) AS title
        FROM asin_week
      ), drops AS (
        SELECT 
          product_key,
          title,
          week_start,
          revenue,
          prev_revenue,
          (revenue - prev_revenue) AS revenue_diff,
          CASE WHEN prev_revenue > 0 THEN (revenue - prev_revenue) / prev_revenue ELSE NULL END AS revenue_diff_percent,
          units,
          prev_units,
          (units - prev_units) AS units_diff
        FROM with_lag
        WHERE prev_revenue IS NOT NULL AND revenue < prev_revenue
      )
      SELECT 
        product_key AS asin,
        title,
        week_start,
        revenue,
        prev_revenue,
        revenue_diff,
        revenue_diff_percent,
        units,
        prev_units,
        units_diff
      FROM drops
      ORDER BY ${sort} ${dir}
      LIMIT $5 OFFSET $6
    `;
    const { rows } = await pool.query(q, [s, e, marketplace || null, channel || 'all', lim, off]);
    return res.json({ items: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'weekly-drops failed' });
  }
});

// Unified endpoints (using unified_sales_lines view)
router.get('/unified/top-products', async (req: Request, res: Response) => {
  try {
    const { start, end, channel = 'all', limit = '10', offset = '0', sortBy = 'revenue', sortDir = 'desc' } = req.query as any;
    const norm = normalizePeriod({ start, end });
    const s = norm.start; const e = norm.end;
    const lim = Math.max(1, Math.min(200, Number(limit) || 10));
    const off = Math.max(0, Number(offset) || 0);

    // Allowed sort keys
    const sort = parseSort(String(sortBy), ['revenue', 'units', 'title', 'sku', 'asin'], 'revenue');
    const dir = parseDir(String(sortDir));

    const ch = channel === 'all' ? null : String(channel);

    // Map sort key to column
    let sortCol = 'revenue';
    if (sort === 'units') sortCol = 'units';
    else if (sort === 'title') sortCol = 'title';
    else if (sort === 'sku') sortCol = 'sku';
    else if (sort === 'asin') sortCol = 'asin';

    const q = `
      WITH agg AS (
        SELECT 
          product_key AS asin,
          sku,
          title,
          SUM(revenue) AS revenue,
          SUM(units) AS units
        FROM unified_sales_lines
        WHERE purchase_date >= $1::date AND purchase_date <= $2::date
          AND ($3::text IS NULL OR channel = $3)
        GROUP BY product_key, sku, title
      )
      SELECT * FROM agg
      ORDER BY ${sortCol} ${dir}
      LIMIT $4 OFFSET $5
    `;
    const { rows } = await pool.query(q, [s, e, ch, lim, off]);
    return res.json({ items: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'unified top-products failed' });
  }
});

// Unified weekly trend
router.get('/unified/weekly-trend', async (req: Request, res: Response) => {
  try {
    const { start, end, channel = 'all' } = req.query as any;
    const norm = normalizePeriod({ start, end });
    const s = norm.start; const e = norm.end;
    const ch = channel === 'all' ? null : String(channel);

    const q = `
      WITH weeks AS (
        SELECT 
          date_trunc('week', purchase_date)::date AS week_start,
          SUM(revenue) AS revenue
        FROM unified_sales_lines
        WHERE purchase_date >= $1::date AND purchase_date <= $2::date
          AND ($3::text IS NULL OR channel = $3)
        GROUP BY 1
      )
      SELECT 
        week_start,
        revenue::numeric,
        LAG(revenue) OVER (ORDER BY week_start) AS prev_revenue,
        (revenue - LAG(revenue) OVER (ORDER BY week_start)) AS delta,
        CASE WHEN LAG(revenue) OVER (ORDER BY week_start) > 0 THEN 
          (revenue - LAG(revenue) OVER (ORDER BY week_start)) / LAG(revenue) OVER (ORDER BY week_start)
        ELSE NULL END AS delta_percent
      FROM weeks
      ORDER BY week_start
    `;
    const { rows } = await pool.query(q, [s, e, ch]);
    return res.json({ trend: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'unified weekly-trend failed' });
  }
});

// Unified weekly drops by product
router.get('/unified/weekly-drops', async (req: Request, res: Response) => {
  try {
    const { start, end, channel = 'all', limit = '10', offset = '0' } = req.query as any;
    const norm = normalizePeriod({ start, end });
    const s = norm.start; const e = norm.end;
    const lim = Math.max(1, Math.min(200, Number(limit) || 10));
    const off = Math.max(0, Number(offset) || 0);
    const ch = channel === 'all' ? null : String(channel);

    const q = `
      WITH asin_week AS (
        SELECT 
          product_key,
          date_trunc('week', purchase_date)::date AS week_start,
          SUM(revenue) AS revenue,
          SUM(units) AS units,
          MAX(title) AS title
        FROM unified_sales_lines
        WHERE purchase_date >= $1::date AND purchase_date <= $2::date
          AND ($3::text IS NULL OR channel = $3)
        GROUP BY product_key, date_trunc('week', purchase_date)
      ), with_lag AS (
        SELECT 
          product_key,
          week_start,
          revenue,
          units,
          LAG(revenue) OVER (PARTITION BY product_key ORDER BY week_start) AS prev_revenue,
          LAG(units) OVER (PARTITION BY product_key ORDER BY week_start) AS prev_units,
          MAX(title) OVER (PARTITION BY product_key) AS title
        FROM asin_week
      ), drops AS (
        SELECT 
          product_key,
          title,
          week_start,
          revenue,
          prev_revenue,
          (revenue - prev_revenue) AS revenue_diff,
          CASE WHEN prev_revenue > 0 THEN (revenue - prev_revenue) / prev_revenue ELSE NULL END AS revenue_diff_percent,
          units,
          prev_units,
          (units - prev_units) AS units_diff
        FROM with_lag
        WHERE prev_revenue IS NOT NULL AND revenue < prev_revenue
      )
      SELECT 
        product_key AS asin,
        title,
        week_start,
        revenue,
        prev_revenue,
        revenue_diff,
        revenue_diff_percent,
        units,
        prev_units,
        units_diff
      FROM drops
      ORDER BY revenue_diff ASC
      LIMIT $4 OFFSET $5
    `;
    const { rows } = await pool.query(q, [s, e, ch, lim, off]);
    return res.json({ items: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'unified weekly-drops failed' });
  }
});

export default router;
