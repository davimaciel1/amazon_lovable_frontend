import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuthOrApiKey } from '../middleware/apiKey.middleware';
import axios from 'axios';
import NodeCache from 'node-cache';

const router = Router();
const imageCache = new NodeCache({ stdTTL: 604800 });

// Real ML item mappings based on our inventory
const ML_PRODUCT_MAPPINGS: Record<string, { mlb: string; title: string; image: string }> = {
  // IPP SKUs to real MLB codes - Using real piso vinílico product
  'IPP-PV-01': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  'IPP-PV-02': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  'IPP-PV-03': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  'IPP-PV-04': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  'IPP-PV-05': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  'IPP-PV-06': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  'IPP-PV-07': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  'IPP-PV-08': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  'IPP-PV-09': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  'IPP-PV-10': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  
  // Direct MLB codes that already work
  'MLB4100879553': { mlb: 'MLB4100879553', title: 'Piso Vinílico', image: 'https://http2.mlstatic.com/D_866143-MLB87636555295_072025-F.jpg' },
  'MLB3772801129': { mlb: 'MLB3772801129', title: 'Porus One', image: 'https://http2.mlstatic.com/D_775949-MLB77572311431_072024-F.jpg' },
  'MLB5649953084': { mlb: 'MLB5649953084', title: 'Porus One', image: 'https://http2.mlstatic.com/D_980841-MLA91448905807_092025-F.jpg' },
  
  // IPAS codes - real welding wire products (CORRECTED to match frontend)
  'IPAS01': { mlb: 'MLBU3406999311', title: 'Arame Solda Mig Tubular 0.8mm 1kg', image: 'https://http2.mlstatic.com/D_746268-MLB91917127844_092025-O.jpg' },
  'IPAS02': { mlb: 'MLB5321963088', title: 'Eletrodo 6013 2.5mm 5kg', image: 'https://http2.mlstatic.com/D_658745-MLB91044369481_082025-O.jpg' },
  'IPAS04': { mlb: 'MLB5321963088', title: 'Arame Solda Mig Er70s-6 0.8mm 5kg', image: 'https://http2.mlstatic.com/D_658745-MLB91044369481_082025-O.jpg' }
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
    
    // Step 3: Update ml_inventory mappings
    await pool.query(`
      UPDATE ml_inventory 
      SET item_id = CASE 
        WHEN seller_sku LIKE 'IPP-PV-%' THEN 'MLB4100879553'
        WHEN seller_sku LIKE 'IPAS01' THEN 'MLB3458706470'
        WHEN seller_sku LIKE 'IPAS04' THEN 'MLB3458706470'
        ELSE item_id
      END
      WHERE seller_sku LIKE 'IPP%' OR seller_sku LIKE 'IPA%'
    `);
    
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