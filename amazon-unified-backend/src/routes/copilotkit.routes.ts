import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { pool } from '../config/database';
import { optionalApiKey } from '../middleware/apiKey.middleware';
import { requireAuthOrApiKey } from '../middleware/apiKey.middleware';
import { subDays, isAfter, parseISO } from 'date-fns';

const router = Router();

// Initialize OpenAI client
if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY not found, CopilotKit will not work properly');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
});

// Optionally require auth for Copilot endpoints
const REQUIRE_COPILOT_AUTH = process.env.ENABLE_COPILOT_AUTH === 'true';
// Attach auth (strict or optional) for all Copilot paths
router.use('/', REQUIRE_COPILOT_AUTH ? requireAuthOrApiKey : optionalApiKey);

// Helpers
function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizePeriod(raw?: { start?: string; end?: string }): { start: string; end: string } {
  const defaultDays = Number(process.env.COPILOT_DEFAULT_PERIOD_DAYS || 30);
  const today = new Date();
  let start = raw?.start ? parseISO(raw.start) : subDays(today, defaultDays);
  let end = raw?.end ? parseISO(raw.end) : today;
  if (isAfter(end, today)) end = today;
  if (isAfter(start, end)) start = subDays(end, defaultDays);
  return { start: toYMD(start), end: toYMD(end) };
}

async function ensureManualCostsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_manual_costs (
      asin TEXT PRIMARY KEY,
      custos_manuais NUMERIC,
      compra_reais NUMERIC,
      armazenagem_reais NUMERIC,
      frete_amazon_reais NUMERIC,
      imposto_percent NUMERIC,
      custo_variavel_percent NUMERIC,
      margem_contribuicao_percent NUMERIC,
      updated_at TIMESTAMP DEFAULT NOW(),
      updated_by TEXT
    )
  `);
}

// Define Amazon data tools for CopilotKit
const getProductDataTool = {
  name: "getProductData",
  description: "Get product data from Amazon including revenue, costs, and profitability metrics",
  parameters: {
    type: "object" as const,
    properties: {
      asin: {
        type: "string" as const,
        description: "Amazon Standard Identification Number (ASIN) of the product"
      },
      dateRange: {
        type: "object" as const,
        properties: {
          start: { type: "string" as const, description: "Start date (YYYY-MM-DD)" },
          end: { type: "string" as const, description: "End date (YYYY-MM-DD)" }
        }
      }
    },
    required: ["asin"]
  },
  handler: async ({ asin, dateRange }: { asin: string; dateRange?: { start?: string; end?: string } }) => {
    try {
      await ensureManualCostsTable();

      const norm = normalizePeriod({ start: dateRange?.start, end: dateRange?.end });
      const start = norm.start;
      const end = norm.end;

      // Fetch product basic info
      const productRes = await pool.query(
        `SELECT asin, sku, title, image_url, price, currency_code FROM products WHERE asin = $1 LIMIT 1`,
        [asin]
      );
      const product = productRes.rows[0] || null;

      // Sales metrics for period
      const salesRes = await pool.query(
        `WITH base AS (
           SELECT oi.quantity_ordered AS units, COALESCE(oi.price_amount, oi.item_price::numeric) * oi.quantity_ordered AS revenue
           FROM order_items oi
           JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
           WHERE oi.asin = $1
             AND o.purchase_date::date >= $2::date
             AND o.purchase_date::date <= $3::date
         )
         SELECT 
           COUNT(*) AS row_count,
           COALESCE(SUM(units), 0) AS total_units,
           CASE WHEN COUNT(*)=0 THEN NULL ELSE SUM(revenue) END AS total_revenue
         FROM base`,
        [asin, start, end]
      );
      const row = salesRes.rows[0] || { row_count: 0, total_units: 0, total_revenue: null } as any;
      const sales = { total_units: Number(row.total_units || 0), total_revenue: row.total_revenue !== null ? Number(row.total_revenue) : null } as any;

      // Manual costs
      const costsRes = await pool.query(
        `SELECT 
           custos_manuais, compra_reais, armazenagem_reais, frete_amazon_reais,
           imposto_percent, custo_variavel_percent, margem_contribuicao_percent,
           updated_at, updated_by
         FROM product_manual_costs WHERE asin = $1`,
        [asin]
      );
      const costs = costsRes.rows[0] || {};

      return {
        asin,
        title: product?.title || null,
        sku: product?.sku || null,
        image_url: product?.image_url || null,
        price: product?.price ? Number(product.price) : null,
        currency_code: product?.currency_code || 'USD',
        // Manual fields (as per user rules):
        custos_manuais: Number(costs.custos_manuais || 0),
        compra_reais: Number(costs.compra_reais || 0),
        armazenagem_reais: Number(costs.armazenagem_reais || 0),
        frete_amazon_reais: Number(costs.frete_amazon_reais || 0),
        // Percentage fields:
        imposto_percent: Number(costs.imposto_percent || 0),
        custo_variavel_percent: Number(costs.custo_variavel_percent || 0),
        margem_contribuicao_percent: Number(costs.margem_contribuicao_percent || 0),
        // Calculated fields (from DB):
        total_revenue: sales.total_revenue !== null ? Number(sales.total_revenue) : null,
        total_units: Number(sales.total_units || 0),
        period: { start, end },
        message: product ? 'Product data fetched from database' : 'ASIN not found in products table; sales metrics may still be available'
      };
    } catch (error) {
      throw new Error(`Failed to fetch product data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

const updateProductCostsTool = {
  name: "updateProductCosts",
  description: "Update manual cost data for a product. Only these fields can be manually entered: Custos Manuais, Compra (R$), Armazenagem (R$), Frete pra Amazon (R$), Custos Percentuais (% sobre Receita), Imposto (%), Custo Variável (%), and Margem de Contribuição (%)",
  parameters: {
    type: "object" as const,
    properties: {
      asin: {
        type: "string" as const,
        description: "Amazon Standard Identification Number (ASIN) of the product"
      },
      costs: {
        type: "object" as const,
        properties: {
          custos_manuais: { type: "number" as const, description: "Manual costs" },
          compra_reais: { type: "number" as const, description: "Purchase cost in Reais" },
          armazenagem_reais: { type: "number" as const, description: "Storage cost in Reais" },
          frete_amazon_reais: { type: "number" as const, description: "Shipping to Amazon cost in Reais" },
          imposto_percent: { type: "number" as const, description: "Tax percentage" },
          custo_variavel_percent: { type: "number" as const, description: "Variable cost percentage" },
          margem_contribuicao_percent: { type: "number" as const, description: "Contribution margin percentage" }
        }
      }
    },
    required: ["asin", "costs"]
  },
  handler: async ({ asin, costs }: { asin: string; costs: any }) => {
    try {
      await ensureManualCostsTable();

      const allowed = [
        'custos_manuais','compra_reais','armazenagem_reais','frete_amazon_reais',
        'imposto_percent','custo_variavel_percent','margem_contribuicao_percent'
      ];
      const updates: Record<string, number> = {};
      for (const key of Object.keys(costs || {})) {
        if (allowed.includes(key)) {
          const val = Number(costs[key]);
          if (!Number.isFinite(val)) continue;
          updates[key] = val;
        }
      }
      if (Object.keys(updates).length === 0) {
        return { success: false, asin, message: 'No valid cost fields provided' };
      }

      const cols = Object.keys(updates);
      const vals = cols.map((k) => updates[k]);
      const placeholders = cols.map((_, i) => `$${i + 2}`).join(', ');
      const setClause = cols.map((k) => `${k} = EXCLUDED.${k}`).join(', ');

      // save user id if available (Clerk)
      const updatedBy = null;

      const sql = `
        INSERT INTO product_manual_costs (asin, ${cols.join(', ')}, updated_at, updated_by)
        VALUES ($1, ${placeholders}, NOW(), $${cols.length + 2})
        ON CONFLICT (asin) DO UPDATE SET ${setClause}, updated_at = NOW(), updated_by = EXCLUDED.updated_by
        RETURNING *
      `;
      const params = [asin, ...vals, updatedBy];
      const result = await pool.query(sql, params);

      return {
        success: true,
        asin,
        updated_fields: updates,
        row: result.rows[0] || null,
        message: 'Product costs updated successfully'
      };
    } catch (error) {
      throw new Error(`Failed to update product costs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Additional Amazon tools
const getCampaignPerformanceTool = {
  name: 'getCampaignPerformance',
  description: 'Get advertising campaign performance metrics in a date range',
  parameters: {
    type: 'object' as const,
    properties: {
      start: { type: 'string' as const, description: 'Start date (YYYY-MM-DD)' },
      end: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
      campaign_id: { type: 'string' as const, description: 'Optional campaign id' }
    }
  },
  handler: async ({ start, end, campaign_id }: { start?: string; end?: string; campaign_id?: string }) => {
    const { start: s, end: e } = normalizePeriod({ start, end });
    const q = `
      SELECT 
        am.campaign_id,
        MIN(am.date) as start_date,
        MAX(am.date) as end_date,
        COALESCE(SUM(am.impressions),0) as impressions,
        COALESCE(SUM(am.clicks),0) as clicks,
        COALESCE(SUM(am.cost),0) as cost,
        COALESCE(SUM(am.attributed_sales),0) as attributed_sales,
        COALESCE(SUM(am.attributed_conversions),0) as attributed_conversions
      FROM advertising_metrics am
      ${campaign_id ? 'WHERE am.campaign_id = $3' : ''}
      ${' WHERE am.date >= $1'}
      ${' AND am.date <= $2'}
      GROUP BY am.campaign_id
      ORDER BY attributed_sales DESC
      LIMIT 50
    `;
    const params: any[] = [];
    params.push(s);
    params.push(e);
    if (campaign_id) params.push(campaign_id);
    const { rows } = await pool.query(q, params);
    return { campaigns: rows };
  }
};

const getSalesReportTool = {
  name: 'getSalesReport',
  description: 'Get sales KPIs for a given date range (omnichannel: Amazon + Mercado Livre)',
  parameters: {
    type: 'object' as const,
    properties: {
      start: { type: 'string' as const },
      end: { type: 'string' as const },
      channel: { type: 'string' as const, description: "Optional: 'amazon' | 'ml' | 'all' (default 'all')" }
    }
  },
  handler: async ({ start, end, channel }: { start?: string; end?: string; channel?: 'amazon'|'ml'|'all' }) => {
    const { start: s, end: e } = normalizePeriod({ start, end });
    const ch = (channel || 'all');
    const q = `
      WITH base AS (
        -- Amazon
        SELECT 
          'amazon'::text AS channel,
          o.amazon_order_id::text AS order_id,
          oi.asin::text AS product_key,
          oi.quantity_ordered::numeric AS units,
          (COALESCE(oi.price_amount, oi.item_price::numeric) * oi.quantity_ordered::numeric) AS revenue
        FROM orders o
        LEFT JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
        WHERE o.purchase_date::date >= $1::date
          AND o.purchase_date::date <= $2::date
          AND ($3::text IS NULL OR $3 IN ('all','amazon'))
        UNION ALL
        -- Mercado Livre
        SELECT 
          'ml'::text AS channel,
          o.ml_order_id::text AS order_id,
          COALESCE(oi.seller_sku, oi.item_id)::text AS product_key,
          COALESCE(oi.quantity,0)::numeric AS units,
          (COALESCE(oi.quantity,0)::numeric * COALESCE(oi.unit_price, oi.full_unit_price, 0)::numeric) AS revenue
        FROM ml_orders o
        LEFT JOIN ml_order_items oi ON o.ml_order_id = oi.ml_order_id
        WHERE o.date_created::date >= $1::date
          AND o.date_created::date <= $2::date
          AND ($3::text IS NULL OR $3 IN ('all','ml'))
      ), order_agg AS (
        SELECT order_id, SUM(revenue) AS revenue_per_order FROM base GROUP BY order_id
      )
      SELECT 
        (SELECT COUNT(DISTINCT order_id) FROM base) AS total_orders,
        (SELECT COUNT(DISTINCT product_key) FROM base) AS unique_products,
        (SELECT COALESCE(SUM(units),0) FROM base) AS total_units,
        (SELECT CASE WHEN COUNT(*)=0 THEN NULL ELSE SUM(revenue) END FROM base) AS total_revenue,
        (SELECT CASE WHEN COUNT(*)=0 THEN NULL ELSE AVG(revenue_per_order) END FROM order_agg) AS avg_order_value
    `;
    const { rows } = await pool.query(q, [s, e, ch]);
    return rows[0] || { total_orders: 0, unique_products: 0, total_units: 0, total_revenue: null, avg_order_value: null };
  }
};

const getInventoryStatusTool = {
  name: 'getInventoryStatus',
  description: 'Get inventory status for low-stock products or a given ASIN',
  parameters: {
    type: 'object' as const,
    properties: {
      asin: { type: 'string' as const },
      threshold: { type: 'number' as const, description: 'Stock threshold' },
      limit: { type: 'number' as const, description: 'Max rows (default 50)' }
    }
  },
  handler: async ({ asin, threshold, limit }: { asin?: string; threshold?: number; limit?: number }) => {
    if (asin) {
      const { rows } = await pool.query(`SELECT asin, title, inventory_quantity, in_stock FROM products WHERE asin = $1`, [asin]);
      return rows[0] || null;
    }
    const thr = Number.isFinite(threshold) ? Number(threshold) : 5;
    const lim = Math.max(1, Math.min(200, Number(limit) || 50));
    const { rows } = await pool.query(`
      SELECT asin, title, inventory_quantity, in_stock
      FROM products
      WHERE inventory_quantity IS NOT NULL AND inventory_quantity <= $1
      ORDER BY inventory_quantity ASC NULLS LAST
      LIMIT $2
    `, [thr, lim]);
    return { lowStock: rows };
  }
};

// New tool: Top Products by revenue
const getTopProductsTool = {
  name: 'getTopProducts',
  description: 'Top products by revenue in a date range (omnichannel) with optional marketplace (Amazon only)',
  parameters: {
    type: 'object' as const,
    properties: {
      start: { type: 'string' as const, description: 'Start date (YYYY-MM-DD)' },
      end: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number' as const, description: 'Max rows (default 10)' },
      marketplace: { type: 'string' as const, description: 'Marketplace ID (e.g., ATVPDKIKX0DER)' },
      channel: { type: 'string' as const, description: "Optional: 'amazon' | 'ml' | 'all' (default 'all')" }
    }
  },
  handler: async ({ start, end, limit, marketplace, channel }: { start?: string; end?: string; limit?: number; marketplace?: string; channel?: 'amazon'|'ml'|'all' }) => {
    const lim = Math.max(1, Math.min(100, Number(limit) || 10));
    const { start: s, end: e } = normalizePeriod({ start, end });
    const ch = (channel || 'all');
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
      ORDER BY revenue DESC
      LIMIT $5
    `;
    const { rows } = await pool.query(q, [s, e, marketplace || null, ch, lim]);
    return { items: rows };
  }
};

// New tools: worst margins, weekly revenue trend, and ASINs with weekly drop
const getWorstMarginsTool = {
  name: 'getWorstMargins',
  description: 'Estimate worst margins by product in a date range (omnichannel). Margin only applies where manual costs (ASIN) exist.',
  parameters: {
    type: 'object' as const,
    properties: {
      start: { type: 'string' as const, description: 'Start date (YYYY-MM-DD)' },
      end: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
      marketplace: { type: 'string' as const, description: 'Marketplace ID (optional, Amazon only)' },
      channel: { type: 'string' as const, description: "Optional: 'amazon' | 'ml' | 'all' (default 'all')" },
      limit: { type: 'number' as const, description: 'Max rows to return (default 10)' }
    }
  },
  handler: async ({ start, end, marketplace, channel, limit }: { start?: string; end?: string; marketplace?: string; channel?: 'amazon'|'ml'|'all'; limit?: number }) => {
    await ensureManualCostsTable();
    const lim = Math.max(1, Math.min(100, Number(limit) || 10));
    const { start: s, end: e } = normalizePeriod({ start, end });
    const ch = (channel || 'all');
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
      ORDER BY est_margin ASC NULLS LAST
      LIMIT $5
    `;
    const { rows } = await pool.query(q, [s, e, marketplace || null, ch, lim]);
    return { items: rows };
  }
};

const getWeeklyRevenueTrendTool = {
  name: 'getWeeklyRevenueTrend',
  description: 'Get weekly aggregated revenue and WoW deltas for a date range (omnichannel)',
  parameters: {
    type: 'object' as const,
    properties: {
      start: { type: 'string' as const, description: 'Start date (YYYY-MM-DD)' },
      end: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
      marketplace: { type: 'string' as const, description: 'Marketplace ID (optional, Amazon only)' },
      channel: { type: 'string' as const, description: "Optional: 'amazon' | 'ml' | 'all' (default 'all')" }
    }
  },
  handler: async ({ start, end, marketplace, channel }: { start?: string; end?: string; marketplace?: string; channel?: 'amazon'|'ml'|'all' }) => {
    const { start: s, end: e } = normalizePeriod({ start, end });
    const ch = (channel || 'all');
    const q = `
      WITH weeks AS (
        SELECT 
          date_trunc('week', o.purchase_date)::date AS week_start,
          SUM(COALESCE(oi.price_amount, oi.item_price::numeric) * oi.quantity_ordered) AS revenue
        FROM orders o
        JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
        WHERE o.purchase_date::date >= $1::date
          AND o.purchase_date::date <= $2::date
          AND ($3::text IS NULL OR o.marketplace_id = $3)
          AND ($4::text IS NULL OR $4 IN ('all','amazon'))
        GROUP BY 1
        UNION ALL
        SELECT 
          date_trunc('week', o.date_created)::date AS week_start,
          SUM(COALESCE(oi.quantity,0)::numeric * COALESCE(oi.unit_price, oi.full_unit_price, 0)::numeric) AS revenue
        FROM ml_orders o
        LEFT JOIN ml_order_items oi ON o.ml_order_id = oi.ml_order_id
        WHERE o.date_created::date >= $1::date
          AND o.date_created::date <= $2::date
          AND ($4::text IS NULL OR $4 IN ('all','ml'))
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
      FROM (
        SELECT week_start, SUM(revenue) AS revenue
        FROM weeks
        GROUP BY week_start
      ) agg
      ORDER BY week_start
    `;
    const { rows } = await pool.query(q, [s, e, marketplace || null, ch]);
    return { trend: rows };
  }
};

const getAsinsWithWeeklyDropTool = {
  name: 'getAsinsWithWeeklyDrop',
  description: 'Find products with largest weekly revenue drop in date range (omnichannel)',
  parameters: {
    type: 'object' as const,
    properties: {
      start: { type: 'string' as const, description: 'Start date (YYYY-MM-DD)' },
      end: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
      marketplace: { type: 'string' as const, description: 'Marketplace ID (optional, Amazon only)' },
      channel: { type: 'string' as const, description: "Optional: 'amazon' | 'ml' | 'all' (default 'all')" },
      limit: { type: 'number' as const, description: 'Max rows (default 10)' }
    }
  },
  handler: async ({ start, end, marketplace, channel, limit }: { start?: string; end?: string; marketplace?: string; channel?: 'amazon'|'ml'|'all'; limit?: number }) => {
    const lim = Math.max(1, Math.min(100, Number(limit) || 10));
    const { start: s, end: e } = normalizePeriod({ start, end });
    const ch = (channel || 'all');
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
      ORDER BY revenue_diff ASC
      LIMIT $5
    `;
    const { rows } = await pool.query(q, [s, e, marketplace || null, ch, lim]);
    return { items: rows };
  }
};

// CopilotKit endpoint with OpenAI function calling (with real DB-backed tools)
router.post('/', async (req: Request, res: Response) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file' 
      });
    }

    const userMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const toolMap: Record<string, any> = {
      [getProductDataTool.name]: getProductDataTool,
      [updateProductCostsTool.name]: updateProductCostsTool,
      [getCampaignPerformanceTool.name]: getCampaignPerformanceTool,
      [getSalesReportTool.name]: getSalesReportTool,
      [getInventoryStatusTool.name]: getInventoryStatusTool,
      [getTopProductsTool.name]: getTopProductsTool,
      [getWorstMarginsTool.name]: getWorstMarginsTool,
      [getWeeklyRevenueTrendTool.name]: getWeeklyRevenueTrendTool,
      [getAsinsWithWeeklyDropTool.name]: getAsinsWithWeeklyDropTool,
    };

    const tools = [
      { type: 'function', function: { name: getProductDataTool.name, description: getProductDataTool.description, parameters: getProductDataTool.parameters } },
{ type: 'function', function: { name: updateProductCostsTool.name, description: updateProductCostsTool.description, parameters: updateProductCostsTool.parameters } },
      { type: 'function', function: { name: getCampaignPerformanceTool.name, description: getCampaignPerformanceTool.description, parameters: getCampaignPerformanceTool.parameters } },
      { type: 'function', function: { name: getSalesReportTool.name, description: getSalesReportTool.description, parameters: getSalesReportTool.parameters } },
      { type: 'function', function: { name: getInventoryStatusTool.name, description: getInventoryStatusTool.description, parameters: getInventoryStatusTool.parameters } },
      { type: 'function', function: { name: getTopProductsTool.name, description: getTopProductsTool.description, parameters: getTopProductsTool.parameters } },
      { type: 'function', function: { name: getWorstMarginsTool.name, description: getWorstMarginsTool.description, parameters: getWorstMarginsTool.parameters } },
      { type: 'function', function: { name: getWeeklyRevenueTrendTool.name, description: getWeeklyRevenueTrendTool.description, parameters: getWeeklyRevenueTrendTool.parameters } },
      { type: 'function', function: { name: getAsinsWithWeeklyDropTool.name, description: getAsinsWithWeeklyDropTool.description, parameters: getAsinsWithWeeklyDropTool.parameters } },
    ] as any[];

// System prompt with guardrails
    const systemPrompt = `Você é um copilot de análise de dados para vendedor Amazon e Mercado Livre.
Regras:
- Sempre chame ferramentas com start e end no formato YYYY-MM-DD.
- Se o usuário não informar período, use os últimos 30 dias.
- Não use datas futuras; ajuste end para hoje quando necessário.
- Se start > end, ajuste para uma janela de 30 dias terminando em end.
- Por padrão, considere dados de Amazon e Mercado Livre (omnichannel). Use channel='amazon'|'ml'|'all' quando adequado (padrão: 'all').
- O filtro marketplace se aplica apenas a Amazon.
- Se não houver dados no período, informe explicitamente "Sem dados no período" e não invente números.
- Prefira respostas objetivas e tabelas curtas.`;

    let conversation = [{ role: 'system', content: systemPrompt }, ...userMessages];
    let lastResponse: any = null;
    const toolResultsForClient: any[] = [];

    for (let iter = 0; iter < 3; iter++) {
      lastResponse = await (openai as any).chat.completions.create({
        model: 'gpt-5',
        messages: conversation,
        temperature: 0.5,
        max_tokens: 1000,
        tools,
        tool_choice: 'auto'
      });

      const assistantMessage = lastResponse?.choices?.[0]?.message;
      if (!assistantMessage) break;
      conversation.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls || [];
      if (!toolCalls.length) break; // no tool calls, stop

      // Execute tool calls and append tool results to conversation
      for (const tc of toolCalls) {
        const toolName = tc.function?.name as string;
        const toolArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        const handler = toolMap[toolName]?.handler;
        if (!handler) continue;
        try {
          const result = await handler(toolArgs);
          toolResultsForClient.push({ name: toolName, args: toolArgs, result });
          conversation.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          } as any);
        } catch (e: any) {
          conversation.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: e?.message || 'tool failed' }),
          } as any);
        }
      }
      // loop again to let the model incorporate tool results
    }

    const finalMessage = lastResponse?.choices?.[0]?.message;
    const content = finalMessage?.content || '';

    return res.json({
      success: true,
      content,
      openai: lastResponse,
      toolResults: toolResultsForClient,
    });
  } catch (error) {
    console.error('CopilotKit endpoint error:', error);
    return res.status(500).json({ 
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Streaming endpoint (Server-Sent Events)
router.post('/stream', async (req: Request, res: Response) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const userMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
const systemPrompt = `Você é um copilot de análise de dados para vendedor Amazon e Mercado Livre.
Regras:
- Sempre chame ferramentas com start e end no formato YYYY-MM-DD.
- Se o usuário não informar período, use os últimos 30 dias.
- Não use datas futuras; ajuste end para hoje quando necessário.
- Se start > end, ajuste para uma janela de 30 dias terminando em end.
- Por padrão, considere dados de Amazon e Mercado Livre (omnichannel). Use channel='amazon'|'ml'|'all' quando adequado (padrão: 'all').
- O filtro marketplace se aplica apenas a Amazon.
- Se não houver dados no período, informe explicitamente "Sem dados no período" e não invente números.
- Prefira respostas objetivas.`;
    const messages = [{ role: 'system', content: systemPrompt }, ...userMessages];
    // Flush headers for SSE if supported
    try { (res as any).flushHeaders?.(); } catch { /* ignore */ }

    try {
      const stream: any = await (openai as any).chat.completions.create({
        model: 'gpt-5',
        messages,
        temperature: 0.7,
        max_tokens: 800,
        stream: true
      });

      for await (const part of stream) {
        const delta = part?.choices?.[0]?.delta?.content || '';
        if (delta) {
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      }
      res.write('event: end\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    } catch (streamErr) {
      // Fallback: request non-streaming completion and flush once
      console.error('OpenAI stream failed, falling back to non-stream:', streamErr);
      const nonStreamResp: any = await (openai as any).chat.completions.create({
        model: 'gpt-5',
        messages,
        temperature: 0.7,
        max_tokens: 800,
        stream: false
      });
      const content = nonStreamResp?.choices?.[0]?.message?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ delta: content })}\n\n`);
      }
      res.write('event: end\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
  } catch (error) {
    console.error('Streaming error:', error);
    try {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: (error as Error).message || 'stream error' })}\n\n`);
      res.end();
    } catch {
      res.status(500).end();
    }
  }
});

// Debug endpoint to call tools directly without LLM (QA only)
router.post('/debug', async (req: Request, res: Response) => {
  try {
    const { tool, args } = req.body || {};
    if (!tool) {
      return res.status(400).json({ error: 'Missing tool name' });
    }
    let result: any;
    switch (tool) {
      case 'getProductData':
        result = await (getProductDataTool as any).handler(args || {});
        break;
      case 'updateProductCosts':
        result = await (updateProductCostsTool as any).handler(args || {});
        break;
      case 'getCampaignPerformance':
        result = await (getCampaignPerformanceTool as any).handler(args || {});
        break;
      case 'getSalesReport':
        result = await (getSalesReportTool as any).handler(args || {});
        break;
      case 'getInventoryStatus':
        result = await (getInventoryStatusTool as any).handler(args || {});
        break;
      case 'getTopProducts':
        result = await (getTopProductsTool as any).handler(args || {});
        break;
      case 'getWorstMargins':
        result = await (getWorstMarginsTool as any).handler(args || {});
        break;
      case 'getWeeklyRevenueTrend':
        result = await (getWeeklyRevenueTrendTool as any).handler(args || {});
        break;
      case 'getAsinsWithWeeklyDrop':
        result = await (getAsinsWithWeeklyDropTool as any).handler(args || {});
        break;
      default:
        return res.status(400).json({ error: `Unknown tool: ${tool}` });
    }
    return res.json({ tool, args, result });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message || 'debug error' });
  }
});

export default router;
