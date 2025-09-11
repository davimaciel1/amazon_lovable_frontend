require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const asin = process.argv[2] || 'B0CLBFSQH1';
  const client = new Client({
    host: process.env.DB_HOST || '49.12.191.119',
    port: Number(process.env.DB_PORT || 5456),
    user: process.env.DB_USER || 'saas',
    password: process.env.DB_PASSWORD || 'saas_password_123',
    database: process.env.DB_NAME || 'amazon_monitor'
  });

  console.log(`🔎 Checking images for ASIN: ${asin}`);
  try {
    await client.connect();

    const productQry = `
      SELECT asin, title, "imageUrl" as imageUrl_camel, "marketplaceId"
      FROM "Product" 
      WHERE asin = $1
      LIMIT 5;
    `;
    const oiQry = `
      SELECT asin, title, product_image_url, image_url
      FROM order_items 
      WHERE asin = $1
      ORDER BY created_at DESC NULLS LAST
      LIMIT 5;
    `;
    const productsAltQry = `
      SELECT asin, image_url, local_image_url, image_source_url
      FROM products
      WHERE asin = $1
      LIMIT 5;
    `;

    const [productRes, oiRes, productsAltRes] = await Promise.all([
      client.query(productQry, [asin]),
      client.query(oiQry, [asin]),
      client.query(productsAltQry, [asin]).catch(() => ({ rows: [] }))
    ]);

    console.log('\n📦 Product table ("Product") results:');
    if (productRes.rows.length === 0) {
      console.log('  - No rows in "Product" for this ASIN');
    } else {
      for (const r of productRes.rows) {
        console.log(`  - title: ${r.title}`);
        console.log(`    imageUrl (camel): ${r.imageurl_camel || r.imageurl_camel === '' ? r.imageurl_camel : r.imageurl_camel}`);
        console.log(`    marketplaceId: ${r.marketplaceId}`);
      }
    }

    console.log('\n🧾 order_items results:');
    if (oiRes.rows.length === 0) {
      console.log('  - No rows in order_items for this ASIN');
    } else {
      for (const r of oiRes.rows) {
        console.log(`  - title: ${r.title}`);
        console.log(`    product_image_url: ${r.product_image_url}`);
        console.log(`    image_url: ${r.image_url}`);
      }
    }

    console.log('\n📦 products (lowercase) results:');
    if (productsAltRes.rows.length === 0) {
      console.log('  - No rows in products table for this ASIN');
    } else {
      for (const r of productsAltRes.rows) {
        console.log(`  - image_url: ${r.image_url}`);
        console.log(`    local_image_url: ${r.local_image_url}`);
        console.log(`    image_source_url: ${r.image_source_url}`);
      }
    }

    // Check local file
    const localPath = path.join(__dirname, 'public', 'product-images', `${asin}.jpg`);
    console.log(`\n🖼️ Local file exists? ${fs.existsSync(localPath) ? 'YES' : 'NO'} (${localPath})`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

main();

