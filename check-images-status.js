const { Pool } = require('pg');

const pool = new Pool({
  host: '49.12.191.119',
  port: 5456,
  database: 'amazon_monitor',
  user: 'saas',
  password: 'saas_password_123'
});

async function checkImages() {
  try {
    // 1. Check overall status
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(image_source_url) as with_url,
        COUNT(CASE WHEN image_source_url LIKE '%media-amazon%' THEN 1 END) as amazon_images,
        COUNT(CASE WHEN image_source_url IS NULL THEN 1 END) as null_images
      FROM products 
      WHERE asin IS NOT NULL
    `);
    
    console.log('📊 Database Image Status:');
    console.log('========================');
    const stats = statsResult.rows[0];
    console.log('Total products:', stats.total);
    console.log('With image URL:', stats.with_url);
    console.log('Amazon images:', stats.amazon_images);
    console.log('NULL images:', stats.null_images);
    
    // 2. Show sample of products with images
    console.log('\n✅ Products WITH images:');
    const withImages = await pool.query(`
      SELECT asin, SUBSTRING(title, 1, 40) as title, image_source_url
      FROM products 
      WHERE image_source_url IS NOT NULL 
      AND asin IS NOT NULL
      LIMIT 5
    `);
    
    for (const row of withImages.rows) {
      console.log(`  ${row.asin}: ${row.title}...`);
      console.log(`    URL: ${row.image_source_url?.substring(0, 60)}...`);
    }
    
    // 3. Show products without images
    console.log('\n❌ Products WITHOUT images:');
    const withoutImages = await pool.query(`
      SELECT asin, SUBSTRING(title, 1, 40) as title
      FROM products 
      WHERE image_source_url IS NULL 
      AND asin IS NOT NULL
      LIMIT 5
    `);
    
    if (withoutImages.rows.length === 0) {
      console.log('  None - all products have images!');
    } else {
      for (const row of withoutImages.rows) {
        console.log(`  ${row.asin}: ${row.title}...`);
      }
    }
    
    // 4. Check for each unique ASIN
    console.log('\n🔍 Checking UNIQUE ASINs:');
    const uniqueAsins = await pool.query(`
      SELECT 
        asin,
        COUNT(*) as count,
        MAX(image_source_url) as image_url
      FROM products
      WHERE asin IS NOT NULL
      GROUP BY asin
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log('ASIN | Count | Has Image?');
    for (const row of uniqueAsins.rows) {
      const hasImage = row.image_url ? '✅' : '❌';
      console.log(`${row.asin} | ${row.count} | ${hasImage}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkImages();