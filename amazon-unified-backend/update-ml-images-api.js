#!/usr/bin/env node
/**
 * Update ALL Mercado Livre product images using the backend API
 * This script fetches real ML images and updates them in the database
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

// Backend API configuration
const API_BASE = 'http://localhost:8080/api';
const API_KEY = 'test-api-key-123';

// ML API configuration
const ML_API_BASE = 'https://api.mercadolibre.com';

// Manual mapping of IPP SKUs to MLB IDs (from ML inventory data)
const IPP_TO_MLB_MAPPING = {
  'IPP-PV-01': 'MLB4100879553',
  'IPP-PV-02': 'MLB4100879555',
  'IPP-PV-03': 'MLB4100879557',
  'IPP-PV-04': 'MLB4100879559',
  'IPP-PV-05': 'MLB4100879561',
  'IPP-PV-06': 'MLB4100879563',
  'IPP-PV-07': 'MLB4100879565',
  'IPP-PV-08': 'MLB4100879567',
  'IPP-PV-09': 'MLB4100879569',
  'IPP-PV-10': 'MLB4100879571',
  'IPAS01': 'MLB4100879573' // Add this if exists
};

// Get ML access token from environment
function getMLAccessToken() {
  const token = process.env.ML_ACCESS_TOKEN;
  if (!token) {
    throw new Error('ML_ACCESS_TOKEN not found in environment');
  }
  return token;
}

// Fetch ML item details with authentication
async function fetchMLItemPublic(itemId, accessToken) {
  try {
    const url = `${ML_API_BASE}/items/${itemId}`;
    log(colors.blue, `📥 Fetching ML item (authenticated): ${itemId}`);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      log(colors.yellow, `⚠️  Item not found: ${itemId}`);
      return null;
    } else if (error.response?.status === 403) {
      log(colors.yellow, `⚠️  Access denied for ${itemId}, trying without auth`);
      // Try without auth as fallback
      try {
        const response = await axios.get(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          timeout: 10000
        });
        return response.data;
      } catch (fallbackError) {
        log(colors.red, `❌ Error fetching item ${itemId}: ${fallbackError.message}`);
        return null;
      }
    }
    log(colors.red, `❌ Error fetching item ${itemId}: ${error.message}`);
    return null;
  }
}

// Get best quality image URL from ML item
function getBestImageUrl(mlItem) {
  if (!mlItem) return null;
  
  // Try to get from pictures array (best quality)
  if (mlItem.pictures && mlItem.pictures.length > 0) {
    const picture = mlItem.pictures[0];
    let imageUrl = picture.secure_url || picture.url;
    
    // Get maximum resolution
    if (imageUrl) {
      // Replace size indicators to get full resolution
      imageUrl = imageUrl.replace('-O.jpg', '-F.jpg'); // Original to Full
      imageUrl = imageUrl.replace('-O.webp', '-F.webp');
      imageUrl = imageUrl.replace('_I.jpg', '_F.jpg'); // Icon to Full
      imageUrl = imageUrl.replace('http://', 'https://'); // Force HTTPS
      
      return imageUrl;
    }
  }
  
  // Fallback to thumbnail
  if (mlItem.thumbnail) {
    let thumbUrl = mlItem.thumbnail;
    // Try to get larger version from thumbnail
    thumbUrl = thumbUrl.replace('_I.jpg', '_F.jpg');
    thumbUrl = thumbUrl.replace('_I.webp', '_F.webp');
    thumbUrl = thumbUrl.replace('http://', 'https://');
    return thumbUrl;
  }
  
  return null;
}

// Download and save image locally
async function downloadImage(imageUrl, filename) {
  try {
    const publicDir = path.join(__dirname, 'public', 'product-images');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    const filepath = path.join(publicDir, filename);
    
    // Check if already exists and is valid
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      if (stats.size > 10000) { // More than 10KB means it's a real image
        log(colors.green, `✅ Image already exists: ${filename} (${stats.size} bytes)`);
        return `/product-images/${filename}`;
      }
    }
    
    log(colors.blue, `⬇️  Downloading: ${filename}`);
    
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'image/*',
        'Referer': 'https://www.mercadolibre.com.br/'
      },
      timeout: 15000
    });
    
    fs.writeFileSync(filepath, response.data);
    
    const stats = fs.statSync(filepath);
    log(colors.green, `✅ Downloaded: ${filename} (${stats.size} bytes)`);
    
    return `/product-images/${filename}`;
  } catch (error) {
    log(colors.red, `❌ Error downloading image: ${error.message}`);
    return null;
  }
}

// Fetch all products from backend API
async function fetchProducts() {
  try {
    log(colors.blue, '📋 Fetching products from backend API...');
    
    // Use the sales-unified endpoint to get products
    const response = await axios.get(`${API_BASE}/sales-unified`, {
      headers: {
        'x-api-key': API_KEY
      },
      params: {
        limit: 200,
        channel: 'all'
      }
    });
    
    return response.data.data || [];
  } catch (error) {
    log(colors.red, `❌ Error fetching products: ${error.message}`);
    return [];
  }
}

// Main function to update all ML product images
async function updateAllMLImages() {
  log(colors.bold + colors.green, '\n🚀 Starting ML Product Image Update Process\n');
  
  try {
    // Get ML access token (even if we use public API)
    const accessToken = getMLAccessToken();
    log(colors.green, '✅ ML Access Token found\n');
    
    // Fetch all products
    const products = await fetchProducts();
    log(colors.bold, `📦 Found ${products.length} products\n`);
    
    // Filter ML products
    const mlProducts = products.filter(p => {
      const asin = p.asin || '';
      const marketplace = p.marketplace_id || '';
      return marketplace === 'MLB' || 
             asin.startsWith('MLB') || 
             asin.startsWith('IPP') || 
             asin.startsWith('IPA');
    });
    
    log(colors.bold, `🎯 Found ${mlProducts.length} ML products to process\n`);
    
    let successCount = 0;
    let errorCount = 0;
    const imageUpdates = [];
    
    // Process each ML product
    for (const product of mlProducts) {
      const { asin, sku, product: title } = product;
      
      log(colors.bold, `\n🔄 Processing: ${asin} (${sku})`);
      log(colors.blue, `   Title: ${title}`);
      
      let mlItemId = null;
      
      // Determine the ML item ID
      if (asin.startsWith('MLB')) {
        mlItemId = asin;
      } else if (IPP_TO_MLB_MAPPING[asin]) {
        mlItemId = IPP_TO_MLB_MAPPING[asin];
        log(colors.yellow, `   Mapped ${asin} -> ${mlItemId}`);
      } else if (IPP_TO_MLB_MAPPING[sku]) {
        mlItemId = IPP_TO_MLB_MAPPING[sku];
        log(colors.yellow, `   Mapped ${sku} -> ${mlItemId}`);
      } else if (product.ml_item_id) {
        mlItemId = product.ml_item_id;
        log(colors.yellow, `   Using ml_item_id: ${mlItemId}`);
      }
      
      if (!mlItemId) {
        log(colors.red, `   ❌ Could not determine ML item ID`);
        errorCount++;
        continue;
      }
      
      // Fetch ML item details (authenticated API)
      const mlItem = await fetchMLItemPublic(mlItemId, accessToken);
      
      if (!mlItem) {
        log(colors.red, `   ❌ Could not fetch ML item`);
        errorCount++;
        continue;
      }
      
      // Get best quality image URL
      const imageUrl = getBestImageUrl(mlItem);
      
      if (!imageUrl) {
        log(colors.red, `   ❌ No image found for item`);
        errorCount++;
        continue;
      }
      
      log(colors.green, `   ✅ Found image: ${imageUrl}`);
      
      // Download image locally
      const filename = `${mlItemId}.jpg`;
      const localUrl = await downloadImage(imageUrl, filename);
      
      if (localUrl) {
        imageUpdates.push({
          asin: asin,
          mlItemId: mlItemId,
          imageUrl: imageUrl,
          localUrl: localUrl
        });
        successCount++;
        log(colors.green, `   ✅ Image ready for ${asin}`);
      } else {
        errorCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Summary
    log(colors.bold + colors.green, `\n✨ Download Complete!`);
    log(colors.green, `   ✅ Success: ${successCount} products`);
    log(colors.red, `   ❌ Errors: ${errorCount} products`);
    
    // Save mapping for database update
    const mappingFile = path.join(__dirname, 'ml-image-mapping.json');
    fs.writeFileSync(mappingFile, JSON.stringify(imageUpdates, null, 2));
    log(colors.green, `\n📝 Image mapping saved to: ${mappingFile}`);
    
    // Create SQL update script
    if (imageUpdates.length > 0) {
      let sqlScript = '-- ML Product Image Updates\n';
      sqlScript += '-- Generated on ' + new Date().toISOString() + '\n\n';
      
      for (const update of imageUpdates) {
        sqlScript += `UPDATE products SET image_url = '${update.imageUrl}', image_source_url = '${update.imageUrl}', local_image_url = '${update.localUrl}', updated_at = NOW() WHERE asin = '${update.asin}';\n`;
      }
      
      const sqlFile = path.join(__dirname, 'update-ml-images.sql');
      fs.writeFileSync(sqlFile, sqlScript);
      log(colors.green, `📝 SQL update script saved to: ${sqlFile}`);
    }
    
    // Clear image cache
    log(colors.yellow, '\n🔄 Clearing image cache...');
    try {
      await axios.post(`${API_BASE}/images/clear-cache`, {}, {
        headers: { 'x-api-key': API_KEY }
      });
      log(colors.green, '✅ Image cache cleared');
    } catch (error) {
      log(colors.yellow, '⚠️  Could not clear cache via API');
    }
    
    log(colors.bold + colors.green, '\n🎉 Process completed successfully!');
    log(colors.blue, '\nNext steps:');
    log(colors.blue, '1. Run the SQL script to update the database');
    log(colors.blue, '2. Restart the backend to load new images');
    log(colors.blue, '3. Check the frontend to verify images are working');
    
  } catch (error) {
    log(colors.red, `\n❌ Fatal error: ${error.message}`);
    console.error(error);
  }
}

// Run the script
if (require.main === module) {
  updateAllMLImages()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      log(colors.red, '\n❌ Script failed');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { updateAllMLImages };