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
    // Check columns in products table
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      ORDER BY ordinal_position
    `);
    
    console.log('Products table columns:');
    console.log('======================');
    result.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type}`);
    });
    
    // Check sample data
    const sampleResult = await pool.query(`
      SELECT * FROM products LIMIT 3
    `);
    
    console.log('\nSample products data:');
    console.log('====================');
    console.log(JSON.stringify(sampleResult.rows, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
})();