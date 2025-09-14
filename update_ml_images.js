#!/usr/bin/env node

/**
 * Script para buscar URLs reais de imagens via API do Mercado Livre
 * Usando o access token configurado do MCP
 */

const https = require('https');
const fs = require('fs');

// Lista de produtos ML que precisam de imagens
const mlProducts = [
  'MLB3772801129',
  'MLB4100879553', 
  'MLB5649953084'
];

// Lista de SKUs customizados que precisamos mapear para códigos MLB
const customSKUs = [
  'IPP-PV-02',
  'IPP-PV-04', 
  'IPP-PV-05',
  'IPAS01',
  'IPAS04',
  'IPP-PV-01'
];

const accessToken = process.env.ML_ACCESS_TOKEN;

if (!accessToken) {
  console.error('❌ ML_ACCESS_TOKEN não encontrado!');
  process.exit(1);
}

function makeMLRequest(url) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.mercadolibre.com',
      path: url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Amazon-Seller-Dashboard/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    
    req.end();
  });
}

async function getMLProductImages(itemId) {
  try {
    console.log(`🔍 Buscando imagens para ${itemId}...`);
    const product = await makeMLRequest(`/items/${itemId}`);
    
    if (product.error) {
      console.log(`❌ ${itemId}: ${product.message || 'Erro desconhecido'}`);
      return null;
    }
    
    const images = product.pictures || [];
    const mainImage = images.length > 0 ? images[0].secure_url || images[0].url : null;
    
    if (mainImage) {
      console.log(`✅ ${itemId}: ${mainImage}`);
      return {
        itemId,
        title: product.title,
        mainImage,
        allImages: images.map(img => img.secure_url || img.url),
        permalink: product.permalink
      };
    } else {
      console.log(`⚠️  ${itemId}: Produto sem imagens`);
      return null;
    }
  } catch (error) {
    console.log(`❌ ${itemId}: Erro ${error.message}`);
    return null;
  }
}

async function searchMLProducts(query) {
  try {
    console.log(`🔍 Buscando produtos ML para: "${query}"...`);
    const searchUrl = `/sites/MLB/search?q=${encodeURIComponent(query)}&limit=5`;
    const results = await makeMLRequest(searchUrl);
    
    if (results.results && results.results.length > 0) {
      const firstResult = results.results[0];
      console.log(`🎯 Encontrado: ${firstResult.id} - ${firstResult.title}`);
      return firstResult.id;
    } else {
      console.log(`⚠️  Nenhum produto encontrado para: "${query}"`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Erro na busca de "${query}": ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Iniciando busca de imagens ML via API...\n');
  
  const results = [];
  
  // 1. Buscar imagens dos códigos MLB conhecidos
  console.log('📋 CÓDIGOS MLB CONHECIDOS:');
  for (const itemId of mlProducts) {
    const imageData = await getMLProductImages(itemId);
    if (imageData) {
      results.push(imageData);
    }
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 2. Tentar mapear SKUs customizados para códigos MLB
  console.log('\n📋 MAPEANDO SKUs CUSTOMIZADOS:');
  for (const sku of customSKUs) {
    // Tentar buscar por SKU
    let mlbId = await searchMLProducts(sku);
    
    if (!mlbId) {
      // Tentar buscar por partes do SKU (ex: "Piso Vinílico" para IPP-PV-*)
      if (sku.startsWith('IPP-PV')) {
        mlbId = await searchMLProducts('Piso Vinílico Autocolante');
      } else if (sku.startsWith('IPAS')) {
        mlbId = await searchMLProducts('Protetor Automotivo');
      }
    }
    
    if (mlbId) {
      const imageData = await getMLProductImages(mlbId);
      if (imageData) {
        imageData.originalSKU = sku; // Adicionar SKU original para mapeamento
        results.push(imageData);
      }
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 3. Salvar resultados
  console.log(`\n💾 Salvando ${results.length} resultados...`);
  fs.writeFileSync('ml_images_results.json', JSON.stringify(results, null, 2));
  
  console.log('\n✅ RESULTADOS FINAIS:');
  results.forEach(item => {
    const prefix = item.originalSKU ? `${item.originalSKU} → ` : '';
    console.log(`🖼️  ${prefix}${item.itemId}: ${item.mainImage}`);
  });
  
  console.log(`\n🎯 Total de imagens encontradas: ${results.length}`);
  console.log('📁 Resultados salvos em: ml_images_results.json');
}

if (require.main === module) {
  main().catch(console.error);
}