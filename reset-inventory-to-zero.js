const { Pool } = require('pg');

const pool = new Pool({
  host: '49.12.191.119',
  port: 5456,
  database: 'amazon_monitor',
  user: 'saas',
  password: 'saas_password_123'
});

async function resetInventory() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Resetting all inventory to 0 (waiting for real data)...\n');
    
    // Reset all inventory to 0
    const result = await client.query(`
      UPDATE products 
      SET 
        inventory_quantity = 0,
        in_stock = false,
        updated_at = NOW()
    `);
    
    console.log(`✅ Reset ${result.rowCount} products to 0 inventory`);
    
    // Show all products for reference
    const products = await client.query(`
      SELECT asin, title
      FROM products
      ORDER BY asin
    `);
    
    console.log('\n📦 ALL PRODUCTS (now with 0 inventory):');
    console.log('═'.repeat(80));
    console.log('ASIN          | Product Title');
    console.log('─'.repeat(80));
    
    products.rows.forEach(p => {
      console.log(`${p.asin} | ${p.title}`);
    });
    
    console.log('\n' + '═'.repeat(80));
    console.log('📝 NEXT STEPS:');
    console.log('1. Edit set-real-inventory.js');
    console.log('2. Add your real inventory in the realInventory array');
    console.log('3. Run: node set-real-inventory.js');
    console.log('\nExample format:');
    console.log('const realInventory = [');
    console.log('  { asin: "B0CLBHB46K", stock: 10 },');
    console.log('  { asin: "B0CLBR3ZCN", stock: 5 },');
    console.log('  // Add all your products with real stock');
    console.log('];');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

resetInventory();