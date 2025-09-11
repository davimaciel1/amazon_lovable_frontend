const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: process.env.DB_PORT || 5456,
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123'
});

async function normalizeProductImages() {
  try {
    console.log('🔄 Starting product image normalization...');
    
    // Add columns if not exists
    console.log('📊 Adding new columns...');
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS image_source_url TEXT,
      ADD COLUMN IF NOT EXISTS image_key VARCHAR(50),
      ADD COLUMN IF NOT EXISTS image_etag VARCHAR(255),
      ADD COLUMN IF NOT EXISTS image_last_checked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS marketplace_id VARCHAR(20) DEFAULT 'ATVPDKIKX0DER'
    `);
    
    // Create indexes
    console.log('🔍 Creating indexes...');
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_asin ON products(asin)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_marketplace ON products(marketplace_id)`);
    
    // Extract image_key from existing URLs
    console.log('🔑 Extracting image keys from URLs...');
    const extractResult = await pool.query(`
      UPDATE products 
      SET image_key = 
        CASE 
          WHEN image_url LIKE '%/images/I/%' THEN 
            SPLIT_PART(SPLIT_PART(image_url, '/images/I/', 2), '.', 1)
          ELSE NULL
        END
      WHERE image_url IS NOT NULL 
        AND image_url != ''
        AND image_key IS NULL
      RETURNING asin, image_key
    `);
    console.log(`✅ Extracted ${extractResult.rowCount} image keys`);
    
    // Normalize image_source_url
    console.log('🔗 Normalizing image source URLs...');
    const normalizeResult = await pool.query(`
      UPDATE products 
      SET image_source_url = image_url
      WHERE image_url IS NOT NULL 
        AND image_url LIKE 'https://m.media-amazon.com/%'
        AND image_source_url IS NULL
      RETURNING asin, image_source_url
    `);
    console.log(`✅ Normalized ${normalizeResult.rowCount} source URLs`);
    
    // Generate URLs for products with image_key only
    console.log('🏗️ Generating URLs from image keys...');
    const generateResult = await pool.query(`
      UPDATE products 
      SET image_source_url = 'https://m.media-amazon.com/images/I/' || image_key || '._SX240_.jpg'
      WHERE image_key IS NOT NULL 
        AND image_source_url IS NULL
      RETURNING asin, image_source_url
    `);
    console.log(`✅ Generated ${generateResult.rowCount} URLs from keys`);
    
    // Update last checked timestamp
    console.log('⏰ Updating last checked timestamps...');
    const timestampResult = await pool.query(`
      UPDATE products 
      SET image_last_checked_at = NOW()
      WHERE (image_source_url IS NOT NULL OR image_key IS NOT NULL)
        AND image_last_checked_at IS NULL
      RETURNING asin
    `);
    console.log(`✅ Updated ${timestampResult.rowCount} timestamps`);
    
    // Show sample results
    const sampleResult = await pool.query(`
      SELECT asin, image_key, image_source_url, marketplace_id, image_last_checked_at
      FROM products 
      WHERE image_key IS NOT NULL OR image_source_url IS NOT NULL
      LIMIT 5
    `);
    
    console.log('\n📸 Sample normalized products:');
    sampleResult.rows.forEach(row => {
      console.log(`  ASIN: ${row.asin}`);
      console.log(`  Image Key: ${row.image_key || 'N/A'}`);
      console.log(`  Source URL: ${row.image_source_url || 'N/A'}`);
      console.log(`  Marketplace: ${row.marketplace_id}`);
      console.log('  ---');
    });
    
    console.log('\n✅ Product image normalization complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

normalizeProductImages();