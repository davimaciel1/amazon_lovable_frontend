const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: process.env.DB_PORT || 5456,
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123'
});

async function getProductsWithImages() {
  try {
    const query = `
      SELECT 
        p.asin,
        p.sku,
        p.title,
        p.price,
        p.image_url
      FROM products p
      WHERE p.image_url IS NOT NULL 
        AND p.image_url != ''
      ORDER BY p.updated_at DESC
      LIMIT 5
    `;
    
    const result = await pool.query(query);
    console.log('========================================');
    console.log('PRODUTOS COM IMAGENS NO BANCO DE DADOS');
    console.log('========================================\n');
    console.log(`Total de produtos encontrados: ${result.rows.length}\n`);
    
    result.rows.forEach((product, index) => {
      console.log(`Produto ${index + 1}:`);
      console.log('  ASIN:', product.asin);
      console.log('  SKU:', product.sku);
      console.log('  Título:', product.title?.substring(0, 80));
      console.log('  Preço: R$', product.price);
      console.log('  URL da Imagem:', product.image_url);
      console.log('  ---');
    });
    
    console.log('\n========================================');
    console.log('Para visualizar as imagens, abra o arquivo:');
    console.log('visualize-product-images.html no navegador');
    console.log('========================================');
    
    pool.end();
  } catch (err) {
    console.error('Erro ao buscar produtos:', err.message);
    pool.end();
  }
}

getProductsWithImages();