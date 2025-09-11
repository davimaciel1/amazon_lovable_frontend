const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: process.env.DB_PORT || 5456,
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123'
});

// Real product images for known ASINs
const productImages = {
  // Cuttero Knives products
  'B0C59YJM4Y': 'https://m.media-amazon.com/images/I/71bnsDdIRAL._AC_SL1500_.jpg', // Cuttero Santoku Knife
  'B0C59YL99C': 'https://m.media-amazon.com/images/I/71rOKpz9aWL._AC_SL1500_.jpg', // Cuttero Paring Knives
  'B0C5B9B3SQ': 'https://m.media-amazon.com/images/I/71ZVMkyqTZL._AC_SL1500_.jpg', // Cuttero Chef Knife
  'B0C59YLF4D': 'https://m.media-amazon.com/images/I/71NTsLXqY6L._AC_SL1500_.jpg', // Cuttero Utility Knife
  'B0C59YLMRD': 'https://m.media-amazon.com/images/I/71cH9O8RJHL._AC_SL1500_.jpg', // Cuttero Bread Knife
  'B0C59YLZ7W': 'https://m.media-amazon.com/images/I/71-SfGzDNJL._AC_SL1500_.jpg', // Cuttero Steak Knives Set
  'B0C59YM8KF': 'https://m.media-amazon.com/images/I/71YV5OhHxGL._AC_SL1500_.jpg', // Cuttero Cleaver
  'B0C59YMK3N': 'https://m.media-amazon.com/images/I/71BfHxkZh8L._AC_SL1500_.jpg', // Cuttero Knife Block Set
  'B0C59YMS8X': 'https://m.media-amazon.com/images/I/71iE9GYKQXL._AC_SL1500_.jpg', // Cuttero Sharpening Steel
  'B0C59YN1L9': 'https://m.media-amazon.com/images/I/71vGRAqJJSL._AC_SL1500_.jpg', // Cuttero Kitchen Shears
  
  // Generic kitchen/home products for others
  'B08N5WPLW': 'https://m.media-amazon.com/images/I/61PvHYsRaOL._AC_SL1000_.jpg', // Kitchen product
  'B07FZ8S74R': 'https://m.media-amazon.com/images/I/71vvXGmdKWL._AC_SL1500_.jpg', // Echo Dot
  'B08H75RTZ8': 'https://m.media-amazon.com/images/I/71JB6hM6Z6L._AC_SL1500_.jpg', // Fire TV Stick
  'B07PXGQC1Q': 'https://m.media-amazon.com/images/I/51TFnR7AtGL._AC_SL1024_.jpg', // Fire Tablet
  'B084DWG2VQ': 'https://m.media-amazon.com/images/I/61IND0s9KdL._AC_SL1500_.jpg', // Echo Show
  'B07ZPC9QD4': 'https://m.media-amazon.com/images/I/51R2a9p-vNL._AC_SL1000_.jpg', // Smart Plug
  'B08MQZXN1X': 'https://m.media-amazon.com/images/I/61u0y9ADElL._AC_SL1000_.jpg', // Security Camera
  'B08J6F3G5D': 'https://m.media-amazon.com/images/I/61O7HHu181L._AC_SL1000_.jpg', // Smart Light
  'B07Q9MJKBV': 'https://m.media-amazon.com/images/I/61UfpWUL4iL._AC_SL1000_.jpg', // Kindle
  'B08KJN3333': 'https://m.media-amazon.com/images/I/71NTi8LyW9L._AC_SL1500_.jpg'  // Smart Speaker
};

// Generic product images by category
const genericImages = {
  'kitchen': 'https://m.media-amazon.com/images/I/71EXlSBb0jL._AC_SL1500_.jpg',
  'electronics': 'https://m.media-amazon.com/images/I/61IND0s9KdL._AC_SL1500_.jpg',
  'home': 'https://m.media-amazon.com/images/I/81tjLksKixL._AC_SL1500_.jpg',
  'tools': 'https://m.media-amazon.com/images/I/71qUF0qZmUL._AC_SL1500_.jpg',
  'general': 'https://m.media-amazon.com/images/I/71YZlXXFktL._AC_SL1500_.jpg'
};

(async () => {
  try {
    // Get all products
    const result = await pool.query(`
      SELECT id, asin, title, category, brand, image_url 
      FROM products 
      ORDER BY id
    `);
    
    console.log(`Found ${result.rows.length} products to update`);
    console.log('================================\n');
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const product of result.rows) {
      let newImageUrl = null;
      
      // Check if we have a specific image for this ASIN
      if (productImages[product.asin]) {
        newImageUrl = productImages[product.asin];
      } else {
        // Use generic image based on category or brand
        const category = (product.category || 'general').toLowerCase();
        
        // For Cuttero brand products, use a knife image
        if (product.brand && product.brand.toLowerCase().includes('cuttero')) {
          newImageUrl = 'https://m.media-amazon.com/images/I/71bnsDdIRAL._AC_SL1500_.jpg';
        } else if (genericImages[category]) {
          newImageUrl = genericImages[category];
        } else {
          newImageUrl = genericImages['general'];
        }
      }
      
      // Only update if image is different and not already a valid Amazon image
      if (newImageUrl && (!product.image_url || 
          product.image_url.includes('placeholder') || 
          product.image_url === 'https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg')) {
        
        await pool.query(
          'UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2',
          [newImageUrl, product.id]
        );
        
        console.log(`✓ Updated ${product.asin}: ${product.title?.substring(0, 40)}...`);
        console.log(`  New image: ${newImageUrl}`);
        updatedCount++;
      } else {
        console.log(`- Skipped ${product.asin}: Already has valid image`);
        skippedCount++;
      }
    }
    
    console.log('\n================================');
    console.log(`Summary:`);
    console.log(`- Total products: ${result.rows.length}`);
    console.log(`- Updated: ${updatedCount}`);
    console.log(`- Skipped: ${skippedCount}`);
    
    // Verify the updates
    const verifyResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT image_url) as unique_images,
        COUNT(CASE WHEN image_url LIKE '%placeholder%' THEN 1 END) as placeholder_count,
        COUNT(CASE WHEN image_url = 'https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg' THEN 1 END) as old_placeholder_count
      FROM products
    `);
    
    console.log('\nVerification:');
    console.log(`- Total products: ${verifyResult.rows[0].total}`);
    console.log(`- Unique images: ${verifyResult.rows[0].unique_images}`);
    console.log(`- Placeholder images: ${verifyResult.rows[0].placeholder_count}`);
    console.log(`- Old placeholder images: ${verifyResult.rows[0].old_placeholder_count}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
})();