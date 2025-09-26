/**
 * Script para sincronizar banco PostgreSQL externo com códigos MLB corretos
 */
const { Pool } = require('pg');

// Mapeamentos corretos dos códigos MLB
const ML_PRODUCT_MAPPINGS = {
  'IPP-PV-01': 'MLB4100879553',
  'IPP-PV-02': 'MLB4100879555', 
  'IPP-PV-03': 'MLB4100879557',
  'IPP-PV-04': 'MLB4100879559',
  'IPP-PV-05': 'MLB4100879561',
  'IPAS01': 'MLB3628967960',
  'IPAS02': 'MLB4258563772', 
  'IPAS04': 'MLB2882967139'
};

async function syncExternalDatabase() {
  console.log('🚀 Starting external PostgreSQL database synchronization...');
  
  // Configuração do banco externo
  const externalPool = new Pool({
    user: process.env.EXTERNAL_POSTGRES_USER,
    host: process.env.EXTERNAL_POSTGRES_HOST,
    database: process.env.EXTERNAL_POSTGRES_DB,
    password: process.env.EXTERNAL_POSTGRES_PASSWORD,
    port: process.env.EXTERNAL_POSTGRES_PORT || 5432,
  });

  try {
    console.log('🔌 Connecting to external database...');
    await externalPool.connect();
    console.log('✅ Connected successfully!');

    // Iniciar transação
    await externalPool.query('BEGIN');
    console.log('🏁 Transaction started');

    let totalUpdated = 0;

    for (const [sku, correctMLB] of Object.entries(ML_PRODUCT_MAPPINGS)) {
      console.log(`\n🔧 Processing ${sku} -> ${correctMLB}`);

      // Verificar dados atuais
      const currentData = await externalPool.query(
        `SELECT table_name, column_name, asin, sku 
         FROM (
           SELECT 'products' as table_name, 'asin' as column_name, asin, sku FROM products WHERE sku = $1 OR asin LIKE '%' || $1 || '%'
           UNION ALL
           SELECT 'order_items' as table_name, 'asin' as column_name, asin, seller_sku as sku FROM order_items WHERE seller_sku = $1 OR asin LIKE '%' || $1 || '%'
         ) combined`,
        [sku]
      );

      if (currentData.rows.length > 0) {
        console.log(`  📋 Found ${currentData.rows.length} records to update:`);
        currentData.rows.forEach(row => {
          console.log(`    - ${row.table_name}: ${row.asin} (sku: ${row.sku})`);
        });
      }

      // Atualizar tabela products
      const productResult = await externalPool.query(
        `UPDATE products SET asin = $1 WHERE sku = $2 OR asin LIKE '%' || $2 || '%'`,
        [correctMLB, sku]
      );

      // Atualizar tabela order_items  
      const orderItemsResult = await externalPool.query(
        `UPDATE order_items SET asin = $1 WHERE seller_sku = $2 OR asin LIKE '%' || $2 || '%'`,
        [correctMLB, sku]
      );

      const updatedCount = productResult.rowCount + orderItemsResult.rowCount;
      totalUpdated += updatedCount;

      console.log(`  ✅ Updated ${updatedCount} rows (products: ${productResult.rowCount}, order_items: ${orderItemsResult.rowCount})`);
    }

    // Commit da transação
    await externalPool.query('COMMIT');
    console.log(`\n🎉 SYNCHRONIZATION COMPLETE! Updated ${totalUpdated} total rows across all tables`);

    // Verificar resultados
    console.log('\n🔍 Verification - Current state:');
    for (const [sku, correctMLB] of Object.entries(ML_PRODUCT_MAPPINGS)) {
      const verification = await externalPool.query(
        `SELECT 'products' as table_name, asin, sku FROM products WHERE sku = $1
         UNION ALL
         SELECT 'order_items' as table_name, asin, seller_sku as sku FROM order_items WHERE seller_sku = $1`,
        [sku]
      );
      
      console.log(`  ${sku}:`);
      verification.rows.forEach(row => {
        const status = row.asin === correctMLB ? '✅' : '❌';
        console.log(`    ${status} ${row.table_name}: ${row.asin}`);
      });
    }

  } catch (error) {
    await externalPool.query('ROLLBACK');
    console.error('❌ Synchronization failed:', error.message);
    console.error('Full error:', error);
    throw error;
  } finally {
    await externalPool.end();
    console.log('🔌 Database connection closed');
  }
}

// Verificar se todas as variáveis necessárias estão definidas
const requiredVars = ['EXTERNAL_POSTGRES_HOST', 'EXTERNAL_POSTGRES_USER', 'EXTERNAL_POSTGRES_DB', 'EXTERNAL_POSTGRES_PASSWORD'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  console.error('Please set the following environment variables:');
  missingVars.forEach(varName => console.error(`  - ${varName}`));
  process.exit(1);
}

syncExternalDatabase()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });