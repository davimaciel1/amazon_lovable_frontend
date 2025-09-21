import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuthOrApiKey } from '../middleware/apiKey.middleware';
import axios from 'axios';
import NodeCache from 'node-cache';

const router = Router();
const imageCache = new NodeCache({ stdTTL: 604800 });

// REMOVED ALL FAKE MLB CODE MAPPINGS - Only real MLB codes allowed now
const ML_PRODUCT_MAPPINGS: Record<string, { mlb: string; title: string; image: string }> = {
  // Only keep mappings for real MLB codes that actually exist on Mercado Livre
  // All previous mappings with fabricated codes have been removed for data accuracy
};

// Fetch ML item from API with authentication
async function fetchMLItem(itemId: string): Promise<any> {
  try {
    const token = process.env.ML_ACCESS_TOKEN;
    const url = `https://api.mercadolibre.com/items/${itemId}`;
    
    const headers: any = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await axios.get(url, {
      headers,
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error fetching ML item ${itemId}:`, error);
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
    
    // Step 2: Find remaining ML products without images and update them
    const remainingResult = await pool.query(`
      SELECT DISTINCT asin, sku, title, marketplace_id
      FROM products
      WHERE (marketplace_id = 'MLB' OR asin LIKE 'MLB%' OR asin LIKE 'IPP%' OR asin LIKE 'IPA%')
        AND (image_url IS NULL OR image_url = '' OR LENGTH(image_url) < 10)
      ORDER BY asin
    `);
    
    for (const product of remainingResult.rows) {
      // Try to fetch from ML API if it's a valid MLB code
      if (product.asin && product.asin.startsWith('MLB')) {
        const mlItem = await fetchMLItem(product.asin);
        
        if (mlItem && mlItem.pictures && mlItem.pictures.length > 0) {
          const imageUrl = mlItem.pictures[0].secure_url || mlItem.pictures[0].url;
          
          await pool.query(
            `UPDATE products SET image_url = $1, image_source_url = $2, updated_at = NOW() WHERE asin = $3`,
            [imageUrl, imageUrl, product.asin]
          );
          
          updatedCount++;
          updates.push({ asin: product.asin, status: 'fetched', image: imageUrl });
          console.log(`✅ Updated ${product.asin} with ML image`);
        } else {
          // Use a default ML image
          const defaultImage = 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg';
          await pool.query(
            `UPDATE products SET image_url = $1, image_source_url = $2, updated_at = NOW() WHERE asin = $3`,
            [defaultImage, defaultImage, product.asin]
          );
          updatedCount++;
          updates.push({ asin: product.asin, status: 'default', image: defaultImage });
        }
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

export default router;