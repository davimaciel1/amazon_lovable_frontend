#!/usr/bin/env node
/**
 * FORÇA RECARREGAMENTO: Atualiza TODAS as imagens ML com dados corretos
 * Este script vai limpar e recarregar todas as imagens dos produtos ML
 */

const { Pool } = require('pg');
const axios = require('axios');

// Create database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Mapping correto de SKUs para códigos MLB REAIS
const CORRECT_MLB_MAPPINGS = {
  // IPAS codes - arame de solda corretos
  'IPAS01': { mlb: 'MLB3628967960', title: 'Arame Solda Mig Sem Gás Tubular 0.8mm 1kg Lynus' },
  'IPAS02': { mlb: 'MLB4258563772', title: 'Eletrodo 6013 2.5mm 5kg' },
  'IPAS04': { mlb: 'MLB2882967139', title: 'Arame Solda Mig Tubular Uso Sem Gás 0.8mm' },
  
  // IPP codes - pisos vinílicos  
  'IPP-PV-01': { mlb: 'MLB4100879553', title: 'Piso Vinílico Autocolante' },
  'IPP-PV-02': { mlb: 'MLB4100879553', title: 'Piso Vinílico Autocolante' },
  'IPP-PV-03': { mlb: 'MLB4100879553', title: 'Piso Vinílico Autocolante' },
  'IPP-PV-04': { mlb: 'MLB4100879553', title: 'Piso Vinílico Autocolante' },
  'IPP-PV-05': { mlb: 'MLB4100879553', title: 'Piso Vinílico Autocolante' },
};

// Fetch ML item details
async function fetchMLItem(itemId) {
  try {
    const token = process.env.ML_ACCESS_TOKEN;
    const url = `https://api.mercadolibre.com/items/${itemId}`;
    
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log(`🔍 Buscando dados ML para: ${itemId}`);
    const response = await axios.get(url, {
      headers,
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error(`❌ Erro ao buscar ${itemId}:`, error.message);
    return null;
  }
}

async function forceReloadMLImages() {
  try {
    console.log('🚀 FORÇA RECARREGAMENTO - Iniciando limpeza e recarregamento de imagens ML...\n');
    
    let updatedCount = 0;
    let errorCount = 0;
    
    // PASSO 1: Limpar todas as imagens ML existentes
    console.log('🧹 PASSO 1: Limpando todas as imagens ML do banco...');
    await pool.query(`
      UPDATE products 
      SET image_url = NULL, image_source_url = NULL, local_image_url = NULL, updated_at = NOW()
      WHERE (marketplace_id = 'MLB' OR asin LIKE 'MLB%' OR asin LIKE 'IPP%' OR asin LIKE 'IPA%')
    `);
    console.log('✅ Imagens ML limpas do banco de dados\n');
    
    // PASSO 2: Recarregar com mapeamentos corretos
    console.log('📥 PASSO 2: Recarregando imagens com códigos MLB corretos...');
    
    for (const [sku, mapping] of Object.entries(CORRECT_MLB_MAPPINGS)) {
      try {
        console.log(`\n🔄 Processando ${sku} → ${mapping.mlb}`);
        
        // Buscar dados reais da API ML
        const mlItem = await fetchMLItem(mapping.mlb);
        
        if (mlItem && mlItem.pictures && mlItem.pictures.length > 0) {
          const imageUrl = mlItem.pictures[0].secure_url || mlItem.pictures[0].url;
          const title = mlItem.title || mapping.title;
          
          // Atualizar no banco de dados
          const result = await pool.query(`
            UPDATE products 
            SET 
              image_url = $1,
              image_source_url = $2,
              title = $3,
              updated_at = NOW()
            WHERE asin = $4 OR sku = $4
          `, [imageUrl, imageUrl, title, sku]);
          
          if (result.rowCount && result.rowCount > 0) {
            updatedCount += result.rowCount;
            console.log(`✅ ${sku}: ${result.rowCount} produtos atualizados`);
            console.log(`   📸 Imagem: ${imageUrl}`);
            console.log(`   📝 Título: ${title}`);
          } else {
            console.log(`⚠️  ${sku}: Nenhum produto encontrado no banco`);
          }
        } else {
          errorCount++;
          console.log(`❌ ${sku}: Não foi possível obter dados da ML API`);
        }
        
        // Delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Erro ao processar ${sku}:`, error.message);
      }
    }
    
    // PASSO 3: Verificar produtos sem imagem e buscar automaticamente
    console.log('\n🔍 PASSO 3: Verificando produtos MLB sem imagem...');
    
    const remainingResult = await pool.query(`
      SELECT DISTINCT asin, sku, title, marketplace_id
      FROM products
      WHERE (marketplace_id = 'MLB' OR asin LIKE 'MLB%')
        AND (image_url IS NULL OR image_url = '')
      ORDER BY asin
      LIMIT 10
    `);
    
    for (const product of remainingResult.rows) {
      if (product.asin && product.asin.startsWith('MLB')) {
        console.log(`\n🔍 Buscando imagem para MLB direto: ${product.asin}`);
        
        const mlItem = await fetchMLItem(product.asin);
        
        if (mlItem && mlItem.pictures && mlItem.pictures.length > 0) {
          const imageUrl = mlItem.pictures[0].secure_url || mlItem.pictures[0].url;
          
          await pool.query(`
            UPDATE products 
            SET image_url = $1, image_source_url = $2, updated_at = NOW() 
            WHERE asin = $3
          `, [imageUrl, imageUrl, product.asin]);
          
          updatedCount++;
          console.log(`✅ ${product.asin}: Imagem adicionada`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n🎉 RECARREGAMENTO FINALIZADO!');
    console.log(`📊 Estatísticas finais:`);
    console.log(`   ✅ Produtos atualizados: ${updatedCount}`);
    console.log(`   ❌ Erros: ${errorCount}`);
    console.log(`   🎯 Total processado: ${updatedCount + errorCount}`);
    
  } catch (error) {
    console.error('💥 Erro fatal:', error);
  } finally {
    await pool.end();
  }
}

// Executar o script
forceReloadMLImages();