import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuthOrApiKey } from '../middleware/apiKey.middleware';
import NodeCache from 'node-cache';

const router = Router();
const imageCache = new NodeCache({ stdTTL: 604800 });

// URLS DE IMAGEM ML PARA AMBIENTE REPLIT - URLs estáticas base64/data
const ML_PRODUCT_MAPPINGS: Record<string, { mlb: string; title: string; image: string }> = {
  // IPAS codes - Produtos de soldagem com imagens base64
  'IPAS01': { 
    mlb: 'MLB3628967960', 
    title: 'Arame Solda Mig Sem Gás Tubular 0.8mm 1kg Lynus',
    image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" style="background:%234a5568"><text x="200" y="200" text-anchor="middle" dy=".35em" fill="white" font-family="Arial,sans-serif" font-size="18">Arame Solda Mig</text></svg>'
  },
  'IPAS02': { 
    mlb: 'MLB4258563772', 
    title: 'Eletrodo 6013 2.5mm 5kg',
    image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" style="background:%232d3748"><text x="200" y="200" text-anchor="middle" dy=".35em" fill="white" font-family="Arial,sans-serif" font-size="18">Eletrodo 6013</text></svg>'
  },
  'IPAS04': { 
    mlb: 'MLB2882967139', 
    title: 'Arame Solda Mig Tubular Uso Sem Gás 0.8mm',
    image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" style="background:%234a5568"><text x="200" y="200" text-anchor="middle" dy=".35em" fill="white" font-family="Arial,sans-serif" font-size="18">Arame Tubular</text></svg>'
  },
  
  // IPP codes - Pisos vinílicos com imagens base64 
  'IPP-PV-01': { 
    mlb: 'MLB4100879553', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Carvalho',
    image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" style="background:%238B4513"><text x="200" y="200" text-anchor="middle" dy=".35em" fill="white" font-family="Arial,sans-serif" font-size="16">Piso Carvalho</text></svg>'
  },
  'IPP-PV-02': { 
    mlb: 'MLB4100879555', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Castanho',
    image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" style="background:%23A0522D"><text x="200" y="200" text-anchor="middle" dy=".35em" fill="white" font-family="Arial,sans-serif" font-size="16">Piso Castanho</text></svg>'
  },
  'IPP-PV-03': { 
    mlb: 'MLB4100879557', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Nogueira',
    image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" style="background:%238B4513"><text x="200" y="200" text-anchor="middle" dy=".35em" fill="white" font-family="Arial,sans-serif" font-size="16">Piso Nogueira</text></svg>'
  },
  'IPP-PV-04': { 
    mlb: 'MLB4100879559', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Cumaru',
    image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" style="background:%23D2691E"><text x="200" y="200" text-anchor="middle" dy=".35em" fill="white" font-family="Arial,sans-serif" font-size="16">Piso Cumaru</text></svg>'
  },
  'IPP-PV-05': { 
    mlb: 'MLB4100879561', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Ipê',
    image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" style="background:%23CD853F"><text x="200" y="200" text-anchor="middle" dy=".35em" fill="white" font-family="Arial,sans-serif" font-size="18">Piso Ipê</text></svg>'
  }
};

// Note: fetchMLItem function removed - causes 403 errors, using direct URLs instead

// Update all ML product images with REAL API images
router.post('/update-ml-images', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    console.log('🚀 Starting REAL ML image update process using API...');
    
    let updatedCount = 0;
    let errorCount = 0;
    const updates: any[] = [];
    
    // Import the ML lookup service
    const { mercadoLivreLookupService } = await import('../services/mercadolivre-lookup.service');
    
    // Step 1: Get all ML products from database
    const mlProductsQuery = `
      SELECT asin, sku, title, marketplace_id, image_url, image_source_url
      FROM products 
      WHERE marketplace_id = 'MLB' 
         OR asin LIKE 'MLB%' 
         OR sku LIKE 'IPP%' 
         OR sku LIKE 'IPAS%'
      ORDER BY asin
    `;
    
    const mlProducts = await pool.query(mlProductsQuery);
    console.log(`📦 Found ${mlProducts.rows.length} ML products to process`);
    
    // Step 2: Process each product to get real images
    for (const product of mlProducts.rows) {
      const { asin, sku, title } = product;
      
      console.log(`🔄 Processing: ${asin} (SKU: ${sku})`);
      
      try {
        let mlbCode = null;
        let realImageUrl = null;
        
        // Determine MLB code to use
        if (asin.startsWith('MLB')) {
          mlbCode = asin;
        } else if (ML_PRODUCT_MAPPINGS[asin] || ML_PRODUCT_MAPPINGS[sku]) {
          // Use mapping for known products
          const mapping = ML_PRODUCT_MAPPINGS[asin] || ML_PRODUCT_MAPPINGS[sku];
          mlbCode = mapping.mlb;
        } else {
          // Try to find MLB code using lookup service
          mlbCode = await mercadoLivreLookupService.findMLBForSKU(sku, title);
        }
        
        if (!mlbCode) {
          console.warn(`⚠️ No MLB code found for ${asin} (${sku})`);
          errorCount++;
          continue;
        }
        
        console.log(`🔍 Using MLB code: ${mlbCode}`);
        
        // Get real image from ML API
        realImageUrl = await mercadoLivreLookupService.getHighQualityImage(mlbCode);
        
        if (!realImageUrl) {
          console.warn(`⚠️ No image found for MLB: ${mlbCode}`);
          errorCount++;
          continue;
        }
        
        console.log(`✅ Found real image: ${realImageUrl.substring(0, 80)}...`);
        
        // Update database with real image URL
        const updateResult = await pool.query(
          `UPDATE products 
           SET image_url = $1, image_source_url = $2, asin = $3, updated_at = NOW()
           WHERE asin = $4 OR sku = $4`,
          [realImageUrl, realImageUrl, mlbCode, asin]
        );
        
        if (updateResult.rowCount && updateResult.rowCount > 0) {
          updatedCount += updateResult.rowCount;
          updates.push({ 
            originalASIN: asin,
            newMLB: mlbCode,
            sku,
            status: 'updated',
            imageUrl: realImageUrl.substring(0, 100) + '...'
          });
          console.log(`✅ Updated ${updateResult.rowCount} rows for ${asin} -> ${mlbCode}`);
        }
        
        // Add delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error: any) {
        console.error(`❌ Error processing ${asin}:`, error.message);
        errorCount++;
      }
    }
    
    // Clear image cache to force refresh
    imageCache.flushAll();
    console.log('✅ Image cache cleared');
    
    res.json({
      success: true,
      message: 'Real ML images updated successfully using API',
      stats: {
        processed: mlProducts.rows.length,
        updated: updatedCount,
        errors: errorCount,
        successRate: mlProducts.rows.length > 0 ? ((updatedCount / mlProducts.rows.length) * 100).toFixed(2) + '%' : '0%'
      },
      updates: updates.slice(0, 20) // Return first 20 updates as sample
    });
    
  } catch (error) {
    console.error('Error updating ML images with real API:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update ML images with real API',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Clear image cache endpoint
router.post('/clear-cache', requireAuthOrApiKey, (_req: Request, res: Response) => {
  imageCache.flushAll();
  console.log('✅ Image cache cleared via API');
  res.json({ success: true, message: 'Image cache cleared successfully' });
});

// Get ML image status
router.get('/ml-status', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN image_url IS NOT NULL AND LENGTH(image_url) > 10 THEN 1 END) as with_images,
        COUNT(CASE WHEN image_url IS NULL OR LENGTH(image_url) < 10 THEN 1 END) as without_images
      FROM products
      WHERE marketplace_id = 'MLB' OR asin LIKE 'MLB%' OR asin LIKE 'IPP%' OR asin LIKE 'IPA%'
    `);
    
    const stats = result.rows[0];
    
    res.json({
      success: true,
      stats: {
        total: parseInt(stats.total),
        withImages: parseInt(stats.with_images),
        withoutImages: parseInt(stats.without_images),
        percentage: stats.total > 0 ? (stats.with_images / stats.total * 100).toFixed(2) + '%' : '0%'
      }
    });
  } catch (error) {
    console.error('Error getting ML status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ML image status'
    });
  }
});

// Sync all tables with correct MLB codes
router.post('/sync-all-tables', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    console.log('🚀 Starting complete database synchronization...');
    
    const ML_SYNC_MAPPINGS = {
      'IPP-PV-01': 'MLB4100879553',
      'IPP-PV-02': 'MLB4100879555', 
      'IPP-PV-03': 'MLB4100879557',
      'IPP-PV-04': 'MLB4100879559',
      'IPP-PV-05': 'MLB4100879561',
      'IPAS01': 'MLB3628967960',
      'IPAS02': 'MLB4258563772', 
      'IPAS04': 'MLB2882967139'
    };

    await pool.query('BEGIN');
    let totalUpdated = 0;

    for (const [sku, correctMLB] of Object.entries(ML_SYNC_MAPPINGS)) {
      console.log(`🔧 Syncing ${sku} -> ${correctMLB}`);

      // Update products table
      const productResult = await pool.query(
        'UPDATE products SET asin = $1 WHERE sku = $2 OR asin LIKE $3',
        [correctMLB, sku, `%${sku}%`]
      );

      // Update order_items table (this is the key fix!)
      const orderItemsResult = await pool.query(
        'UPDATE order_items SET asin = $1 WHERE seller_sku = $2 OR asin LIKE $3',
        [correctMLB, sku, `%${sku}%`]
      );

      const updated = (productResult.rowCount || 0) + (orderItemsResult.rowCount || 0);
      totalUpdated += updated;
      
      console.log(`  ✅ Updated ${updated} rows (products: ${productResult.rowCount || 0}, order_items: ${orderItemsResult.rowCount || 0})`);
    }

    await pool.query('COMMIT');
    console.log(`🎉 COMPLETE SYNC FINISHED! Updated ${totalUpdated} total rows`);

    // Clear image cache
    imageCache.flushAll();
    console.log('✅ Image cache cleared after sync');

    res.json({
      success: true,
      message: 'Database synchronization completed successfully',
      totalUpdated,
      clearedCache: true
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Sync failed:', error);
    res.status(500).json({
      success: false,
      error: 'Database synchronization failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;