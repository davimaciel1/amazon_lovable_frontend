require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function createMLInventoryTable() {
  try {
    console.log('🔄 Criando tabela ml_inventory...');
    
    const sql = `
      -- Create table for storing Mercado Livre inventory data
      CREATE TABLE IF NOT EXISTS ml_inventory (
        item_id text NOT NULL,
        variation_id text,
        seller_sku text,
        available_quantity integer NOT NULL DEFAULT 0,
        title text,
        status text,
        site_id text,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (item_id, COALESCE(variation_id, ''))
      );

      -- Create index for faster SKU lookups
      CREATE INDEX IF NOT EXISTS idx_ml_inventory_seller_sku ON ml_inventory(seller_sku);

      -- Create index for fast status filtering  
      CREATE INDEX IF NOT EXISTS idx_ml_inventory_status ON ml_inventory(status);
    `;
    
    await pool.query(sql);
    console.log('✅ Tabela ml_inventory criada com sucesso!');
    
    // Verificar se a tabela foi criada
    const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'ml_inventory'");
    console.log('🔍 Verificação:', result.rows.length > 0 ? 'Tabela encontrada!' : 'Tabela não encontrada');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    await pool.end();
    process.exit(1);
  }
}

createMLInventoryTable();