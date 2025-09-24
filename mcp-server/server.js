#!/usr/bin/env node

/**
 * Amazon Seller Dashboard MCP Server
 * Model Context Protocol server para ChatGPT integração
 * 
 * Fornece acesso aos dados de vendas da Amazon e Mercado Livre
 * através de ferramentas search e fetch para ChatGPT
 */

import fastify from 'fastify';
import cors from '@fastify/cors';
import axios from 'axios';

// Configuração do servidor
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const MCP_SERVER_PORT = process.env.MCP_SERVER_PORT || 8008;

// Criar servidor Fastify
const server = fastify({
  logger: true
});

// Configurar CORS
await server.register(cors, {
  origin: true,
  credentials: true
});

/**
 * Buscar dados de vendas do backend principal
 */
async function fetchSalesData(query = '', limit = 10) {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/sales-unified`, {
      params: {
        page: 1,
        limit: limit,
        sortBy: 'revenue',
        sortDir: 'desc',
        channel: 'all'
      }
    });

    if (response.data?.success && response.data?.data) {
      const rows = Array.isArray(response.data.data) ? response.data.data : (response.data.data.rows || []);
      
      // Filtrar por query se fornecida
      if (query && query.trim()) {
        const searchQuery = query.toLowerCase();
        return rows.filter(row => 
          row.sku?.toLowerCase().includes(searchQuery) ||
          row.asin?.toLowerCase().includes(searchQuery) ||
          row.title?.toLowerCase().includes(searchQuery) ||
          row.product?.toLowerCase().includes(searchQuery) ||
          row.marketplace_code?.toLowerCase().includes(searchQuery)
        );
      }
      
      return rows;
    }
    
    return [];
  } catch (error) {
    server.log.error('Erro ao buscar dados de vendas:', error.message);
    return [];
  }
}

/**
 * Buscar estatísticas do dashboard
 */
async function fetchDashboardStats() {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/dashboard/stats`);
    return response.data || {};
  } catch (error) {
    server.log.error('Erro ao buscar estatísticas:', error.message);
    return {};
  }
}

/**
 * Ferramenta search para ChatGPT MCP
 * Busca produtos por SKU, ASIN, título ou marketplace
 */
server.post('/search', async (request, reply) => {
  try {
    const { query } = request.body || {};
    
    server.log.info(`🔍 Search query: "${query}"`);
    
    const salesData = await fetchSalesData(query, 20);
    const stats = await fetchDashboardStats();
    
    // Formatar resultados para MCP
    const results = salesData.map((item, index) => ({
      id: item.id || `product-${index}`,
      title: `${item.title || item.product || 'Produto'} (${item.sku})`,
      text: `SKU: ${item.sku} | ASIN: ${item.asin} | Marketplace: ${item.marketplace_code} | Revenue: R$ ${item.revenue?.toFixed(2)} | Units: ${item.units} | Stock: ${item.stock}`,
      url: `${process.env.FRONTEND_URL || 'https://your-app.replit.dev'}/sales?sku=${item.sku}`
    }));
    
    // Adicionar estatísticas gerais se não houver query específica
    if (!query || !query.trim()) {
      results.unshift({
        id: 'dashboard-stats',
        title: 'Estatísticas Gerais do Dashboard',
        text: `Total de vendas: R$ ${stats.totalRevenue?.toFixed(2) || '0'} | Total de unidades: ${stats.totalUnits || 0} | Produtos ativos: ${stats.totalProducts || 0}`,
        url: `${process.env.FRONTEND_URL || 'https://your-app.replit.dev'}/sales`
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ results })
        }
      ]
    };
    
  } catch (error) {
    server.log.error('Erro na busca:', error);
    return {
      content: [
        {
          type: "text", 
          text: JSON.stringify({ 
            results: [],
            error: 'Erro interno do servidor'
          })
        }
      ]
    };
  }
});

/**
 * Ferramenta fetch para ChatGPT MCP
 * Obtém detalhes completos de um produto específico
 */
server.post('/fetch', async (request, reply) => {
  try {
    const { id } = request.body || {};
    
    server.log.info(`📄 Fetch ID: "${id}"`);
    
    if (id === 'dashboard-stats') {
      const stats = await fetchDashboardStats();
      const salesData = await fetchSalesData('', 50);
      
      // Análise detalhada para o dashboard
      const marketplaces = {};
      const topProducts = salesData.slice(0, 10);
      let totalRevenue = 0;
      let totalUnits = 0;
      
      salesData.forEach(item => {
        const marketplace = item.marketplace_code || 'UNKNOWN';
        if (!marketplaces[marketplace]) {
          marketplaces[marketplace] = { revenue: 0, units: 0, products: 0 };
        }
        marketplaces[marketplace].revenue += item.revenue || 0;
        marketplaces[marketplace].units += item.units || 0;
        marketplaces[marketplace].products += 1;
        
        totalRevenue += item.revenue || 0;
        totalUnits += item.units || 0;
      });
      
      const result = {
        id: 'dashboard-stats',
        title: 'Análise Completa do Dashboard Amazon Seller',
        text: `
## Resumo Executivo
- **Total de Revenue**: R$ ${totalRevenue.toFixed(2)}
- **Total de Unidades Vendidas**: ${totalUnits}
- **Total de Produtos**: ${salesData.length}

## Performance por Marketplace
${Object.entries(marketplaces).map(([marketplace, data]) => 
  `### ${marketplace}
- Revenue: R$ ${data.revenue.toFixed(2)}
- Unidades: ${data.units}
- Produtos: ${data.products}`
).join('\n')}

## Top 10 Produtos por Revenue
${topProducts.map((product, i) => 
  `${i+1}. **${product.title || product.product}** (${product.sku})
   - Revenue: R$ ${(product.revenue || 0).toFixed(2)}
   - Unidades: ${product.units || 0}
   - Estoque: ${product.stock || 0}
   - Marketplace: ${product.marketplace_code}`
).join('\n')}

## Insights e Recomendações
- Produto com maior revenue: ${topProducts[0]?.title || 'N/A'}
- Marketplace dominante: ${Object.entries(marketplaces).sort((a,b) => b[1].revenue - a[1].revenue)[0]?.[0] || 'N/A'}
- Produtos com estoque baixo: ${salesData.filter(p => (p.stock || 0) < 10).length}
        `,
        url: `${process.env.FRONTEND_URL || 'https://your-app.replit.dev'}/sales`,
        metadata: {
          type: 'dashboard_analysis',
          generated_at: new Date().toISOString(),
          total_products: salesData.length
        }
      };
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    }
    
    // Buscar produto específico por ID
    const salesData = await fetchSalesData('', 100);
    const product = salesData.find(item => item.id === id || item.sku === id || item.asin === id);
    
    if (!product) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id,
              title: 'Produto não encontrado',
              text: `Produto com ID "${id}" não foi encontrado nos dados de vendas.`,
              url: `${process.env.FRONTEND_URL || 'https://your-app.replit.dev'}/sales`,
              metadata: { error: 'not_found' }
            })
          }
        ]
      };
    }
    
    // Análise detalhada do produto
    const result = {
      id: product.id,
      title: `${product.title || product.product} - Análise Detalhada`,
      text: `
## Informações do Produto
- **SKU**: ${product.sku}
- **ASIN**: ${product.asin}
- **Título**: ${product.title || product.product}
- **Marketplace**: ${product.marketplace_code}

## Performance de Vendas
- **Revenue Total**: R$ ${(product.revenue || 0).toFixed(2)}
- **Unidades Vendidas**: ${product.units || 0}
- **Preço Médio**: R$ ${(product.price || 0).toFixed(2)}
- **Total de Pedidos**: ${product.orders || 0}

## Inventário e Logística
- **Estoque Atual**: ${product.stock || 0} unidades
- **Tipo de Fulfillment**: ${product.fulfillment_type || 'N/A'}
- **Buy Box Winner**: ${product.buy_box_winner || 'N/A'}
- **Número de Sellers**: ${product.sellers || 0}

## Análise Financeira
- **Profit**: ${product.profit ? `R$ ${product.profit.toFixed(2)}` : 'Não calculado'}
- **ROI**: ${product.roi ? `${product.roi.toFixed(2)}%` : 'Não calculado'}
- **ACOS**: ${product.acos ? `${product.acos.toFixed(2)}%` : 'Não calculado'}
- **Health Status**: ${product.health || 'Unknown'}

## Custos (se disponíveis)
${product.costs ? `
- **Custo de Compra**: ${product.costs.compra || 'Não informado'}
- **Armazenagem**: ${product.costs.armazenagem || 'Não informado'}
- **Frete Amazon**: ${product.costs.frete_amazon || 'Não informado'}
- **Impostos**: ${product.costs.imposto_percent || 'Não informado'}
` : '- Custos não configurados'}

## Recomendações
${(product.stock || 0) < 10 ? '⚠️ **ATENÇÃO**: Estoque baixo! Considere reabastecer.\n' : ''}
${(product.health === 'poor') ? '❌ **ALERTA**: Performance ruim detectada.\n' : ''}
${(product.revenue || 0) > 5000 ? '⭐ **DESTAQUE**: Este é um dos seus produtos top performers!\n' : ''}
      `,
      url: `${process.env.FRONTEND_URL || 'https://your-app.replit.dev'}/sales?sku=${product.sku}`,
      metadata: {
        type: 'product_analysis',
        sku: product.sku,
        asin: product.asin,
        marketplace: product.marketplace_code,
        generated_at: new Date().toISOString()
      }
    };
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result)
        }
      ]
    };
    
  } catch (error) {
    server.log.error('Erro no fetch:', error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            id: id || 'unknown',
            title: 'Erro no servidor',
            text: 'Ocorreu um erro interno do servidor ao buscar os dados.',
            url: `${process.env.FRONTEND_URL || 'https://your-app.replit.dev'}/sales`,
            metadata: { error: 'internal_server_error' }
          })
        }
      ]
    };
  }
});

/**
 * Health check endpoint
 */
server.get('/health', async (request, reply) => {
  return { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    backend_url: BACKEND_URL
  };
});

/**
 * Endpoint de informações do servidor MCP
 */
server.get('/info', async (request, reply) => {
  return {
    name: 'Amazon Seller Dashboard MCP Server',
    version: '1.0.0',
    description: 'Servidor MCP para integração do ChatGPT com dados de vendas Amazon/ML',
    tools: ['search', 'fetch'],
    backend_url: BACKEND_URL,
    timestamp: new Date().toISOString()
  };
});

// Iniciar servidor
const start = async () => {
  try {
    await server.listen({ 
      port: MCP_SERVER_PORT, 
      host: '0.0.0.0' 
    });
    
    server.log.info(`🚀 Amazon Seller MCP Server rodando na porta ${MCP_SERVER_PORT}`);
    server.log.info(`📊 Backend URL: ${BACKEND_URL}`);
    server.log.info(`🔗 Health check: http://localhost:${MCP_SERVER_PORT}/health`);
    server.log.info(`📝 Server info: http://localhost:${MCP_SERVER_PORT}/info`);
    
  } catch (err) {
    server.log.error('Erro ao iniciar servidor:', err);
    process.exit(1);
  }
};

start();