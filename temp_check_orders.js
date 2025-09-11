require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

(async () => {
  try {
    // Verificar pedidos de Janeiro 2025
    const jan2025 = await pool.query(`
      SELECT amazon_order_id, purchase_date, order_status 
      FROM orders 
      WHERE purchase_date >= '2025-01-01' 
      ORDER BY purchase_date DESC 
      LIMIT 20
    `);
    
    console.log('\n=== PEDIDOS DE JANEIRO 2025 ===');
    console.log('Total encontrados:', jan2025.rows.length);
    
    if (jan2025.rows.length > 0) {
      jan2025.rows.forEach(order => {
        console.log(`- ${order.amazon_order_id} | ${order.purchase_date} | ${order.order_status}`);
      });
    } else {
      console.log('❌ Nenhum pedido encontrado em Janeiro 2025');
    }
    
    // Verificar último pedido no banco
    const lastOrder = await pool.query(`
      SELECT amazon_order_id, purchase_date, order_status, updated_at 
      FROM orders 
      ORDER BY purchase_date DESC 
      LIMIT 5
    `);
    
    console.log('\n=== ÚLTIMOS 5 PEDIDOS NO BANCO ===');
    lastOrder.rows.forEach(order => {
      console.log(`- ${order.amazon_order_id} | ${order.purchase_date} | ${order.order_status} | Updated: ${order.updated_at}`);
    });
    
    // Verificar status da sincronização
    const syncStats = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        MAX(purchase_date) as last_order_date,
        MAX(updated_at) as last_sync
      FROM orders
    `);
    
    console.log('\n=== ESTATÍSTICAS DO BANCO ===');
    console.log('Total de pedidos:', syncStats.rows[0].total_orders);
    console.log('Data do último pedido:', syncStats.rows[0].last_order_date);
    console.log('Última sincronização:', syncStats.rows[0].last_sync);
    
  } catch(e) {
    console.error('Erro:', e.message);
  } finally {
    await pool.end();
  }
})();
