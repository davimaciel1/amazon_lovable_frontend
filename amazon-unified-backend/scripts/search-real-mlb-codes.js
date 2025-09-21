#!/usr/bin/env node

/**
 * Script para buscar códigos MLB reais na API do Mercado Livre
 * Busca produtos pelos títulos/termos e encontra os códigos MLB corretos
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Produtos para buscar na API do ML
const PRODUCTS_TO_SEARCH = [
  { sku: 'IPAS01', terms: 'arame solda mig tubular 0.8mm 1kg', title: 'Arame Solda Mig Tubular 0.8mm 1kg' },
  { sku: 'IPAS02', terms: 'eletrodo 6013 2.5mm 5kg', title: 'Eletrodo 6013 2.5mm 5kg' },
  { sku: 'IPAS04', terms: 'arame solda mig er70s-6 0.8mm 5kg', title: 'Arame Solda Mig Er70s-6 0.8mm 5kg' },
  { sku: 'IPP-PV-01', terms: 'piso vinílico autocolante', title: 'Piso Vinílico Autocolante' },
  { sku: 'IPP-PV-02', terms: 'piso vinílico autocolante', title: 'Piso Vinílico Autocolante' },
  { sku: 'IPP-PV-04', terms: 'piso vinílico autocolante', title: 'Piso Vinílico Autocolante' },
  { sku: 'IPP-PV-05', terms: 'piso vinílico autocolante', title: 'Piso Vinílico Autocolante' },
];

// Função para buscar na API do Mercado Livre
async function searchMercadoLivre(query, limit = 5) {
  try {
    console.log(`🔍 Buscando: "${query}"`);
    
    const response = await axios.get('https://api.mercadolibre.com/sites/MLB/search', {
      params: {
        q: query,
        limit: limit,
        condition: 'new'
      },
      timeout: 10000
    });

    return response.data.results || [];
  } catch (error) {
    console.error(`❌ Erro ao buscar "${query}":`, error.message);
    return [];
  }
}

// Função para obter detalhes do produto
async function getProductDetails(itemId) {
  try {
    const response = await axios.get(`https://api.mercadolibre.com/items/${itemId}`, {
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Erro ao buscar detalhes de ${itemId}:`, error.message);
    return null;
  }
}

// Função principal
async function findRealMLBCodes() {
  console.log('🚀 Iniciando busca por códigos MLB reais...\n');
  
  const results = [];
  
  for (const product of PRODUCTS_TO_SEARCH) {
    console.log(`\n📦 Processando: ${product.sku} - ${product.title}`);
    
    // Buscar produtos similares
    const searchResults = await searchMercadoLivre(product.terms);
    
    if (searchResults.length === 0) {
      console.log(`⚠️  Nenhum resultado encontrado para ${product.sku}`);
      continue;
    }

    console.log(`✅ Encontrados ${searchResults.length} resultados:`);
    
    // Processar os 3 primeiros resultados
    for (let i = 0; i < Math.min(3, searchResults.length); i++) {
      const item = searchResults[i];
      console.log(`   ${i + 1}. ${item.id} - ${item.title.substring(0, 60)}...`);
      console.log(`      💰 R$ ${item.price} | 👍 ${item.sold_quantity || 0} vendidos`);
      
      // Buscar detalhes para obter imagens
      const details = await getProductDetails(item.id);
      if (details && details.pictures && details.pictures.length > 0) {
        const imageUrl = details.pictures[0].secure_url || details.pictures[0].url;
        console.log(`      🖼️  Imagem: ${imageUrl.substring(0, 80)}...`);
        
        results.push({
          sku: product.sku,
          title: product.title,
          mlb_code: item.id,
          mlb_title: item.title,
          price: item.price,
          image: imageUrl,
          permalink: item.permalink,
          sold_quantity: item.sold_quantity || 0
        });
      }
      
      // Delay para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Salvar resultados
  const outputPath = path.join(__dirname, 'real-mlb-codes.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  console.log(`\n✅ Busca concluída! Resultados salvos em: ${outputPath}`);
  console.log(`📊 Total de códigos MLB reais encontrados: ${results.length}`);
  
  // Exibir resumo
  console.log('\n📋 RESUMO DOS CÓDIGOS MLB REAIS ENCONTRADOS:');
  console.log('=' .repeat(60));
  
  const groupedResults = {};
  results.forEach(result => {
    if (!groupedResults[result.sku]) {
      groupedResults[result.sku] = [];
    }
    groupedResults[result.sku].push(result);
  });
  
  Object.keys(groupedResults).forEach(sku => {
    console.log(`\n${sku}:`);
    groupedResults[sku].forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.mlb_code} - R$ ${item.price}`);
      console.log(`     📝 ${item.mlb_title.substring(0, 50)}...`);
    });
  });

  return results;
}

// Executar se chamado diretamente
if (require.main === module) {
  findRealMLBCodes()
    .then(() => {
      console.log('\n🎉 Script concluído com sucesso!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Erro durante execução:', error);
      process.exit(1);
    });
}

module.exports = { findRealMLBCodes, searchMercadoLivre, getProductDetails };