const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: process.env.DB_PORT || 5456,
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123'
});

// Better images for cutting board products
const cuttingBoardImages = {
  'B0CLBHB46K': 'https://m.media-amazon.com/images/I/71U3LBmGmvL._AC_SL1500_.jpg', // Bamboo cutting board set of 3
  'B0CLBR3ZCN': 'https://m.media-amazon.com/images/I/81AuJRwN8jL._AC_SL1500_.jpg', // Bamboo cutting board set of 2  
  'B0CLBFSQH1': 'https://m.media-amazon.com/images/I/71-WQJwJYIL._AC_SL1500_.jpg', // Bamboo cutting board set of 4
};

(async () => {
  try {
    console.log('Updating cutting board product images...\n');
    
    for (const [asin, imageUrl] of Object.entries(cuttingBoardImages)) {
      const result = await pool.query(
        'UPDATE products SET image_url = $1, updated_at = NOW() WHERE asin = $2 RETURNING asin, title',
        [imageUrl, asin]
      );
      
      if (result.rowCount > 0) {
        console.log(`✓ Updated ${asin}: ${result.rows[0].title?.substring(0, 40)}...`);
        console.log(`  New image: ${imageUrl}`);
      } else {
        console.log(`- Skipped ${asin}: Product not found`);
      }
    }
    
    // Verify the updates
    console.log('\nVerifying updates:');
    console.log('==================');
    const verifyResult = await pool.query(`
      SELECT asin, title, image_url 
      FROM products 
      WHERE asin IN ('B0CLBHB46K', 'B0CLBR3ZCN', 'B0CLBFSQH1')
      ORDER BY asin
    `);
    
    verifyResult.rows.forEach(row => {
      console.log(`${row.asin}: ${row.image_url}`);
    });
    
    console.log('\n✅ Product images updated successfully!');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
})();