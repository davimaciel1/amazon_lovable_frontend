require('dotenv').config();
const { Client } = require('pg');

async function checkDatabaseStructure() {
  const client = new Client({
    host: process.env.DB_HOST || '49.12.191.119',
    port: Number(process.env.DB_PORT || 5456),
    user: process.env.DB_USER || 'saas',
    password: process.env.DB_PASSWORD || 'saas_password_123',
    database: process.env.DB_NAME || 'amazon_monitor'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check tables
    console.log('\n📋 Available tables:');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // Check Product table structure
    console.log('\n🏷️ Product table structure:');
    const productStructure = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'Product' OR table_name = 'products'
      ORDER BY ordinal_position;
    `);
    
    if (productStructure.rows.length === 0) {
      console.log('   No Product table found. Checking for products table...');
      const productsStructure = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'products'
        ORDER BY ordinal_position;
      `);
      if (productsStructure.rows.length > 0) {
        console.log('   Found products table:');
        productsStructure.rows.forEach(row => {
          console.log(`     ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
      }
    } else {
      productStructure.rows.forEach(row => {
        console.log(`   ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
    }

    // Check for image-related columns
    console.log('\n🖼️ Image-related columns in all tables:');
    const imageColumns = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE column_name ILIKE '%image%' OR column_name ILIKE '%photo%' OR column_name ILIKE '%picture%'
      ORDER BY table_name, column_name;
    `);
    if (imageColumns.rows.length > 0) {
      imageColumns.rows.forEach(row => {
        console.log(`   ${row.table_name}.${row.column_name} (${row.data_type})`);
      });
    } else {
      console.log('   No image-related columns found');
    }

    // Sample product data
    console.log('\n📦 Sample product data (first 5):');
    try {
      const sampleProducts = await client.query(`
        SELECT * FROM "Product" LIMIT 5;
      `);
      if (sampleProducts.rows.length > 0) {
        console.log('   Products found in "Product" table:');
        sampleProducts.rows.forEach((row, index) => {
          console.log(`   ${index + 1}. ASIN: ${row.asin || 'N/A'}, Title: ${(row.title || row.name || 'N/A').substring(0, 50)}...`);
          if (row.image_url || row.imageUrl || row.image) {
            console.log(`      Image: ${row.image_url || row.imageUrl || row.image}`);
          }
        });
      }
    } catch (error) {
      console.log('   Trying products table...');
      try {
        const sampleProducts = await client.query(`
          SELECT * FROM products LIMIT 5;
        `);
        if (sampleProducts.rows.length > 0) {
          console.log('   Products found in "products" table:');
          sampleProducts.rows.forEach((row, index) => {
            console.log(`   ${index + 1}. ASIN: ${row.asin || 'N/A'}, Title: ${(row.title || row.name || 'N/A').substring(0, 50)}...`);
            if (row.image_url || row.imageUrl || row.image) {
              console.log(`      Image: ${row.image_url || row.imageUrl || row.image}`);
            }
          });
        }
      } catch (error2) {
        console.log(`   Error checking products: ${error2.message}`);
      }
    }

    // Check order_items structure
    console.log('\n📋 order_items table structure:');
    try {
      const orderItemsStructure = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'order_items'
        ORDER BY ordinal_position;
      `);
      if (orderItemsStructure.rows.length > 0) {
        orderItemsStructure.rows.forEach(row => {
          console.log(`   ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
      }
    } catch (error) {
      console.log(`   Error checking order_items: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ Database connection error:', error.message);
  } finally {
    await client.end();
  }
}

checkDatabaseStructure();
