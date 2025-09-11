const { Client } = require('pg');

const client = new Client({
  host: '49.12.191.119',
  port: 5456,
  database: 'amazon_monitor',
  user: 'saas',
  password: 'saas_password_123'
});

async function checkImages() {
  try {
    await client.connect();
    console.log('Connected to database');
    
    // Check products table structure
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'products'
      ORDER BY ordinal_position
    `);
    
    console.log('\n=== Products Table Columns ===');
    columnsResult.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type}`);
    });
    
    // Check sample product with images
    const sampleResult = await client.query(`
      SELECT * FROM products 
      WHERE asin IN ('B0CLBHB46K', 'B0C59YJM4Y', 'B0C59YL99C')
      LIMIT 5
    `);
    
    console.log('\n=== Sample Products ===');
    sampleResult.rows.forEach(row => {
      console.log(`ASIN: ${row.asin}`);
      // Log all columns that might contain image data
      Object.keys(row).forEach(key => {
        if (key.toLowerCase().includes('image') || 
            key.toLowerCase().includes('img') || 
            key.toLowerCase().includes('url') ||
            key.toLowerCase().includes('photo')) {
          console.log(`  ${key}: ${row[key]}`);
        }
      });
      console.log('---');
    });
    
  } catch (err) {
    console.error('Database error:', err);
  } finally {
    await client.end();
  }
}

checkImages();