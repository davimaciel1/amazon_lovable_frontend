import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuthOrApiKey } from '../middleware/apiKey.middleware';
import NodeCache from 'node-cache';

const router = Router();
const imageCache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

// ============================================================================
// 🚫 NEVER USE HARDCODED/FAKE DATA - ONLY REAL API DATA
// ============================================================================
// 
// ALL PRODUCT DATA MUST COME FROM MERCADO LIVRE API
// NO INVENTED MLB CODES, NO FAKE IMAGES, NO MOCK DATA
//
// ============================================================================

// Delete all fake/hardcoded MLB products from database
router.delete('/clean-fake-products', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    console.log('🗑️ Deleting ALL fake MLB codes and hardcoded data...');
    
    await pool.query('BEGIN');
    
    // Step 1: Delete products with fake/invalid MLB codes
    const fakeMLBCodes = [
      'MLB3628967960', 'MLB4258563772', 'MLB2882967139',
      'MLB4100879555', 'MLB4100879557', 'MLB4100879559', 'MLB4100879561'
    ];
    
    const fakeProducts = ['IPAS01', 'IPAS02', 'IPAS04', 'IPP-PV-02', 'IPP-PV-04', 'IPP-PV-05'];
    
    let deletedCount = 0;
    
    // Delete by fake MLB codes
    for (const fakeCode of fakeMLBCodes) {
      const result = await pool.query('DELETE FROM products WHERE asin = $1', [fakeCode]);
      deletedCount += result.rowCount || 0;
      console.log(`🗑️ Deleted ${result.rowCount || 0} products with fake MLB code: ${fakeCode}`);
    }
    
    // Delete by fake product SKUs (check both ASIN and SKU columns)
    for (const fakeSku of fakeProducts) {
      const result = await pool.query(
        'DELETE FROM products WHERE (asin = $1 OR sku = $1) AND marketplace_id = \'MLB\'', 
        [fakeSku]
      );
      deletedCount += result.rowCount || 0;
      console.log(`🗑️ Deleted ${result.rowCount || 0} products with fake SKU: ${fakeSku}`);
    }
    
    // Step 2: Clean orphaned order items
    const orphanResult = await pool.query(`
      DELETE FROM order_items 
      WHERE asin NOT IN (SELECT asin FROM products WHERE asin IS NOT NULL)
    `);
    
    await pool.query('COMMIT');
    
    // Clear all caches
    imageCache.flushAll();
    
    console.log(`✅ Cleanup completed: ${deletedCount} fake products deleted, ${orphanResult.rowCount || 0} orphaned items cleaned`);
    
    res.json({
      success: true,
      message: 'All fake MLB codes and hardcoded data deleted successfully',
      stats: {
        fakeProductsDeleted: deletedCount,
        orphanedItemsDeleted: orphanResult.rowCount || 0
      }
    });
    
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete fake products',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Sync products with REAL Mercado Livre API data
router.post('/sync-real-ml-products', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    console.log('🚀 Starting 100% REAL ML product synchronization from API...');
    
    let syncedCount = 0;
    let errorCount = 0;
    const syncResults: any[] = [];
    
    // Import the ML lookup service
    const { mercadoLivreLookupService } = await import('../services/mercadolivre-lookup.service');
    
    // Get products that need ML data (real products only)
    const productsQuery = `
      SELECT asin, sku, title, marketplace_id, image_url
      FROM products 
      WHERE marketplace_id = 'MLB' 
        AND (image_url IS NULL OR image_url LIKE '%/app/product-images/SVB%')
      ORDER BY sku
      LIMIT 20
    `;
    
    const products = await pool.query(productsQuery);
    console.log(`📦 Found ${products.rows.length} products needing real ML data`);
    
    // Process each product to get REAL data from ML API
    for (const product of products.rows) {
      const { asin, sku, title } = product;
      
      try {
        console.log(`🔍 Searching REAL ML API for: ${sku} - ${title}`);
        
        // Skip fake SKUs - delete them instead
        if (['IPAS01', 'IPAS02', 'IPAS04', 'IPP-PV-02', 'IPP-PV-04', 'IPP-PV-05'].includes(sku)) {
          await pool.query('DELETE FROM products WHERE sku = $1', [sku]);
          syncResults.push({ sku, status: 'deleted_fake_product', title });
          console.log(`🗑️ Deleted fake product: ${sku}`);
          continue;
        }
        
        // Search for REAL MLB code using product title/SKU
        const realMLBCode = await mercadoLivreLookupService.findMLBForSKU(sku, title);
        
        if (!realMLBCode || !realMLBCode.startsWith('MLB')) {
          console.log(`⚠️ No valid real MLB code found for ${sku} in ML API`);
          syncResults.push({ sku, status: 'no_real_mlb_found', title });
          errorCount++;
          continue;
        }
        
        // Get REAL image URL from ML API
        const realImageUrl = await mercadoLivreLookupService.getHighQualityImage(realMLBCode);
        
        if (!realImageUrl || realImageUrl.includes('placeholder') || realImageUrl.includes('data:image')) {
          console.log(`⚠️ No real image found for ${realMLBCode} in ML API`);
          syncResults.push({ sku, mlbCode: realMLBCode, status: 'no_real_image', title });
          errorCount++;
          continue;
        }
        
        // Update with 100% REAL data from API
        await pool.query(
          `UPDATE products 
           SET asin = $1, 
               image_url = $2, 
               image_source_url = $2,
               updated_at = NOW()
           WHERE sku = $3 AND marketplace_id = 'MLB'`,
          [realMLBCode, realImageUrl, sku]
        );
        
        syncedCount++;
        syncResults.push({
          sku,
          oldAsin: asin,
          newAsin: realMLBCode,
          imageUrl: realImageUrl.substring(0, 80) + '...',
          title,
          status: 'synced_with_real_api_data'
        });
        
        console.log(`✅ Synced ${sku} with REAL ML API data: ${realMLBCode}`);
        
        // Rate limiting for API respect
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error: any) {
        console.error(`❌ Error syncing ${sku}:`, error.message);
        syncResults.push({ sku, status: 'api_error', error: error.message, title });
        errorCount++;
      }
    }
    
    // Clear all caches to force immediate refresh
    imageCache.flushAll();
    console.log('✅ All caches cleared - real images will show immediately');
    
    console.log(`🎉 REAL SYNC COMPLETED! ${syncedCount} synced with real data, ${errorCount} errors`);
    
    res.json({
      success: true,
      message: '100% Real ML product synchronization completed',
      stats: {
        totalProcessed: products.rows.length,
        syncedWithRealData: syncedCount,
        errors: errorCount,
        successRate: products.rows.length > 0 ? 
          ((syncedCount / products.rows.length) * 100).toFixed(2) + '%' : '0%'
      },
      results: syncResults,
      note: 'ALL data sourced directly from Mercado Livre API - ZERO hardcoded/fake data'
    });
    
  } catch (error) {
    console.error('❌ Real ML sync failed:', error);
    res.status(500).json({
      success: false,
      error: 'Real ML product synchronization failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Automated validation and cleanup system
router.post('/validate-and-clean-data', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    console.log('🔍 Starting comprehensive data validation and cleanup...');
    
    const issues: any[] = [];
    let cleanedCount = 0;
    
    // Step 1: Find and remove products with invalid image URLs
    const invalidImagesQuery = `
      SELECT asin, sku, title, image_url
      FROM products 
      WHERE marketplace_id = 'MLB' 
        AND (
          image_url IS NULL OR
          image_url LIKE '%/app/product-images/SVB%' OR
          image_url LIKE 'data:image/svg+xml%'
        )
    `;
    
    const invalidImages = await pool.query(invalidImagesQuery);
    
    for (const product of invalidImages.rows) {
      const { asin, sku } = product;
      
      // Delete products with error images instead of trying to fix fake data
      await pool.query('DELETE FROM products WHERE asin = $1 OR sku = $1', [sku]);
      cleanedCount++;
      
      issues.push({
        type: 'invalid_image_deleted',
        sku,
        asin,
        action: 'Product deleted - had invalid/fake image'
      });
      
      console.log(`🗑️ Deleted product with invalid image: ${sku}`);
    }
    
    // Step 2: Check for duplicate images (multiple products using same image)
    const duplicateImagesQuery = `
      SELECT image_url, array_agg(asin) as asins, COUNT(*) as count
      FROM products 
      WHERE image_url IS NOT NULL 
        AND marketplace_id = 'MLB'
      GROUP BY image_url 
      HAVING COUNT(*) > 1
    `;
    
    const duplicates = await pool.query(duplicateImagesQuery);
    
    for (const duplicate of duplicates.rows) {
      issues.push({
        type: 'duplicate_image_detected',
        imageUrl: duplicate.image_url,
        asins: duplicate.asins,
        count: duplicate.count,
        action: 'Multiple products using same image - requires manual review'
      });
    }
    
    // Clear cache
    imageCache.flushAll();
    
    console.log(`🎉 VALIDATION COMPLETED! Cleaned ${cleanedCount} invalid products, found ${issues.length} total issues`);
    
    res.json({
      success: true,
      message: 'Data validation and cleanup completed',
      stats: {
        invalidProductsCleaned: cleanedCount,
        totalIssuesFound: issues.length,
        duplicateImagesFound: duplicates.rows.length
      },
      issues: issues.slice(0, 50), // First 50 issues
      guidelines: {
        "SYSTEM_RULES": [
          "NO hardcoded images or SVG data",
          "NO invented MLB codes or fake products", 
          "ALL data must come from real ML API",
          "Delete invalid products instead of fixing fake data"
        ]
      }
    });
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Data validation failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;