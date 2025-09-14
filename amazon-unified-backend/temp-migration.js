const { Pool } = require('pg');

async function runMigration() {
  // Use the same connection string from environment
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Starting ML orders logistic migration...');
    
    // Check if columns exist
    const checkLogisticType = await pool.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'ml_orders' AND column_name = 'logistic_type'
    `);
    
    const checkLogisticMode = await pool.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'ml_orders' AND column_name = 'logistic_mode'
    `);
    
    const logisticTypeExists = checkLogisticType.rows.length > 0;
    const logisticModeExists = checkLogisticMode.rows.length > 0;
    
    console.log('logistic_type exists:', logisticTypeExists);
    console.log('logistic_mode exists:', logisticModeExists);
    
    if (logisticTypeExists && logisticModeExists) {
      console.log('✅ Columns already exist, no migration needed');
      return;
    }
    
    await pool.query('BEGIN');
    
    if (!logisticTypeExists) {
      await pool.query('ALTER TABLE ml_orders ADD COLUMN logistic_type text');
      console.log('✅ Added logistic_type column');
    }
    
    if (!logisticModeExists) {
      await pool.query('ALTER TABLE ml_orders ADD COLUMN logistic_mode text');
      console.log('✅ Added logistic_mode column');
    }
    
    // Create index
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ml_orders_logistic_type ON ml_orders(logistic_type)');
    console.log('✅ Created index');
    
    // Add comments
    await pool.query(`COMMENT ON COLUMN ml_orders.logistic_type IS 'Mercado Livre logistic type: fulfillment (FULL), self_service (FLEX), etc'`);
    await pool.query(`COMMENT ON COLUMN ml_orders.logistic_mode IS 'Mercado Livre logistic mode details from API'`);
    console.log('✅ Added column comments');
    
    await pool.query('COMMIT');
    console.log('✅ Migration completed successfully');
    
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();