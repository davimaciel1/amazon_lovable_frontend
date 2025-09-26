import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuthOrApiKey } from '../middleware/apiKey.middleware';
import NodeCache from 'node-cache';

const router = Router();
const imageCache = new NodeCache({ stdTTL: 604800 });

// MLB Code mappings for products (WITHOUT hardcoded images)
const ML_PRODUCT_MAPPINGS: Record<string, { mlb: string; title: string }> = {
  // IPAS codes - Produtos de soldagem 
  'IPAS01': { 
    mlb: 'MLB3628967960', 
    title: 'Arame Solda Mig Sem Gás Tubular 0.8mm 1kg Lynus'
  },
  'IPAS02': { 
    mlb: 'MLB4258563772', 
    title: 'Eletrodo 6013 2.5mm 5kg'
  },
  'IPAS04': { 
    mlb: 'MLB2882967139', 
    title: 'Arame Solda Mig Tubular Uso Sem Gás 0.8mm'
  },
  
  // IPP codes - Pisos vinílicos
  'IPP-PV-01': { 
    mlb: 'MLB4100879553', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Carvalho'
  },
  'IPP-PV-02': { 
    mlb: 'MLB4100879555', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Castanho'
  },
  'IPP-PV-03': { 
    mlb: 'MLB4100879557', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Nogueira'
  },
  'IPP-PV-04': { 
    mlb: 'MLB4100879559', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Cumaru'
  },
  'IPP-PV-05': { 
    mlb: 'MLB4100879561', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Ipê'
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

// Clean fake/invented products from database
router.post('/clean-fake-products', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    console.log('🧹 Starting cleanup of fake/invented products...');
    
    await pool.query('BEGIN');
    
    // Products to remove completely (fake/invented)
    const fakeProducts = ['B0CLBFSQH1', 'MLB5649953084', 'MLB4061138537'];
    
    // Products with hardcoded SVG images to clean
    const svgProducts = ['IPAS01', 'IPAS02', 'IPAS03', 'IPAS04', 'IPP-PV-02', 'IPP-PV-04', 'IPP-PV-05'];
    
    let removedCount = 0;
    let cleanedCount = 0;
    
    // Remove fake products from order_items
    for (const asin of fakeProducts) {
      const orderItemsResult = await pool.query('DELETE FROM order_items WHERE asin = $1', [asin]);
      console.log(`🗑️ Removed ${orderItemsResult.rowCount || 0} order items for fake product ${asin}`);
    }
    
    // Remove fake products from products table
    for (const asin of fakeProducts) {
      const productResult = await pool.query('DELETE FROM products WHERE asin = $1', [asin]);
      removedCount += productResult.rowCount || 0;
      console.log(`🗑️ Removed ${productResult.rowCount || 0} fake products for ${asin}`);
    }
    
    // Clean SVG images from products
    for (const asin of svgProducts) {
      const svgResult = await pool.query(
        `UPDATE products 
         SET image_url = NULL, image_source_url = NULL 
         WHERE (asin = $1 OR sku = $1) AND image_url LIKE 'data:image/svg+xml%'`,
        [asin]
      );
      cleanedCount += svgResult.rowCount || 0;
      console.log(`🧽 Cleaned ${svgResult.rowCount || 0} SVG images for ${asin}`);
    }
    
    // Remove orphaned orders
    const orphanedOrdersResult = await pool.query(`
      DELETE FROM orders 
      WHERE amazon_order_id NOT IN (
        SELECT DISTINCT order_id 
        FROM order_items 
        WHERE order_id IS NOT NULL
      )
    `);
    console.log(`🗑️ Removed ${orphanedOrdersResult.rowCount || 0} orphaned orders`);
    
    await pool.query('COMMIT');
    
    // Clear image cache
    imageCache.flushAll();
    console.log('✅ Image cache cleared after cleanup');
    
    console.log(`🎉 CLEANUP COMPLETED! Removed ${removedCount} fake products, cleaned ${cleanedCount} SVG images`);
    
    res.json({
      success: true,
      message: 'Fake products and hardcoded images cleaned successfully',
      stats: {
        fakeProductsRemoved: removedCount,
        svgImagesCleaned: cleanedCount,
        orphanedOrdersRemoved: orphanedOrdersResult.rowCount || 0
      }
    });
    
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;