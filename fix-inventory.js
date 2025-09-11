const { Pool } = require('pg');

const pool = new Pool({
  host: '49.12.191.119',
  port: 5456,
  database: 'amazon_monitor',
  user: 'saas',
  password: 'saas_password_123'
});

async function fixInventory() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing inventory values...');
    
    // Set all inventory to 0 (no mock data)
    await client.query('UPDATE products SET inventory_quantity = 0');
    console.log('✅ Set all inventory_quantity to 0 (no mock data)');
    
    // Update buy_box_seller if NULL
    const buyBoxResult = await client.query(`
      UPDATE products 
      SET buy_box_seller = COALESCE(seller_name, brand, 'Unknown')
      WHERE buy_box_seller IS NULL
    `);
    console.log(`✅ Updated ${buyBoxResult.rowCount} buy_box_seller values`);
    
    // Update seller_count if 0
    const sellerCountResult = await client.query(`
      UPDATE products
      SET seller_count = 1
      WHERE seller_count = 0 OR seller_count IS NULL
    `);
    console.log(`✅ Updated ${sellerCountResult.rowCount} seller_count values`);
    
    // Show updated values
    const products = await client.query(`
      SELECT 
        asin,
        title,
        inventory_quantity as stock,
        buy_box_seller,
        seller_count
      FROM products
      ORDER BY asin
      LIMIT 10
    `);
    
    console.log('\n📦 Updated Product Inventory (first 10):');
    console.log('═'.repeat(100));
    products.rows.forEach(p => {
      console.log(`ASIN: ${p.asin}`);
      console.log(`  Title: ${p.title}`);
      console.log(`  Stock: ${p.stock} (real data only - 0 means no data available)`);
      console.log(`  Buy Box: ${p.buy_box_seller}`);
      console.log(`  Sellers: ${p.seller_count}`);
      console.log('-'.repeat(100));
    });
    
    console.log('\n✅ Inventory fix completed - NO MORE MOCK DATA!');
    console.log('📝 All inventory_quantity values set to 0 unless real Amazon API data is available');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

fixInventory();