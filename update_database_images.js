#!/usr/bin/env node

/**
 * Script para FORÇAR atualização das URLs reais de imagens ML no database
 */

const fs = require('fs');

// Dados das imagens reais obtidas via API ML
const imageData = [
  {
    itemId: "MLB3772801129",
    title: "Porus One 30 X 500 Mg Ração Suplementar Para Gatos Renal",
    mainImage: "https://http2.mlstatic.com/D_775949-MLB77572311431_072024-O.jpg"
  },
  {
    itemId: "MLB4100879553", 
    title: "Piso Vinílico Autocolante Caixa 1,25m2 Aplique Você Mesmo",
    mainImage: "https://http2.mlstatic.com/D_866143-MLB87636555295_072025-O.jpg"
  },
  {
    itemId: "MLB5649953084",
    title: "Porus One 30 X 500 Mg Ração Suplementar Para Gatos Renal", 
    mainImage: "https://http2.mlstatic.com/D_980841-MLA91448905807_092025-O.jpg"
  }
];

// Gerar SQL de update
const sqlUpdates = imageData.map(item => {
  return `UPDATE products SET 
    image_url = '${item.mainImage}',
    image_source_url = '${item.mainImage}',
    title = '${item.title.replace(/'/g, "''")}'
  WHERE asin = '${item.itemId}' OR sku = '${item.itemId}';`;
}).join('\n\n');

console.log('=== SQL PARA ATUALIZAR IMAGENS REAIS ===\n');
console.log(sqlUpdates);

// Salvar SQL em arquivo
fs.writeFileSync('update_images.sql', sqlUpdates);
console.log('\n✅ SQL salvo em: update_images.sql');

// Gerar comando curl para testar
const curlCommands = imageData.map(item => {
  return `curl -I "${item.mainImage}"`;
}).join('\n');

console.log('\n=== COMANDOS PARA TESTAR URLs ===\n');
console.log(curlCommands);

console.log('\n🎯 PRÓXIMOS PASSOS:');
console.log('1. Execute o SQL gerado contra o database');
console.log('2. Teste as URLs das imagens');
console.log('3. Verifique no frontend se as imagens aparecem');
console.log('4. Corrija os mapeamentos de SKUs customizados');