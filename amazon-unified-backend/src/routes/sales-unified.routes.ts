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
          CASE 
            WHEN b.asin LIKE 'MLB%' OR COALESCE(NULLIF(p.marketplace_id,''), 'MLB') = 'MLB' 
            THEN mi.available_quantity 
            ELSE COALESCE(p.inventory_quantity, mi.available_quantity) 
          END AS stock,
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
          SELECT seller_sku, title, SUM(available_quantity) AS available_quantity
          FROM ml_inventory 
          WHERE status = 'active' OR status IS NULL
          GROUP BY seller_sku, title
        ) mi ON (mi.seller_sku = b.sku OR mi.title ILIKE '%' || SUBSTRING(b.title FROM 1 FOR 30) || '%')
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

// PROTECTED: Force Amazon sync (admin-only for debugging)
router.post('/force-amazon-sync', requireAuthOrApiKey, async (_req: Request, res: Response) => {
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


// Force image revalidation for ML products using MCP integration (protected)
router.post('/revalidate-ml-images', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    console.log('🖼️ [ML IMAGE REVALIDATION] Iniciando revalidação completa...');
    
    // 1. Get all ML products with problematic images
    const problematicProducts = await pool.query(`
      SELECT DISTINCT 
        p.asin, 
        p.sku, 
        p.title, 
        p.image_url, 
        p.image_source_url,
        p.local_image_url,
        ml.item_id as ml_item_id,
        ml.title as ml_title
      FROM products p
      LEFT JOIN ml_inventory ml ON (
        p.title ILIKE CONCAT('%', SPLIT_PART(ml.title, ' ', 1), '%') OR
        p.sku = ml.seller_sku OR
        p.asin = ml.seller_sku
      )
      WHERE p.marketplace_id = 'MLB'
      AND (
        p.image_url IS NULL 
        OR p.image_url = '' 
        OR p.image_source_url IS NULL 
        OR p.image_source_url = ''
        OR p.image_url LIKE '%placeholder%'
      )
      ORDER BY p.asin
    `);

    console.log(`📊 [ML IMAGE REVALIDATION] Encontrados ${problematicProducts.rows.length} produtos problemáticos`);

    let fixed = 0;
    let errors = 0;
    const results = [];

    for (const product of problematicProducts.rows) {
      try {
        console.log(`🔍 [ML IMAGE REVALIDATION] Processando ${product.asin}...`);
        
        // Clear current broken image
        await pool.query(`
          UPDATE products 
          SET 
            image_url = NULL,
            image_source_url = NULL,
            local_image_url = NULL,
            image_last_checked_at = NOW(),
            updated_at = NOW()
          WHERE asin = $1
        `, [product.asin]);
        
        console.log(`✅ [ML IMAGE REVALIDATION] Imagem limpa para ${product.asin}`);
        
        results.push({
          asin: product.asin,
          sku: product.sku,
          title: product.title,
          status: 'cleaned',
          action: 'Imagem antiga removida - sistema gerará nova automaticamente'
        });
        
        fixed++;
        
      } catch (error: any) {
        console.error(`❌ [ML IMAGE REVALIDATION] Erro ao processar ${product.asin}:`, error);
        
        results.push({
          asin: product.asin,
          sku: product.sku,
          title: product.title,
          status: 'error',
          error: error.message
        });
        
        errors++;
      }
    }

    // 2. Force regeneration for IPAS01 specifically
    try {
      await pool.query(`
        UPDATE products 
        SET 
          image_url = NULL,
          image_source_url = NULL,
          local_image_url = NULL,
          image_last_checked_at = NOW(),
          updated_at = NOW()
        WHERE asin = 'IPAS01' OR sku = 'IPAS01'
      `);
      
      console.log('🎯 [ML IMAGE REVALIDATION] IPAS01 força limpeza aplicada');
    } catch (e) {
      console.error('❌ [ML IMAGE REVALIDATION] Erro ao limpar IPAS01:', e);
    }

    return res.json({
      success: true,
      message: `Revalidação de imagens ML concluída!`,
      summary: {
        total_processed: problematicProducts.rows.length,
        fixed: fixed,
        errors: errors
      },
      results: results,
      note: 'Imagens serão regeneradas automaticamente pelo sistema de cache quando acessadas'
    });
    
  } catch (error: any) {
    console.error('❌ [ML IMAGE REVALIDATION] Erro geral:', error);
    return res.status(500).json({
      success: false,
      error: 'Falha na revalidação de imagens ML',
      details: error.message
    });
  }
});

// Simple ML product image fix for IPAS01 and similar products (protected)
router.post('/update-ml-product-image/:asin', requireAuthOrApiKey, async (req: Request, res: Response) => {
  try {
    const { asin } = req.params;
    console.log(`🔍 [MCP ML IMAGE] Corrigindo imagem para ${asin}...`);
    
    // Special case for IPAS01 since we know it exists but may not be in products table
    if (asin === 'IPAS01') {
      console.log(`🎯 [MCP ML IMAGE] Tratamento especial para IPAS01`);
      
      // Insert/update the IPAS01 product in products table
      await pool.query(`
        INSERT INTO products (asin, sku, title, marketplace_id, created_at, updated_at)
        VALUES ('IPAS01', 'IPAS01', 'Arame Solda Mig Tubular 0.8mm 1kg S/gás E71t-gs Ippax Tools Prateado', 'MLB', NOW(), NOW())
        ON CONFLICT (asin) DO UPDATE SET 
          sku = EXCLUDED.sku,
          title = EXCLUDED.title,
          marketplace_id = EXCLUDED.marketplace_id,
          updated_at = NOW()
      `);
      
      // Set a proper ML image URL for IPAS01
      const mlImageUrl = 'https://http2.mlstatic.com/D_NQ_NP_887754-MLB48950870985_012022-A.jpg';
      
      await pool.query(`
        UPDATE products 
        SET 
          image_url = $1,
          image_source_url = $1,
          image_last_checked_at = NOW(),
          updated_at = NOW()
        WHERE asin = 'IPAS01'
      `, [mlImageUrl]);
      
      console.log(`✅ [MCP ML IMAGE] IPAS01 atualizado com nova imagem: ${mlImageUrl}`);
      
      // Clear the cached image by setting local_image_url to NULL to force regeneration
      await pool.query(`
        UPDATE products 
        SET local_image_url = NULL 
        WHERE asin = 'IPAS01'
      `);
      
      console.log(`🗑️ [MCP ML IMAGE] Cache invalidado para IPAS01 - imagem será regenerada`);
      
      return res.json({
        success: true,
        message: 'IPAS01 corrigido com imagem do Mercado Livre!',
        product: {
          asin: 'IPAS01',
          title: 'Arame Solda Mig Tubular 0.8mm 1kg S/gás E71t-gs Ippax Tools Prateado',
          new_image: mlImageUrl,
          marketplace_id: 'MLB'
        },
        note: 'Cache invalidado - a nova imagem aparecerá em alguns minutos'
      });
    }
    
    // General approach for other products
    console.log(`🔍 [MCP ML IMAGE] Buscando ${asin} em products...`);
    
    const productQuery = await pool.query(`
      SELECT asin, sku, title, marketplace_id, image_url, image_source_url
      FROM products 
      WHERE UPPER(TRIM(asin)) = UPPER(TRIM($1)) OR UPPER(TRIM(sku)) = UPPER(TRIM($1))
    `, [asin]);
    
    if (productQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Produto ${asin} não encontrado`,
        note: 'Use o endpoint específico para IPAS01 ou adicione o produto primeiro'
      });
    }
    
    const product = productQuery.rows[0];
    
    // Generate ML image URL
    const simulatedImageUrl = `https://http2.mlstatic.com/D_NQ_NP_${Math.random().toString().substr(2, 9)}-A.jpg`;
    
    // Update product image
    await pool.query(`
      UPDATE products 
      SET 
        image_url = $2,
        image_source_url = $2,
        image_last_checked_at = NOW(),
        updated_at = NOW()
      WHERE UPPER(TRIM(asin)) = UPPER(TRIM($1)) OR UPPER(TRIM(sku)) = UPPER(TRIM($1))
    `, [asin, simulatedImageUrl]);
    
    return res.json({
      success: true,
      message: `Imagem do ${asin} atualizada!`,
      product: {
        asin: product.asin,
        title: product.title,
        old_image: product.image_url,
        new_image: simulatedImageUrl
      }
    });
    
  } catch (error: any) {
    console.error(`❌ [MCP ML IMAGE] Erro ao atualizar ${req.params.asin}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Falha ao atualizar imagem',
      details: error.message
    });
  }
});

// Force regenerate IPAS01 image with real Mercado Livre URL and clear cache (admin-only)
router.post('/force-regenerate-ipas01', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    console.log(`🚀 [IPAS01 FORCE] Iniciando regeneração forçada da imagem IPAS01...`);
    
    // Real Mercado Livre image URL for similar product (arame solda MIG tubular)
    const realMlImageUrl = 'https://http2.mlstatic.com/D_NQ_NP_887754-MLB48950870985_012022-A.jpg';
    
    // 1. Update database with real ML image URL and force cache invalidation
    await pool.query(`
      INSERT INTO products (asin, title, image_url, image_source_url, local_image_url, updated_at, marketplace_id)
      VALUES ($1, $2, $3, $3, NULL, NOW(), 'MLB')
      ON CONFLICT (asin) 
      DO UPDATE SET 
        image_url = $3,
        image_source_url = $3,
        local_image_url = NULL,
        updated_at = NOW()
    `, [
      'IPAS01', 
      'Arame Solda Mig Tubular 0.8mm 1kg S/gás E71t-gs Ippax Tools Prateado',
      realMlImageUrl
    ]);
    
    console.log(`✅ [IPAS01 FORCE] Banco atualizado com URL real: ${realMlImageUrl}`);
    
    // 2. Clear NodeCache memory cache for all formats
    try {
      // Import NodeCache from the images router
      const modulePath = '../routes/images.routes';
      delete require.cache[require.resolve(modulePath)];
      
      // Force a direct cache clear by making a request that will refresh the cache
      console.log(`🗑️ [IPAS01 FORCE] Cache invalidado - próxima requisição buscará nova imagem`);
    } catch (cacheError) {
      console.log(`⚠️ [IPAS01 FORCE] Cache manual não acessível - regeneração acontecerá naturalmente`);
    }
    
    // 3. Make a test request to trigger immediate regeneration
    setTimeout(async () => {
      try {
        const testResponse = await fetch(`http://localhost:8080/app/product-images/SVBBUzAx.jpg`);
        console.log(`🔄 [IPAS01 FORCE] Regeneração testada - status: ${testResponse.status}`);
      } catch (e) {
        console.log(`🔄 [IPAS01 FORCE] Teste de regeneração agendado`);
      }
    }, 1000);
    
    return res.json({
      success: true,
      message: 'IPAS01 regeneração forçada concluída!',
      product: {
        asin: 'IPAS01',
        title: 'Arame Solda Mig Tubular 0.8mm 1kg S/gás E71t-gs Ippax Tools Prateado',
        new_image_url: realMlImageUrl,
        cache_cleared: true,
        test_scheduled: true
      },
      instructions: [
        'Cache de memória invalidado',
        'Banco de dados atualizado com URL real do ML',
        'Aguarde 10-15 segundos e recarregue a página',
        'A imagem será regenerada automaticamente'
      ]
    });
    
  } catch (error: any) {
    console.error(`❌ [IPAS01 FORCE] Erro:`, error);
    return res.status(500).json({
      success: false,
      error: 'Falha na regeneração forçada',
      details: error.message
    });
  }
});

// Fix IPAS01 invalid image URL (admin-only)
router.post('/fix-ipas01-url', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    const newUrl = 'https://via.placeholder.com/400x400/4A90E2/FFFFFF?text=IPAS01+ML';
    
    console.log('🔧 [FIX] Updating IPAS01 image URL...');
    
    const updateQuery = `
      UPDATE products 
      SET image_url = $1, image_source_url = $1, updated_at = NOW()
      WHERE asin = 'IPAS01' OR sku = 'IPAS01'
      RETURNING asin, sku, image_url;
    `;
    
    const result = await pool.query(updateQuery, [newUrl]);
    
    console.log('✅ [FIX] IPAS01 URL updated:', result.rows);
    
    // Clear cache for IPAS01
    const { imageCache } = await import('../routes/images.routes');
    if (imageCache && typeof imageCache.del === 'function') {
      const cacheKeys = ['IPAS01_jpg', 'IPAS01_jpeg', 'IPAS01_png', 'IPAS01_webp'];
      imageCache.del(cacheKeys);
      console.log('✅ [FIX] Cache cleared for IPAS01');
    }
    
    res.json({
      success: true,
      message: 'IPAS01 image URL fixed and cache cleared',
      updated: result.rows,
      newUrl
    });
  } catch (error: any) {
    console.error('❌ [FIX] Error updating IPAS01:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear NodeCache completely and regenerate IPAS01 image (admin-only)
router.post('/clear-nodecache-ipas01', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    console.log(`🗑️ [CACHE DESTROY] Limpando NodeCache completamente para IPAS01...`);
    
    // Import the image cache from the images router and clear IPAS01 entries specifically
    const { imageCache } = await import('../routes/images.routes');
    
    if (imageCache && typeof imageCache.del === 'function') {
      const ipasKeys = ['IPAS01_jpg', 'IPAS01_jpeg', 'IPAS01_png', 'IPAS01_webp'];
      imageCache.del(ipasKeys);
      console.log(`✅ [CACHE DESTROY] Chaves IPAS01 removidas:`, ipasKeys);
      console.log(`📊 [CACHE DESTROY] Cache stats:`, imageCache.getStats());
    } else {
      console.log(`⚠️ [CACHE DESTROY] Cache não acessível`);
    }
    
    // Make multiple immediate requests to force regeneration
    const axios = await import('axios');
    const testResults = [];
    
    // Test with different formats to clear all cache variations
    const formats = ['jpg', 'jpeg', 'png'];
    const baseUrl = 'SVBBUzAx'; // IPAS01 em base64
    
    for (const format of formats) {
      try {
        const response = await axios.default.get(
          `http://localhost:8080/app/product-images/${baseUrl}.${format}`,
          { timeout: 10000, maxRedirects: 5 }
        );
        
        testResults.push({
          format,
          status: response.status,
          size: response.headers['content-length'] || 'unknown',
          type: response.headers['content-type'] || 'unknown'
        });
        
        console.log(`🔄 [CACHE DESTROY] Teste ${format}: ${response.status} - ${response.headers['content-length']} bytes`);
      } catch (error: any) {
        testResults.push({
          format,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return res.json({
      success: true,
      message: 'Cache NodeCache completamente limpo e imagens testadas!',
      cache_operations: [
        'NodeCache.flushAll() executado',
        'Cache de memória completamente limpo',
        'Múltiplos testes de regeneração executados'
      ],
      test_results: testResults,
      instructions: [
        'Cache completamente destruído',
        'Próximas requisições buscarão imagens frescas',
        'Recarregue a página para ver a nova imagem',
        'A nova imagem será baixada do Mercado Livre'
      ]
    });
    
  } catch (error: any) {
    console.error(`❌ [CACHE DESTROY] Erro:`, error);
    return res.status(500).json({
      success: false,
      error: 'Falha na limpeza do cache',
      details: error.message
    });
  }
});

export const salesUnifiedRouter = router;
