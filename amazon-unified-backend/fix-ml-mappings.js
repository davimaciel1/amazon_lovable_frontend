#!/usr/bin/env node
/**
 * Script para encontrar e corrigir automaticamente os mapeamentos corretos do Mercado Livre
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

const ML_API_BASE = 'https://api.mercadolibre.com';

// Get ML access token from environment
function getMLAccessToken() {
  const token = process.env.ML_ACCESS_TOKEN;
  if (!token) {
    throw new Error('ML_ACCESS_TOKEN not found in environment');
  }
  return token;
}

// Get seller ID from token or environment
function getSellerId() {
  const sellerId = process.env.MERCADOLIVRE_SELLER_ID || process.env.ML_SELLER_ID;
  if (sellerId) {
    return sellerId;
  }
  
  // Try to extract from token
  const token = getMLAccessToken();
  const tokenParts = token.split('-');
  if (tokenParts.length >= 3) {
    return tokenParts[1];
  }
  
  throw new Error('Could not determine seller ID');
}

// Search seller's items by SKU
async function searchBySKU(sku, accessToken, sellerId) {
  try {
    log(colors.blue, `🔍 Searching for SKU: ${sku}`);
    
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
    log(colors.yellow, `⚠️  Could not find by SKU ${sku}: ${error.message}`);
    return null;
  }
}

// Search seller's all items to find by title/description
async function searchSellerItems(searchTerm, accessToken, sellerId) {
  try {
    log(colors.blue, `🔍 Searching seller items for: ${searchTerm}`);
    
    const url = `${ML_API_BASE}/users/${sellerId}/items/search?q=${encodeURIComponent(searchTerm)}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    return response.data.results || [];
  } catch (error) {
    log(colors.yellow, `⚠️  Could not search items for ${searchTerm}: ${error.message}`);
    return [];
  }
}

// Get item details
async function getItemDetails(itemId, accessToken) {
  try {
    const url = `${ML_API_BASE}/items/${itemId}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    log(colors.red, `❌ Error getting item details for ${itemId}: ${error.message}`);
    return null;
  }
}

// List all seller items to find patterns
async function listSellerItems(accessToken, sellerId) {
  try {
    log(colors.blue, `📋 Listing all seller items...`);
    
    const url = `${ML_API_BASE}/users/${sellerId}/items/search`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    return response.data.results || [];
  } catch (error) {
    log(colors.red, `❌ Error listing seller items: ${error.message}`);
    return [];
  }
}

// Main function to find correct mappings
async function findCorrectMappings() {
  try {
    log(colors.bold + colors.green, '\n🔍 BUSCANDO MAPEAMENTOS CORRETOS DO MERCADO LIVRE\n');
    
    const accessToken = getMLAccessToken();
    const sellerId = getSellerId();
    
    log(colors.green, `✅ ML Access Token: ${accessToken.substring(0, 20)}...`);
    log(colors.green, `✅ Seller ID: ${sellerId}\n`);
    
    const results = {};
    const targetSKUs = ['IPAS01', 'IPAS04', 'IPP-PV-02'];
    
    // First try: search by exact SKU
    for (const sku of targetSKUs) {
      log(colors.bold, `\n🎯 Processando: ${sku}`);
      
      const itemId = await searchBySKU(sku, accessToken, sellerId);
      
      if (itemId) {
        const details = await getItemDetails(itemId, accessToken);
        if (details) {
          const imageUrl = details.pictures && details.pictures.length > 0 
            ? details.pictures[0].secure_url || details.pictures[0].url 
            : details.thumbnail;
            
          results[sku] = {
            mlb: itemId,
            title: details.title,
            image: imageUrl,
            found_by: 'exact_sku'
          };
          
          log(colors.green, `✅ ${sku} → ${itemId}`);
          log(colors.blue, `   Título: ${details.title}`);
          log(colors.blue, `   Imagem: ${imageUrl}`);
        }
      } else {
        log(colors.yellow, `⚠️  ${sku} não encontrado por SKU exato`);
        results[sku] = null;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Second try: list all items and search by pattern
    if (Object.values(results).some(r => r === null)) {
      log(colors.bold + colors.yellow, '\n📋 Listando todos os itens do vendedor para busca manual...\n');
      
      const allItems = await listSellerItems(accessToken, sellerId);
      log(colors.blue, `📦 Encontrados ${allItems.length} itens do vendedor`);
      
      // Get details for all items to find patterns
      const itemsWithDetails = [];
      for (let i = 0; i < Math.min(allItems.length, 50); i++) { // Limit to first 50 items
        const itemId = allItems[i];
        const details = await getItemDetails(itemId, accessToken);
        if (details) {
          itemsWithDetails.push({
            itemId,
            title: details.title,
            seller_sku: details.seller_custom_field,
            attributes: details.attributes || []
          });
          
          log(colors.blue, `📦 ${itemId}: ${details.title}`);
          if (details.seller_custom_field) {
            log(colors.yellow, `   SKU: ${details.seller_custom_field}`);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Try to match by patterns
      for (const sku of targetSKUs) {
        if (!results[sku]) {
          // Look for items that might match this SKU
          const possibleMatches = itemsWithDetails.filter(item => 
            item.seller_sku === sku ||
            item.title.toUpperCase().includes(sku) ||
            item.itemId.includes(sku)
          );
          
          if (possibleMatches.length > 0) {
            const match = possibleMatches[0];
            const details = await getItemDetails(match.itemId, accessToken);
            if (details) {
              const imageUrl = details.pictures && details.pictures.length > 0 
                ? details.pictures[0].secure_url || details.pictures[0].url 
                : details.thumbnail;
                
              results[sku] = {
                mlb: match.itemId,
                title: details.title,
                image: imageUrl,
                found_by: 'pattern_match'
              };
              
              log(colors.green, `✅ ${sku} → ${match.itemId} (pattern match)`);
            }
          }
        }
      }
    }
    
    // Generate final results
    log(colors.bold + colors.green, '\n📋 RESULTADOS FINAIS:\n');
    
    const finalMapping = {};
    for (const sku of targetSKUs) {
      if (results[sku]) {
        finalMapping[sku] = {
          mlb: results[sku].mlb,
          image: results[sku].image
        };
        log(colors.green, `✅ ${sku}:`);
        log(colors.blue, `   MLB: ${results[sku].mlb}`);
        log(colors.blue, `   Título: ${results[sku].title}`);
        log(colors.blue, `   Imagem: ${results[sku].image}`);
        log(colors.yellow, `   Método: ${results[sku].found_by}\n`);
      } else {
        log(colors.red, `❌ ${sku}: NÃO ENCONTRADO\n`);
      }
    }
    
    // Save results to file
    const outputFile = path.join(__dirname, 'ml-correct-mappings.json');
    fs.writeFileSync(outputFile, JSON.stringify(finalMapping, null, 2));
    log(colors.green, `✅ Mapeamentos salvos em: ${outputFile}`);
    
    return finalMapping;
    
  } catch (error) {
    log(colors.red, `❌ Erro fatal: ${error.message}`);
    console.error(error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  findCorrectMappings()
    .then((mappings) => {
      log(colors.bold + colors.green, '\n🎉 BUSCA CONCLUÍDA COM SUCESSO!');
      console.log('\nMapeamentos encontrados:', mappings);
      process.exit(0);
    })
    .catch(error => {
      log(colors.red, '\n❌ FALHA NA BUSCA');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { findCorrectMappings };