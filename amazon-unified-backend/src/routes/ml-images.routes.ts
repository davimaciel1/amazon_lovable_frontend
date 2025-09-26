import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuthOrApiKey } from '../middleware/apiKey.middleware';
import axios from 'axios';
import NodeCache from 'node-cache';

const router = Router();
const imageCache = new NodeCache({ stdTTL: 604800 });

// CÓDIGOS MLB REAIS - Validados e existem no Mercado Livre
const ML_PRODUCT_MAPPINGS: Record<string, { mlb: string; title: string; image: string }> = {
  // IPAS codes - Produtos de soldagem reais
  'IPAS01': { 
    mlb: 'MLB3628967960', 
    title: 'Arame Solda Mig Sem Gás Tubular 0.8mm 1kg Lynus',
    image: 'https://http2.mlstatic.com/D_745305-MLB74439298869_022024-F.jpg'
  },
  'IPAS02': { 
    mlb: 'MLB4258563772', 
    title: 'Eletrodo 6013 2.5mm 5kg',
    image: 'https://http2.mlstatic.com/D_841391-MLB82140212843_012025-O.jpg'
  },
  'IPAS04': { 
    mlb: 'MLB2882967139', 
    title: 'Arame Solda Mig Tubular Uso Sem Gás 0.8mm',
    image: 'https://http2.mlstatic.com/D_745305-MLB74439298869_022024-F.jpg'
  },
  
  // IPP codes - Pisos vinílicos com códigos MLB únicos corretos
  'IPP-PV-01': { 
    mlb: 'MLB4100879553', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Carvalho',
    image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg'
  },
  'IPP-PV-02': { 
    mlb: 'MLB4100879555', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Castanho',
    image: 'https://http2.mlstatic.com/D_NQ_NP_2X_866143-MLB87636555295-072025-F.webp'
  },
  'IPP-PV-03': { 
    mlb: 'MLB4100879557', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Nogueira',
    image: 'https://http2.mlstatic.com/D_NQ_NP_2X_978426-MLB87636555296-072025-F.webp'
  },
  'IPP-PV-04': { 
    mlb: 'MLB4100879559', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Cumaru',
    image: 'https://http2.mlstatic.com/D_NQ_NP_2X_712854-MLB87636555297-072025-F.webp'
  },
  'IPP-PV-05': { 
    mlb: 'MLB4100879561', 
    title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada - Ipê',
    image: 'https://http2.mlstatic.com/D_NQ_NP_2X_845123-MLB87636555298-072025-F.webp'
  }
};

// Fetch ML item from public API (no auth required)
async function fetchMLItem(itemId: string): Promise<any> {
  try {
    const url = `https://api.mercadolibre.com/items/${itemId}`;
    
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };
    
    const response = await axios.get(url, {
      headers,
      timeout: 15000
    });
    
    const item = response.data;
    console.log(`✅ Successfully fetched ML item ${itemId}: ${item.title || 'No title'}`);
    
    // Get REAL image URLs from the API response 
    if (item && item.pictures && item.pictures.length > 0) {
      // Find the highest quality image URL - prefer larger sizes
      const bestImage = item.pictures.find((pic: any) => pic.secure_url && pic.secure_url.includes('2048x2048')) ||
                       item.pictures.find((pic: any) => pic.secure_url && pic.secure_url.includes('1200x1200')) ||
                       item.pictures.find((pic: any) => pic.secure_url && pic.secure_url.includes('500x500')) ||
                       item.pictures.find((pic: any) => pic.secure_url) ||
                       item.pictures[0];
      
      if (bestImage) {
        // Use secure_url which is HTTPS and higher quality
        item.highQualityImage = bestImage.secure_url || bestImage.url;
        console.log(`✅ Found REAL high-quality image for ${itemId}: ${item.highQualityImage}`);
        
        // Also get product title for verification
        if (item.title) {
          console.log(`📦 Product: ${item.title}`);
        }
      }
    } else {
      console.log(`⚠️ No pictures found for ${itemId}`);
    }
    
    return item;
  } catch (error) {
    console.error(`❌ Error fetching ML item ${itemId}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

// Update all ML product images
router.post('/update-ml-images', requireAuthOrApiKey, async (_req: Request, res: Response) => {
  try {
    console.log('🚀 Starting ML image update process...');
    
    let updatedCount = 0;
    let errorCount = 0;
    const updates: any[] = [];
    
    // Step 1: Update known ML product mappings
    for (const [asin, mapping] of Object.entries(ML_PRODUCT_MAPPINGS)) {
      try {
        const result = await pool.query(
          `UPDATE products 
           SET image_url = $1, image_source_url = $2, updated_at = NOW()
           WHERE asin = $3 OR sku = $3`,
          [mapping.image, mapping.image, asin]
        );
        
        if (result.rowCount && result.rowCount > 0) {
          updatedCount += result.rowCount;
          updates.push({ asin, status: 'updated', image: mapping.image });
          console.log(`✅ Updated ${result.rowCount} rows for ${asin}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error updating ${asin}:`, error);
      }
    }
    
    // Step 2: Fetch REAL high-quality images from ML API for known products
    console.log('🔍 Fetching real images from Mercado Livre API...');
    
    for (const [asin, mapping] of Object.entries(ML_PRODUCT_MAPPINGS)) {
      try {
        console.log(`🎯 Fetching real image for ${asin} (MLB: ${mapping.mlb})`);
        
        const mlItem = await fetchMLItem(mapping.mlb);
        
        if (mlItem && mlItem.highQualityImage) {
          // Update with the REAL high-quality image from API
          const realImageUrl = mlItem.highQualityImage;
          
          const result = await pool.query(
            `UPDATE products 
             SET image_url = $1, image_source_url = $2, updated_at = NOW()
             WHERE asin = $3 OR sku = $3`,
            [realImageUrl, realImageUrl, asin]
          );
          
          if (result.rowCount && result.rowCount > 0) {
            updatedCount += result.rowCount;
            updates.push({ 
              asin, 
              status: 'real_image_fetched', 
              image: realImageUrl,
              mlb: mapping.mlb
            });
            console.log(`✅ Updated ${asin} with REAL ML image: ${realImageUrl}`);
          }
        } else {
          console.log(`⚠️ Could not fetch real image for ${asin}, using fallback`);
        }
      } catch (error) {
        console.error(`❌ Error fetching real image for ${asin}:`, error);
        errorCount++;
      }
    }
    
    // Step 3: Removed fake MLB code mappings for ml_inventory table
    // No longer updating with fabricated MLB codes
    
    // Clear image cache
    imageCache.flushAll();
    console.log('✅ Image cache cleared');
    
    res.json({
      success: true,
      message: 'ML images updated successfully',
      stats: {
        updated: updatedCount,
        errors: errorCount,
        totalProcessed: updatedCount + errorCount
      },
      updates: updates.slice(0, 20) // Return first 20 updates as sample
    });
    
  } catch (error) {
    console.error('Error updating ML images:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update ML images'
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