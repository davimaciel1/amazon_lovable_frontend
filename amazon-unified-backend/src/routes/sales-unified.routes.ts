import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuthOrApiKey } from '../middleware/apiKey.middleware';

const router = Router();

// GET /api/sales-unified
// Query params:
// - startDate, endDate (ISO). If endDate has no time, treat as inclusive end-of-day
// - channel: 'amazon' | 'ml' | 'all' (default 'all')
// - keyword: search in sku/title/product_key
// - sortBy: 'revenue' | 'units' | 'price' (default 'revenue')
// - sortDir: 'asc' | 'desc' (default 'desc')
// - page, limit
router.get('/', requireAuthOrApiKey, async (req: Request, res: Response) => {
  // Disable caching for sales data to ensure fresh data
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  try {
    const {
      startDate,
      endDate,
      channel = 'all',
      keyword,
      sortBy = 'revenue',
      sortDir = 'desc',
      page = '1',
      limit = '50',
    } = req.query as Record<string, string | undefined>;

    const endParamRaw = endDate ? String(endDate) : undefined;
    const startParamRaw = startDate ? String(startDate) : undefined;

    const endTs = endParamRaw ? new Date(endParamRaw) : new Date();
    const startTs = startParamRaw ? new Date(startParamRaw) : new Date(endTs.getTime() - 30 * 24 * 60 * 60 * 1000);

    const endHasTime = !!(endParamRaw && endParamRaw.includes('T'));

    const pageNum = Math.max(parseInt(String(page)) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit)) || 50, 1), 200);
    const offset = (pageNum - 1) * limitNum;

    const allowedSort = new Set(['revenue', 'units', 'price']);
    const sortKey = allowedSort.has(String(sortBy)) ? String(sortBy) : 'revenue';
    const dir = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Build base filters
    const values: any[] = [startTs.toISOString(), endTs.toISOString()];
    let where = endHasTime
      ? `purchase_date >= $1::timestamptz AND purchase_date <= $2::timestamptz`
      : `purchase_date >= $1::timestamptz AND purchase_date < ($2::timestamptz + interval '1 day')`;

    // Channel filter
    if (channel && channel !== 'all') {
      values.push(String(channel));
      where += ` AND channel = $${values.length}`;
    }

    // Keyword filter across sku, title, product_key
    if (keyword && keyword.trim()) {
      values.push(`%${keyword.trim()}%`);
      const idx = values.length;
      where += ` AND (sku ILIKE $${idx} OR title ILIKE $${idx} OR product_key ILIKE $${idx})`;
    }

    const query = `
      WITH base AS (
        SELECT 
          product_key AS asin,
          sku,
          title,
          SUM(units)::numeric AS units,
          SUM(revenue)::numeric AS revenue
        FROM unified_sales_lines
        WHERE ${where}
        GROUP BY product_key, sku, title
      ), joined AS (
        SELECT 
          b.asin,
          b.sku,
          b.title,
          b.units,
          b.revenue,
          -- Join products only when ASIN matches (Amazon); ML may have no match
          p.marketplace_id,
          COALESCE(p.inventory_quantity, mi.available_quantity) AS stock,
          p.seller_count,
          p.buy_box_seller,
          p.compra,
          p.armazenagem,
          p.frete_amazon,
          p.custos_percentuais,
          p.imposto_percent,
          p.custo_variavel_percent,
          p.margem_contribuicao_percent,
          p.custos_manuais,
          -- Join marketplace-specific SKU costs (active window)
          sc.compra AS sc_compra,
          sc.armazenagem AS sc_armazenagem,
          sc.frete_amazon AS sc_frete_amazon,
          sc.custos_percentuais AS sc_custos_percentuais,
          sc.imposto_percent AS sc_imposto_percent,
          sc.custo_variavel_percent AS sc_custo_variavel_percent,
          sc.margem_contribuicao_percent AS sc_margem_contribuicao_percent,
          sc.custos_manuais AS sc_custos_manuais
        FROM base b
        LEFT JOIN products p ON p.asin = b.asin
        LEFT JOIN (
          SELECT seller_sku, SUM(available_quantity) AS available_quantity
          FROM ml_inventory 
          WHERE status = 'active' OR status IS NULL
          GROUP BY seller_sku
        ) mi ON mi.seller_sku = b.sku
        LEFT JOIN LATERAL (
          SELECT c.*
          FROM sku_costs c
          WHERE c.sku = b.sku
            AND c.marketplace_id = COALESCE(NULLIF(p.marketplace_id,''), 'MLB')
            AND (c.start_date IS NULL OR c.start_date <= CURRENT_DATE)
            AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
          ORDER BY c.start_date DESC
          LIMIT 1
        ) sc ON true
      )
      SELECT 
        asin,
        sku,
        title AS product,
        COALESCE(NULLIF(marketplace_id,''), 'MLB') AS marketplace_id, -- default MLB for ML items without product match
        units::numeric,
        revenue::numeric,
        CASE WHEN NULLIF(units,0) IS NULL THEN 0 ELSE (revenue / NULLIF(units,0)) END AS price,
        stock,
        seller_count,
        buy_box_seller,
        COALESCE(sc_compra, compra) AS compra,
        COALESCE(sc_armazenagem, armazenagem) AS armazenagem,
        COALESCE(sc_frete_amazon, frete_amazon) AS frete_amazon,
        COALESCE(sc_custos_percentuais, custos_percentuais) AS custos_percentuais,
        COALESCE(sc_imposto_percent, imposto_percent) AS imposto_percent,
        COALESCE(sc_custo_variavel_percent, custo_variavel_percent) AS custo_variavel_percent,
        COALESCE(sc_margem_contribuicao_percent, margem_contribuicao_percent) AS margem_contribuicao_percent,
        COALESCE(sc_custos_manuais, custos_manuais) AS custos_manuais
      FROM joined
      ORDER BY ${sortKey} ${dir}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const finalValues = [...values, limitNum, offset];
    const result = await pool.query(query, finalValues);

    // Transform rows to the same format used by sales-simple
    const rows = result.rows.map((row: any, index: number) => {
      const asin: string = row.asin || `item-${index}`;
      const base64Id = Buffer.from(String(asin)).toString('base64');
      const imageUrl = `/app/product-images/${base64Id}.jpg`;

      const units = Number(row.units) || 0;
      const revenue = Number(row.revenue) || 0;

      // Costs
      const compra = row.compra != null ? Number(row.compra) : null;
      const armazenagem = row.armazenagem != null ? Number(row.armazenagem) : null;
      const frete_amazon = row.frete_amazon != null ? Number(row.frete_amazon) : null;
      const custos_percentuais = row.custos_percentuais != null ? Number(row.custos_percentuais) : null;
      const imposto_percent = row.imposto_percent != null ? Number(row.imposto_percent) : null;
      const custo_variavel_percent = row.custo_variavel_percent != null ? Number(row.custo_variavel_percent) : null;
      const margem_contribuicao_percent = row.margem_contribuicao_percent != null ? Number(row.margem_contribuicao_percent) : null;
      const custos_manuais = row.custos_manuais === true;

      const anyCost = [compra, armazenagem, frete_amazon, custos_percentuais, imposto_percent, custo_variavel_percent].some(v => typeof v === 'number' && !Number.isNaN(v));
      let profit: number | null = null;
      let roi: number | null = null;
      if (anyCost || custos_manuais) {
        const perUnitCost = (compra || 0) + (armazenagem || 0) + (frete_amazon || 0);
        const pctSum = (custos_percentuais || 0) + (imposto_percent || 0) + (custo_variavel_percent || 0);
        const variableCosts = revenue * (pctSum / 100);
        const cogsTotal = (perUnitCost * units) + variableCosts;
        profit = revenue - cogsTotal;
        roi = cogsTotal > 0 ? (profit / cogsTotal) * 100 : null;
      }

      return {
        id: `${asin}-${index}`,
        sku: row.sku || asin,
        asin,
        product: row.product || asin,
        title: row.product || asin,
        image_url: imageUrl,
        imageUrl: imageUrl,
        marketplace_id: row.marketplace_id || 'MLB',
        units,
        revenue,
        orders: 0, // not available from unified view
        price: Number(row.price) || 0,
        profit,
        roi,
        acos: null,
        health: 'good',
        stock: row.stock != null ? Number(row.stock) : 0,
        buy_box_winner: row.buy_box_seller || null,
        sellers: row.seller_count != null ? Number(row.seller_count) : null,
        costs: {
          compra,
          armazenagem,
          frete_amazon,
          custos_percentuais,
          imposto_percent,
          custo_variavel_percent,
          margem_contribuicao_percent,
          custos_manuais,
        },
      };
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: rows.length,
        pages: Math.max(Math.ceil(rows.length / limitNum), 1),
      },
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message || 'sales-unified failed' });
  }
});

// TEMPORARY: Force Amazon sync without API key (for debugging)
router.post('/force-amazon-sync', async (_req: Request, res: Response) => {
  try {
    console.log('🚀 [TEMP SYNC] Iniciando sincronização forçada da Amazon...');
    
    // Import the sync service
    const { CompleteSyncService } = await import('../services/complete-sync.service');
    const syncService = new CompleteSyncService();
    
    // Start sync in background
    syncService.startSync().catch(error => {
      console.error('❌ [TEMP SYNC] Erro na sincronização:', error);
    });

    console.log('✅ [TEMP SYNC] Sincronização iniciada em background');
    
    res.json({
      success: true,
      message: 'Sincronização da Amazon iniciada! Aguarde alguns minutos.',
      status: 'sync_started',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ [TEMP SYNC] Erro fatal:', error);
    res.status(500).json({
      success: false,
      error: 'Falha ao iniciar sincronização',
      details: error.message
    });
  }
});


export const salesUnifiedRouter = router;
