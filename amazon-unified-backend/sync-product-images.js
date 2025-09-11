require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

function getArg(name, defVal) {
  const withEq = process.argv.find(a => a.startsWith(`--${name}=`));
  if (withEq) return withEq.split('=')[1];
  const idx = process.argv.findIndex(a => a === `--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return defVal;
}

async function syncProductImages() {
  const limit = parseInt(getArg('limit', '300'), 10);
  const from = getArg('from', new Date(Date.now() - 365*24*60*60*1000).toISOString());
  const to = getArg('to', new Date().toISOString());

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
    console.log(`⏱️ Date range: ${from} -> ${to} | 🔢 Limit: ${limit}`);

    // Get TOP ASINs by revenue within range, collect multiple image sources
    const query = `
      SELECT 
        f.asin,
        f.title,
        f.revenue,
        f.units,
        f.oi_product_image_url,
        f.oi_image_url,
        f.p_imageurl,
        pr.image_url as pr_image_url,
        pr.local_image_url as pr_local_image_url,
        pr.image_source_url as pr_image_source_url
      FROM (
        SELECT 
          oi.asin,
          MAX(oi.title) AS title,
          SUM(oi.quantity_ordered) AS units,
          SUM(COALESCE(oi.item_price, 0) * oi.quantity_ordered) AS revenue,
          MAX(oi.product_image_url) AS oi_product_image_url,
          MAX(oi.image_url) AS oi_image_url,
          MAX(p."imageUrl") AS p_imageurl
        FROM order_items oi
        LEFT JOIN "Order" o ON oi.amazon_order_id = o."amazonOrderId"
        LEFT JOIN "Product" p ON oi.asin = p.asin
        WHERE oi.asin IS NOT NULL
          AND o."purchaseDate" >= $1 AND o."purchaseDate" <= $2
        GROUP BY oi.asin
      ) f
      LEFT JOIN products pr ON pr.asin = f.asin
      ORDER BY f.revenue DESC NULLS LAST
      LIMIT $3;
    `;
    
    const result = await client.query(query, [from, to, limit]);
    console.log(`\n📦 Found ${result.rows.length} top products for image sync:`);
    
    const imageDir = path.join(__dirname, 'public', 'product-images');
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    for (const product of result.rows) {
      console.log(`\n🔍 ${product.asin}: ${product.title?.substring(0, 80) || ''}`);
      const candidates = [
        product.oi_product_image_url,
        product.oi_image_url,
        product.p_imageurl,
        product.pr_image_source_url,
        product.pr_image_url,
      ].filter(Boolean);

      // If there's a local path record and file exists, skip
      const localImagePath = path.join(imageDir, `${product.asin}.jpg`);
      if (fs.existsSync(localImagePath)) {
        console.log(`   ✅ Already have local image: ${localImagePath}`);
        continue;
      }

      let downloaded = false;
      for (const url of candidates) {
        try {
          if (typeof url === 'string' && url.startsWith('http')) {
            console.log(`   ↘️ Trying: ${url}`);
            await downloadImage(url, localImagePath);
            console.log(`   ✅ Downloaded`);
            downloaded = true;
            break;
          }
        } catch (err) {
          console.log(`   ❌ Failed (${url}): ${err.message}`);
        }
      }

      if (!downloaded) {
        console.log('   ⚠️ No valid HTTP image URL found; leaving fallback to /api/product-images');
      }
    }
    
    // List what we have locally now
    console.log('\n📁 Local images available (count):');
    const localImages = fs.readdirSync(imageDir);
    console.log(`   ${localImages.length} files`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          return downloadImage(redirectUrl, filepath)
            .then(resolve)
            .catch(reject);
        }
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      const fileStream = fs.createWriteStream(filepath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(filepath, () => {}); // Delete incomplete file
        reject(err);
      });
    });
    
    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.abort();
      reject(new Error('Request timeout'));
    });
  });
}

if (require.main === module) {
  syncProductImages();
}

module.exports = { syncProductImages };
