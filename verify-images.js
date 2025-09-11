const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: process.env.DB_PORT || 5456,
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123'
});

(async () => {
  try {
    const result = await pool.query(`
      SELECT asin, title, image_url, price 
      FROM products 
      WHERE image_url NOT LIKE '%placeholder%' 
      AND image_url NOT LIKE '%01RmK+J4pJL%'
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    
    console.log('Products with updated images:');
    console.log('==============================\n');
    
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ASIN: ${row.asin}`);
      console.log(`   Title: ${row.title?.substring(0, 60)}...`);
      console.log(`   Price: $${row.price}`);
      console.log(`   Image: ${row.image_url}`);
      console.log('');
    });
    
    // Check image diversity
    const uniqueImages = new Set(result.rows.map(r => r.image_url));
    console.log(`Unique images: ${uniqueImages.size} out of ${result.rows.length} products`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
})();