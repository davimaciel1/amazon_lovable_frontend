const { Pool } = require('pg');
const readline = require('readline');

const pool = new Pool({
  host: '49.12.191.119',
  port: 5456,
  database: 'amazon_monitor',
  user: 'saas',
  password: 'saas_password_123'
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setRealInventory() {
  const client = await pool.connect();
  
  try {
    console.log('📦 SET REAL INVENTORY VALUES');
    console.log('═'.repeat(80));
    console.log('Please provide your ACTUAL inventory levels for each product.');
    console.log('Enter the real stock quantity for each ASIN, or press Enter to skip.\n');
    
    // Get all products
    const products = await client.query(`
      SELECT asin, title, inventory_quantity as current_stock
      FROM products
      ORDER BY asin
      LIMIT 20
    `);
    
    const updates = [];
    
    for (const product of products.rows) {
      console.log(`\nASIN: ${product.asin}`);
      console.log(`Product: ${product.title}`);
      console.log(`Current (wrong) stock: ${product.current_stock}`);
      
      const input = await question('Enter REAL stock quantity (or press Enter to keep 0): ');
      
      if (input && !isNaN(input)) {
        const realStock = parseInt(input);
        updates.push({ asin: product.asin, stock: realStock });
        
        await client.query(
          'UPDATE products SET inventory_quantity = $1, in_stock = $2 WHERE asin = $3',
          [realStock, realStock > 0, product.asin]
        );
        
        console.log(`✅ Updated ${product.asin} to ${realStock} units`);
      } else if (input === '') {
        // Set to 0 if no input
        await client.query(
          'UPDATE products SET inventory_quantity = 0, in_stock = false WHERE asin = $1',
          [product.asin]
        );
        console.log(`✅ Set ${product.asin} to 0 units (no stock)`);
      }
    }
    
    // Show summary
    const summary = await client.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN inventory_quantity > 0 THEN 1 END) as products_with_stock,
        SUM(inventory_quantity) as total_units
      FROM products
    `);
    
    const stats = summary.rows[0];
    
    console.log('\n' + '═'.repeat(80));
    console.log('📊 INVENTORY UPDATE COMPLETE');
    console.log('═'.repeat(80));
    console.log(`Total Products: ${stats.total_products}`);
    console.log(`Products with Stock: ${stats.products_with_stock}`);
    console.log(`Total Units in Stock: ${stats.total_units}`);
    
    console.log('\n✅ Real inventory values have been set!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    pool.end();
    rl.close();
  }
}

// Alternative: Set all to 0 and update specific ones
async function setSpecificInventory() {
  const client = await pool.connect();
  
  try {
    console.log('📦 SETTING REAL INVENTORY VALUES');
    console.log('═'.repeat(80));
    
    // First, set all to 0
    await client.query('UPDATE products SET inventory_quantity = 0, in_stock = false');
    console.log('✅ Reset all inventory to 0');
    
    // UPDATE THIS WITH YOUR REAL INVENTORY DATA
    // Format: { asin: 'ASIN_CODE', stock: REAL_QUANTITY }
    const realInventory = [
      // EXAMPLE - REPLACE WITH YOUR REAL DATA:
      // { asin: 'B0CLBHB46K', stock: 10 },  // Your real stock for this item
      // { asin: 'B0CLBR3ZCN', stock: 5 },   // Your real stock for this item
      // { asin: 'B0CJLGXXLT', stock: 20 },  // Your real stock for this item
      // Add all your products with real stock here
    ];
    
    if (realInventory.length === 0) {
      console.log('\n⚠️  No inventory data provided!');
      console.log('📝 Edit this file and add your real inventory in the realInventory array above.');
      console.log('Format: { asin: "ASIN_CODE", stock: REAL_QUANTITY }');
      return;
    }
    
    for (const item of realInventory) {
      await client.query(
        'UPDATE products SET inventory_quantity = $1, in_stock = $2 WHERE asin = $3',
        [item.stock, item.stock > 0, item.asin]
      );
      console.log(`✅ Set ${item.asin}: ${item.stock} units`);
    }
    
    // Show updated inventory
    const results = await client.query(`
      SELECT asin, title, inventory_quantity
      FROM products
      WHERE inventory_quantity > 0
      ORDER BY inventory_quantity DESC
    `);
    
    console.log('\n📦 Products with Stock:');
    console.log('═'.repeat(80));
    results.rows.forEach(p => {
      console.log(`${p.asin}: ${p.title}`);
      console.log(`  Stock: ${p.inventory_quantity} units`);
    });
    
    console.log('\n✅ Real inventory values have been set!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

// Choose which method to use:
// Option 1: Interactive mode (uncomment to use)
// setRealInventory();

// Option 2: Batch update mode (default)
setSpecificInventory();