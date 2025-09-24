#!/usr/bin/env node

/**
 * Amazon Seller Dashboard MCP Server
 * Servidor compatível com ChatGPT Model Context Protocol (MCP)
 * Fornece acesso aos dados de vendas Amazon e Mercado Livre
 */

import Fastify from 'fastify';
import axios from 'axios';

const server = Fastify({ 
  logger: true,
  disableRequestLogging: process.env.NODE_ENV === 'production'
});

// CORS
server.register(import('@fastify/cors'), {
  origin: true,
  credentials: true
});

const PORT = process.env.PORT || 8008;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

/**
 * Buscar dados de vendas do backend
 */
async function fetchSalesData(query = '', limit = 20) {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/sales-unified`, {
      params: { query, limit },
      timeout: 10000
    });
    // Backend retorna {success: true, data: [...]}
    return response.data?.data || [];
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
    const response = await axios.get(`${BACKEND_URL}/api/dashboard/stats`, {
      timeout: 10000
    });
    return response.data || {};
  } catch (error) {
    server.log.error('Erro ao buscar estatísticas:', error.message);
    return {
      totalRevenue: 0,
      totalUnits: 0,
      totalProducts: 0
    };
  }
}

// ---- ENDPOINTS MCP PARA CHATGPT ----

/**
 * Endpoint GET - informações do servidor MCP
 */
server.get('/', async (request, reply) => {
  return {
    name: 'Amazon Seller Dashboard MCP Server',
    version: '1.0.0',
    description: 'Servidor MCP para integração ChatGPT com dados Amazon/ML',
    capabilities: {
      tools: ['search', 'fetch']
    },
    endpoints: {
      search: '/search',
      fetch: '/fetch'
    },
    status: 'active'
  };
});

/**
 * Tool: search - Buscar produtos e dados de vendas
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
          text: `Encontrados ${results.length} resultados de vendas:\n\n${results.map((item, i) => 
            `${i + 1}. **${item.title}**\n   - ID: ${item.id}\n   - Detalhes: ${item.text}\n   - URL: ${item.url}`
          ).join('\n\n')}`
        }
      ]
    };
    
  } catch (error) {
    server.log.error('Erro na busca:', error);
    return {
      content: [
        {
          type: "text",
          text: `❌ **Erro na busca**\n\nErro interno do servidor: ${error.message}\n\nPor favor, tente novamente ou verifique os parâmetros da busca.`
        }
      ]
    };
  }
});

/**
 * Tool: fetch - Obter detalhes específicos de um produto
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
      
      const dashboardText = `## Resumo Executivo
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
- Produtos com estoque baixo: ${salesData.filter(p => (p.stock || 0) < 10).length}`;
      
      return {
        content: [
          {
            type: "text",
            text: dashboardText
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
            text: `❌ **Produto não encontrado**\n\nO produto com ID "${id}" não foi encontrado nos dados de vendas.\n\n**Sugestões:**\n- Verifique se o ID está correto\n- Tente buscar pelo nome do produto\n- Consulte a lista completa de produtos disponíveis`
          }
        ]
      };
    }
    
    // Análise detalhada do produto
    const productText = `# Análise Detalhada: ${product.title || product.product}

## Informações Básicas
- **SKU**: ${product.sku}
- **ASIN**: ${product.asin || 'N/A'}
- **Marketplace**: ${product.marketplace_code}
- **Revenue**: R$ ${(product.revenue || 0).toFixed(2)}
- **Unidades Vendidas**: ${product.units || 0}
- **Estoque Atual**: ${product.stock || 0}

## Performance
- **Preço Médio**: R$ ${product.revenue && product.units ? (product.revenue / product.units).toFixed(2) : 'N/A'}
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
${(product.revenue || 0) > 5000 ? '⭐ **DESTAQUE**: Este é um dos seus produtos top performers!\n' : ''}`;
    
    return {
      content: [
        {
          type: "text",
          text: productText
        }
      ]
    };
    
  } catch (error) {
    const errorId = request.body?.id || 'unknown';
    server.log.error('Erro no fetch:', error);
    return {
      content: [
        {
          type: "text",
          text: `❌ **Erro no servidor**\n\nOcorreu um erro interno do servidor ao buscar os dados.\n\n**Erro**: ${error.message}\n\n**ID solicitado**: ${errorId}\n\nPor favor, tente novamente ou contate o suporte técnico.`
        }
      ]
    };
  }
});

// ---- PROTOCOLO JSON-RPC 2.0 PARA MCP ----

/**
 * Endpoint principal MCP via JSON-RPC 2.0
 */
server.post('/', async (request, reply) => {
  try {
    const { jsonrpc, id, method, params } = request.body;
    
    // Validar JSON-RPC 2.0
    if (jsonrpc !== "2.0") {
      return {
        jsonrpc: "2.0",
        id: id || null,
        error: {
          code: -32600,
          message: "Invalid Request",
          data: "jsonrpc must be '2.0'"
        }
      };
    }
    
    server.log.info(`🔗 MCP JSON-RPC: ${method}`);
    
    // Listar ferramentas disponíveis
    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: id,
        result: {
          tools: [
            {
              name: "search",
              description: "Buscar produtos e dados de vendas Amazon/ML",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Termo de busca: nome do produto, SKU, ASIN, ou marketplace"
                  }
                },
                required: []
              }
            },
            {
              name: "fetch",
              description: "Obter análise detalhada de um produto específico",
              inputSchema: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "ID do produto, SKU, ASIN, ou 'dashboard-stats' para estatísticas gerais"
                  }
                },
                required: ["id"]
              }
            }
          ]
        }
      };
    }
    
    // Executar ferramenta
    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      
      if (name === "search") {
        const searchResponse = await server.inject({
          method: 'POST',
          url: '/search',
          payload: { query: args?.query || '' }
        });
        
        return {
          jsonrpc: "2.0",
          id: id,
          result: JSON.parse(searchResponse.payload)
        };
      }
      
      if (name === "fetch") {
        const fetchResponse = await server.inject({
          method: 'POST',
          url: '/fetch',
          payload: { id: args?.id }
        });
        
        return {
          jsonrpc: "2.0",
          id: id,
          result: JSON.parse(fetchResponse.payload)
        };
      }
      
      return {
        jsonrpc: "2.0",
        id: id,
        error: {
          code: -32601,
          message: "Method not found",
          data: `Tool '${name}' não encontrada`
        }
      };
    }
    
    return {
      jsonrpc: "2.0",
      id: id,
      error: {
        code: -32601,
        message: "Method not found",
        data: `Método '${method}' não suportado`
      }
    };
    
  } catch (error) {
    server.log.error('Erro JSON-RPC:', error);
    return {
      jsonrpc: "2.0",
      id: request.body?.id || null,
      error: {
        code: -32603,
        message: "Internal error",
        data: error.message
      }
    };
  }
});

// Iniciar servidor
const start = async () => {
  try {
    await server.listen({ 
      port: PORT, 
      host: '0.0.0.0' 
    });
    
    server.log.info(`🚀 Amazon Seller MCP Server rodando na porta ${PORT}`);
    server.log.info(`📊 Backend URL: ${BACKEND_URL}`);
    server.log.info(`🔗 MCP Endpoint: http://0.0.0.0:${PORT}/`);
    
  } catch (err) {
    server.log.error('Erro ao iniciar servidor:', err);
    process.exit(1);
  }
};

// Lidar com sinais de terminação
process.on('SIGINT', async () => {
  server.log.info('🛑 Encerrando MCP Server...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.log.info('🛑 Encerrando MCP Server...');
  await server.close();
  process.exit(0);
});

start();