const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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

// CORRECT MLB MAPPINGS from fetch-ml-images-mcp.js
const CORRECT_SKU_TO_MLB_MAPPING = {
  'IPP-PV-02': 'MLB4100879555',
  'IPP-PV-04': 'MLB4100879559', 
  'IPP-PV-05': 'MLB4100879561',
  // IPAS produtos já estão corretos
  'IPAS01': 'MLB3628967960',
  'IPAS02': 'MLB4258563772',
  'IPAS04': 'MLB2882967139'
};

// Get ML access token
function getMLAccessToken() {
  return process.env.ML_ACCESS_TOKEN || '';
}

// Fetch ML item details
async function fetchMLItem(itemId, accessToken) {
  try {
    const url = `https://api.mercadolibre.com/items/${itemId}`;
    
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    };
    
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    log(colors.blue, `🔍 Fetching ML item: ${itemId}`);
    const response = await axios.get(url, { headers });
    
    if (response.data && response.data.pictures && response.data.pictures.length > 0) {
      const imageUrl = response.data.pictures[0].secure_url;
      const title = response.data.title;
      
      log(colors.green, `✅ Found image for ${itemId}: ${title}`);
      log(colors.blue, `   Image: ${imageUrl}`);
      
      return {
        itemId,
        title,
        imageUrl,
        description: response.data.description || '',
        price: response.data.price || 0
      };
    }
    
    return null;
  } catch (error) {
    log(colors.red, `❌ Error fetching ML item ${itemId}: ${error.message}`);
    return null;
  }
}

// Update product in database
async function updateProduct(sku, mlbCode, imageUrl, title) {
  try {
    const query = `
      UPDATE products 
      SET 
        image_url = $1,
        image_source_url = $1,
        mlb_code = $2,
        title = $3,
        updated_at = NOW()
      WHERE sku = $4 OR asin = $4
    `;
    
    const result = await pool.query(query, [imageUrl, mlbCode, title, sku]);
    
    if (result.rowCount > 0) {
      log(colors.green, `✅ Updated product ${sku} with correct image`);
      return true;
    } else {
      log(colors.yellow, `⚠️  No product found for SKU: ${sku}`);
      return false;
    }
  } catch (error) {
    log(colors.red, `❌ Database error updating ${sku}: ${error.message}`);
    return false;
  }
}

// Main function
async function fixProductImages() {
  log(colors.bold, '🚀 Starting Product Image Correction');
  log(colors.blue, '   Using CORRECT MLB codes from fetch-ml-images-mcp.js');
  
  const accessToken = getMLAccessToken();
  if (!accessToken) {
    log(colors.red, '❌ ML_ACCESS_TOKEN not found in environment');
    return;
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const [sku, mlbCode] of Object.entries(CORRECT_SKU_TO_MLB_MAPPING)) {
    log(colors.blue, `\n🔧 Processing ${sku} -> ${mlbCode}`);
    
    try {
      // Fetch correct ML item data
      const mlData = await fetchMLItem(mlbCode, accessToken);
      
      if (mlData && mlData.imageUrl) {
        // Update database with correct data
        const success = await updateProduct(sku, mlbCode, mlData.imageUrl, mlData.title);
        
        if (success) {
          successCount++;
          log(colors.green, `✅ ${sku} fixed with real image from ${mlbCode}`);
        } else {
          errorCount++;
        }
      } else {
        log(colors.yellow, `⚠️  Could not fetch data for ${mlbCode}`);
        errorCount++;
      }
      
      // Wait a bit to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      log(colors.red, `❌ Error processing ${sku}: ${error.message}`);
      errorCount++;
    }
  }
  
  log(colors.bold, `\n📊 Summary:`);
  log(colors.green, `   ✅ Successfully fixed: ${successCount} products`);
  log(colors.red, `   ❌ Errors: ${errorCount} products`);
  
  await pool.end();
}

// Run the fix
if (require.main === module) {
  fixProductImages().catch(error => {
    log(colors.red, `Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { fixProductImages };