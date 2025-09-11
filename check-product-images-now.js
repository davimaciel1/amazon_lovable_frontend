require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: process.env.DB_PORT || 5456,
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123',
  ssl: false
});

async function checkProductImages() {
  try {
    console.log('🔍 Verificando imagens dos produtos no banco de dados...\n');
    
    // 1. Verificar estrutura da tabela
    const structureQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      AND column_name LIKE '%image%'
      ORDER BY ordinal_position
    `;
    
    const structureResult = await pool.query(structureQuery);
    console.log('📊 Colunas de imagem na tabela products:');
    structureResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    // 2. Verificar alguns produtos e suas URLs de imagem
    const productsQuery = `
      SELECT 
        asin,
        title,
        image_url,
        local_image_url,
        CASE 
          WHEN image_url IS NOT NULL AND image_url != '' THEN 'Tem URL Amazon'
          ELSE 'Sem URL Amazon'
        END as status_amazon,
        CASE 
          WHEN local_image_url IS NOT NULL AND local_image_url != '' THEN 'Tem URL Local'
          ELSE 'Sem URL Local'
        END as status_local
      FROM products
      ORDER BY asin
      LIMIT 10
    `;
    
    const productsResult = await pool.query(productsQuery);
    console.log('\n📦 Primeiros 10 produtos e status das imagens:');
    console.log('=' .repeat(100));
    
    productsResult.rows.forEach(product => {
      console.log(`ASIN: ${product.asin}`);
      console.log(`Título: ${product.title || 'Sem título'}`);
      console.log(`URL Amazon: ${product.image_url || 'VAZIO'}`);
      console.log(`URL Local: ${product.local_image_url || 'VAZIO'}`);
      console.log(`Status: ${product.status_amazon} | ${product.status_local}`);
      console.log('-'.repeat(100));
    });
    
    // 3. Estatísticas gerais
    const statsQuery = `
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) as with_amazon_url,
        COUNT(CASE WHEN local_image_url IS NOT NULL AND local_image_url != '' THEN 1 END) as with_local_url,
        COUNT(CASE WHEN (image_url IS NULL OR image_url = '') AND (local_image_url IS NULL OR local_image_url = '') THEN 1 END) as without_any_image
      FROM products
    `;
    
    const statsResult = await pool.query(statsQuery);
    const stats = statsResult.rows[0];
    
    console.log('\n📈 ESTATÍSTICAS DE IMAGENS:');
    console.log('=' .repeat(50));
    console.log(`Total de produtos: ${stats.total_products}`);
    console.log(`Com URL Amazon: ${stats.with_amazon_url} (${((stats.with_amazon_url/stats.total_products)*100).toFixed(1)}%)`);
    console.log(`Com URL Local: ${stats.with_local_url} (${((stats.with_local_url/stats.total_products)*100).toFixed(1)}%)`);
    console.log(`Sem nenhuma imagem: ${stats.without_any_image} (${((stats.without_any_image/stats.total_products)*100).toFixed(1)}%)`);
    
    // 4. Verificar se há produtos com imagens placeholder
    const placeholderQuery = `
      SELECT COUNT(*) as placeholder_count
      FROM products
      WHERE image_url LIKE '%placeholder%' 
         OR local_image_url LIKE '%placeholder%'
         OR image_url LIKE '%no-image%'
         OR local_image_url LIKE '%no-image%'
    `;
    
    const placeholderResult = await pool.query(placeholderQuery);
    console.log(`\n⚠️  Produtos com imagem placeholder: ${placeholderResult.rows[0].placeholder_count}`);
    
  } catch (error) {
    console.error('❌ Erro ao verificar imagens:', error);
  } finally {
    await pool.end();
  }
}

checkProductImages();