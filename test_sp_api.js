require('dotenv').config();
const SellingPartner = require('amazon-sp-api');

async function testSpApiConnection() {
    try {
        console.log('🔍 Testando conexão com Amazon SP-API...');
        
        if (!process.env.SP_API_CLIENT_ID || !process.env.SP_API_CLIENT_SECRET || !process.env.SP_API_REFRESH_TOKEN) {
            console.error('❌ Credenciais SP-API não encontradas no .env');
            return false;
        }
        
        const sp = new SellingPartner({
            region: 'na',
            refresh_token: process.env.SP_API_REFRESH_TOKEN,
            credentials: {
                SELLING_PARTNER_APP_CLIENT_ID: process.env.SP_API_CLIENT_ID,
                SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SP_API_CLIENT_SECRET,
                AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || undefined,
                AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || undefined,
                AWS_SELLING_PARTNER_ROLE: process.env.AWS_SELLING_PARTNER_ROLE || undefined
            }
        });
        
        console.log('📞 Tentando buscar pedidos dos últimos 7 dias...');
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        
        const ordersResponse = await sp.callAPI({
            operation: 'getOrders',
            endpoint: 'orders',
            query: {
                CreatedAfter: startDate.toISOString(),
                MarketplaceIds: ['ATVPDKIKX0DER']
            }
        });
        
        if (ordersResponse && ordersResponse.payload) {
            console.log('✅ Conexão com SP-API funcionando!');
            console.log(`📦 Encontrados ${ordersResponse.payload.Orders ? ordersResponse.payload.Orders.length : 0} pedidos dos últimos 7 dias`);
            
            if (ordersResponse.payload.Orders && ordersResponse.payload.Orders.length > 0) {
                console.log('\n📋 Primeiros 3 pedidos:');
                ordersResponse.payload.Orders.slice(0, 3).forEach(order => {
                    console.log(`- ${order.AmazonOrderId} | ${order.PurchaseDate} | ${order.OrderStatus} | $${order.OrderTotal?.Amount || 'N/A'}`);
                });
            }
            return true;
        } else {
            console.log('⚠️ Resposta da API vazia');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Erro ao conectar com SP-API:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

testSpApiConnection().then(success => {
    console.log(success ? '\n🎉 Teste concluído com sucesso!' : '\n💔 Teste falhou - verifique as credenciais');
});
