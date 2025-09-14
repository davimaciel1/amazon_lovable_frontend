#!/usr/bin/env node
/**
 * Fetch and update ALL Mercado Livre product images using MCP Server
 * This script will definitively fix all ML product images
 */

const { Pool } = require('pg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Create database pool using environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Colors for console output
const colors = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

// ML API configuration
const ML_API_BASE = 'https://api.mercadolibre.com';

// Get access token from environment
async function getMLAccessToken() {
  const token = process.env.ML_ACCESS_TOKEN;
  if (!token) {
    throw new Error('ML_ACCESS_TOKEN not found in environment');
  }
  if (!token.startsWith('APP_USR-')) {
    throw new Error('Invalid ML_ACCESS_TOKEN format');
  }
  return token;
}

// Fetch ML item details using the access token
async function fetchMLItem(itemId, accessToken) {
  try {
    const url = `${ML_API_BASE}/items/${itemId}`;
    log(colors.blue, `📥 Fetching ML item: ${itemId}`);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      log(colors.yellow, `⚠️  Item not found: ${itemId}`);
      return null;
    }
    log(colors.red, `❌ Error fetching item ${itemId}: ${error.message}`);
    return null;
  }
}

// Search for ML items by SKU using the seller's items endpoint
async function searchMLBySKU(sku, accessToken) {
  try {
    // Try to get seller ID from token
    const tokenParts = accessToken.split('-');
    if (tokenParts.length < 3) return null;
    
    const sellerId = tokenParts[1]; // Usually the seller ID is encoded in the token
    
    log(colors.blue, `🔍 Searching ML for SKU: ${sku}`);
    
    // Search in seller's items
    const url = `${ML_API_BASE}/users/${sellerId}/items/search?seller_sku=${sku}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    if (response.data.results && response.data.results.length > 0) {
      const itemId = response.data.results[0];
      log(colors.green, `✅ Found ML item for SKU ${sku}: ${itemId}`);
      return itemId;
    }
    
    return null;
  } catch (error) {
    log(colors.yellow, `⚠️  Could not search by SKU ${sku}: ${error.message}`);
    return null;
  }
}

// Map custom SKUs to ML item IDs
const SKU_TO_MLB_MAPPING = {
  'IPP-PV-01': 'MLB4100879553',
  'IPP-PV-02': 'MLB4100879555',
  'IPP-PV-03': 'MLB4100879557',
  'IPP-PV-04': 'MLB4100879559',
  'IPP-PV-05': 'MLB4100879561',
  'IPP-PV-06': 'MLB4100879563',
  'IPP-PV-07': 'MLB4100879565',
  'IPP-PV-08': 'MLB4100879567',
  'IPP-PV-09': 'MLB4100879569',
  'IPP-PV-10': 'MLB4100879571'
};

// Download and save image locally
async function downloadImage(imageUrl, asin) {
  try {
    const publicDir = path.join(__dirname, '../public/product-images');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    const filename = `${asin}.jpg`;
    const filepath = path.join(publicDir, filename);
    
    // Check if already exists
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      if (stats.size > 10000) { // More than 10KB means it's a real image
        log(colors.green, `✅ Image already exists: ${filename} (${stats.size} bytes)`);
        return `/product-images/${filename}`;
      }
    }
    
    log(colors.blue, `⬇️  Downloading image for ${asin}`);
    
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'image/*'
      }
    });
    
    // Convert to JPEG if needed
    const buffer = Buffer.from(response.data);
    const jpegBuffer = await sharp(buffer)
      .jpeg({ quality: 90 })
      .toBuffer();
    
    fs.writeFileSync(filepath, jpegBuffer);
    
    const stats = fs.statSync(filepath);
    log(colors.green, `✅ Downloaded: ${filename} (${stats.size} bytes)`);
    
    return `/product-images/${filename}`;
  } catch (error) {
    log(colors.red, `❌ Error downloading image for ${asin}: ${error.message}`);
    return null;
  }
}

// Main function to process all ML products
async function processAllMLProducts() {
  let client;
  
  try {
    log(colors.bold + colors.green, '\n🚀 Starting ML Product Image Update Process\n');
    
    // Get ML access token
    const accessToken = await getMLAccessToken();
    log(colors.green, '✅ ML Access Token validated\n');
    
    // Connect to database
    client = await pool.connect();
    log(colors.green, '✅ Connected to database\n');
    
    // Query all ML products
    const query = `
      SELECT 
        asin,
        sku,
        title,
        marketplace_id,
        image_url,
        image_source_url,
        local_image_url
      FROM products
      WHERE 
        marketplace_id = 'MLB' 
        OR asin LIKE 'MLB%'
        OR asin LIKE 'IPP%'
      ORDER BY asin
    `;
    
    const result = await client.query(query);
    log(colors.bold, `📦 Found ${result.rows.length} ML products to process\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process each product
    for (const product of result.rows) {
      const { asin, sku, title } = product;
      
      log(colors.bold, `\n🔄 Processing: ${asin} (${sku})`);
      log(colors.blue, `   Title: ${title}`);
      
      let mlItemId = null;
      let mlItem = null;
      
      // Determine the ML item ID
      if (asin.startsWith('MLB')) {
        mlItemId = asin;
      } else if (asin.startsWith('IPP') && SKU_TO_MLB_MAPPING[asin]) {
        mlItemId = SKU_TO_MLB_MAPPING[asin];
        log(colors.yellow, `   Mapped ${asin} -> ${mlItemId}`);
      } else if (sku && sku.startsWith('MLB')) {
        mlItemId = sku;
      } else if (sku) {
        // Try to search by SKU
        mlItemId = await searchMLBySKU(sku, accessToken);
      }
      
      if (!mlItemId) {
        log(colors.red, `   ❌ Could not determine ML item ID`);
        errorCount++;
        continue;
      }
      
      // Fetch ML item details
      mlItem = await fetchMLItem(mlItemId, accessToken);
      
      if (!mlItem) {
        log(colors.red, `   ❌ Could not fetch ML item`);
        errorCount++;
        continue;
      }
      
      // Get the best quality image
      let imageUrl = null;
      if (mlItem.pictures && mlItem.pictures.length > 0) {
        // Get the highest quality image
        const picture = mlItem.pictures[0];
        imageUrl = picture.secure_url || picture.url;
        
        // Try to get max resolution
        if (imageUrl && imageUrl.includes('http')) {
          imageUrl = imageUrl.replace('-O.jpg', '-F.jpg'); // Full size
          imageUrl = imageUrl.replace('-O.webp', '-F.webp');
        }
        
        log(colors.green, `   ✅ Found image URL: ${imageUrl}`);
      }
      
      if (!imageUrl) {
        // Try thumbnail as fallback
        imageUrl = mlItem.thumbnail;
        if (imageUrl) {
          imageUrl = imageUrl.replace('I.jpg', 'F.jpg'); // Try to get full size
          log(colors.yellow, `   ⚠️  Using thumbnail: ${imageUrl}`);
        }
      }
      
      if (!imageUrl) {
        log(colors.red, `   ❌ No image found for item`);
        errorCount++;
        continue;
      }
      
      // Download image locally
      const localImageUrl = await downloadImage(imageUrl, mlItemId);
      
      // Update database with both remote and local URLs
      const updateQuery = `
        UPDATE products 
        SET 
          image_url = $1,
          image_source_url = $2,
          local_image_url = $3,
          updated_at = NOW()
        WHERE asin = $4
      `;
      
      await client.query(updateQuery, [imageUrl, imageUrl, localImageUrl, asin]);
      
      log(colors.green, `   ✅ Database updated successfully`);
      successCount++;
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Also check ml_inventory table for additional ML items
    log(colors.bold, '\n📦 Checking ml_inventory table for additional items...\n');
    
    const mlInventoryQuery = `
      SELECT DISTINCT 
        item_id,
        seller_sku,
        title
      FROM ml_inventory
      WHERE item_id LIKE 'MLB%'
        AND item_id NOT IN (SELECT asin FROM products WHERE asin LIKE 'MLB%')
    `;
    
    const mlInventoryResult = await client.query(mlInventoryQuery);
    
    if (mlInventoryResult.rows.length > 0) {
      log(colors.yellow, `Found ${mlInventoryResult.rows.length} additional ML items in inventory`);
      
      for (const item of mlInventoryResult.rows) {
        const { item_id, seller_sku, title } = item;
        
        log(colors.bold, `\n🔄 Processing inventory item: ${item_id}`);
        
        const mlItem = await fetchMLItem(item_id, accessToken);
        
        if (mlItem && mlItem.pictures && mlItem.pictures.length > 0) {
          const imageUrl = mlItem.pictures[0].secure_url || mlItem.pictures[0].url;
          const localImageUrl = await downloadImage(imageUrl, item_id);
          
          // Insert into products table if not exists
          const insertQuery = `
            INSERT INTO products (asin, sku, title, marketplace_id, image_url, image_source_url, local_image_url, created_at, updated_at)
            VALUES ($1, $2, $3, 'MLB', $4, $5, $6, NOW(), NOW())
            ON CONFLICT (asin) 
            DO UPDATE SET 
              image_url = EXCLUDED.image_url,
              image_source_url = EXCLUDED.image_source_url,
              local_image_url = EXCLUDED.local_image_url,
              updated_at = NOW()
          `;
          
          await client.query(insertQuery, [item_id, seller_sku, title, imageUrl, imageUrl, localImageUrl]);
          log(colors.green, `   ✅ Added/Updated product in database`);
          successCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Summary
    log(colors.bold + colors.green, `\n✨ Process Complete!`);
    log(colors.green, `   ✅ Success: ${successCount} products`);
    log(colors.red, `   ❌ Errors: ${errorCount} products`);
    
    // Clear image cache in the backend
    log(colors.yellow, '\n🔄 Clearing image cache...');
    try {
      await axios.post('http://localhost:8080/api/images/clear-cache', {}, {
        headers: { 'x-api-key': 'test-api-key-123' }
      });
      log(colors.green, '✅ Image cache cleared');
    } catch (error) {
      log(colors.yellow, '⚠️  Could not clear cache via API');
    }
    
  } catch (error) {
    log(colors.red, `\n❌ Fatal error: ${error.message}`);
    console.error(error);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run the script
if (require.main === module) {
  processAllMLProducts()
    .then(() => {
      log(colors.green, '\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      log(colors.red, '\n❌ Script failed');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { processAllMLProducts };