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
    // Get product images for known ASINs in sales
    const result = await pool.query(`
      SELECT DISTINCT p.asin, p.title, p.image_url
      FROM products p
      WHERE p.asin IN ('B0CLBHB46K', 'B0CLBR3ZCN', 'B0CLBFSQH1')
    `);
    
    console.log('Product images for sales ASINs:');
    console.log('=====================================\n');
    result.rows.forEach(row => {
      console.log('ASIN:', row.asin);
      console.log('Title:', row.title?.substring(0, 60) + '...');
      console.log('Image URL:', row.image_url);
      console.log('---');
    });
    
    // Also check if we need to add these products
    const checkResult = await pool.query(`
      SELECT asin FROM products WHERE asin IN ('B0CLBHB46K', 'B0CLBR3ZCN', 'B0CLBFSQH1')
    `);
    
    const existingASINs = checkResult.rows.map(r => r.asin);
    const salesASINs = ['B0CLBHB46K', 'B0CLBR3ZCN', 'B0CLBFSQH1'];
    const missingASINs = salesASINs.filter(a => !existingASINs.includes(a));
    
    if (missingASINs.length > 0) {
      console.log('\nMissing ASINs in products table:', missingASINs);
      
      // Add missing products
      for (const asin of missingASINs) {
        const imageUrl = 'https://m.media-amazon.com/images/I/71bnsDdIRAL._AC_SL1500_.jpg'; // Default knife image
        await pool.query(`
          INSERT INTO products (asin, sku, title, image_url, price, currency_code, in_stock, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          ON CONFLICT (asin) DO UPDATE SET image_url = $4, updated_at = NOW()
        `, [asin, asin, `Cutting Board Product ${asin}`, imageUrl, 29.99, 'USD', true]);
        
        console.log(`Added product ${asin} with image`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
})();