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
      SELECT 
        id, 
        asin, 
        title, 
        main_image_url,
        CASE 
          WHEN main_image_url IS NULL THEN 'NULL'
          WHEN main_image_url = '' THEN 'EMPTY'
          WHEN main_image_url LIKE '%placeholder%' THEN 'PLACEHOLDER'
          ELSE 'HAS_URL'
        END as image_status
      FROM products 
      ORDER BY updated_at DESC 
      LIMIT 20
    `);
    
    console.log('Product Images Status:');
    console.log('======================');
    result.rows.forEach(row => {
      console.log(`ASIN: ${row.asin}`);
      console.log(`Title: ${row.title?.substring(0, 50)}...`);
      console.log(`Image URL: ${row.main_image_url || 'NULL'}`);
      console.log(`Status: ${row.image_status}`);
      console.log('---');
    });
    
    // Count by status
    const countResult = await pool.query(`
      SELECT 
        CASE 
          WHEN main_image_url IS NULL THEN 'NULL'
          WHEN main_image_url = '' THEN 'EMPTY'
          WHEN main_image_url LIKE '%placeholder%' THEN 'PLACEHOLDER'
          ELSE 'HAS_URL'
        END as image_status,
        COUNT(*) as count
      FROM products 
      GROUP BY image_status
    `);
    
    console.log('\nImage Status Summary:');
    console.log('====================');
    countResult.rows.forEach(row => {
      console.log(`${row.image_status}: ${row.count} products`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
})();