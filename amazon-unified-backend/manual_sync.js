require('dotenv').config();
const { SimpleAmazonSyncService } = require('./dist/services/simple-amazon-sync.service');

async function runManualSync() {
    console.log('🚀 Iniciando sincronização manual dos pedidos da Amazon...');
    
    try {
        const syncService = new SimpleAmazonSyncService();
        
        console.log('📥 Sincronizando pedidos...');
        await syncService.syncOrders();
        
        console.log('📦 Sincronizando produtos...');
        await syncService.syncProducts();
        
        console.log('✅ Sincronização manual concluída com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro na sincronização manual:', error.message);
        console.error(error.stack);
    }
}

runManualSync();
