#!/usr/bin/env node

/**
 * MCP Server do Mercado Livre - Setup Script
 * 
 * Este script facilita a configuração do MCP Server oficial do Mercado Livre
 * para acelerar o desenvolvimento com assistentes de IA.
 */

const fs = require('fs');
const path = require('path');

// Cores para console
const colors = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function checkAccessToken() {
  const token = process.env.ML_ACCESS_TOKEN;
  
  if (!token) {
    log(colors.yellow, '⚠️  Access Token do ML não encontrado!');
    log(colors.blue, '📋 Você precisa de um Access Token para usar o MCP Server oficial.');
    log(colors.blue, '💡 Execute: npm run mcp:token:generate');
    log(colors.blue, '🔗 Ou obtenha em: https://developers.mercadolivre.com.br/pt_br/desenvolvimento-seguro');
    return false;
  }
  
  if (!token.startsWith('APP_USR-')) {
    log(colors.yellow, '⚠️  Token inválido! Deve começar com "APP_USR-"');
    log(colors.blue, '💡 Execute: npm run mcp:token:generate');
    return false;
  }
  
  log(colors.green, '✅ Access Token encontrado!');
  return token;
}

function generateConfig(ide, token) {
  const configs = {
    cursor: {
      mcpServers: {
        "mercadolibre-mcp-server": {
          url: "https://mcp.mercadolibre.com/mcp",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    },
    windsurf: {
      mcpServers: {
        "mercadolibre-mcp-server": {
          serverUrl: "https://mcp.mercadolibre.com/mcp",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    },
    general: {
      mcpServers: {
        "mercadolibre-mcp-server": {
          command: "npx",
          args: [
            "-y",
            "mcp-remote",
            "https://mcp.mercadolibre.com/mcp",
            "--header",
            `Authorization: Bearer ${token}`
          ],
          env: {
            AUTH_HEADER: `Bearer ${token}`
          }
        }
      }
    }
  };
  
  return JSON.stringify(configs[ide], null, 2);
}

function showInstructions() {
  log(colors.bold + colors.blue, '\n🚀 MCP Server do Mercado Livre - Configurado!');
  log(colors.green, '\n📝 PRÓXIMOS PASSOS:');
  log(colors.yellow, '\n1. CURSOR:');
  log(colors.blue, '   - Abra: Cursor Settings > Tools & Integrations > New MCP Server');
  log(colors.blue, '   - Cole o conteúdo de: .mcp/cursor-config.json');
  log(colors.blue, '   - Ou clique: https://cursor.com/en/install-mcp (veja arquivo para URL completa)');
  
  log(colors.yellow, '\n2. WINDSURF:');
  log(colors.blue, '   - Abra: Cascade > MCP Servers > Configure');
  log(colors.blue, '   - Cole o conteúdo de: .mcp/windsurf-config.json');
  
  log(colors.yellow, '\n3. OUTROS IDEs (Cline, Claude Desktop):');
  log(colors.blue, '   - Use o conteúdo de: .mcp/general-config.json');
  
  log(colors.green, '\n🎯 FUNCIONALIDADES DISPONÍVEIS:');
  log(colors.blue, '   ✅ search_documentation - Busca na documentação oficial ML');
  log(colors.blue, '   ✅ get_documentation_page - Obtém páginas específicas');
  log(colors.blue, '   ✅ Geração automática de código de integração');
  log(colors.blue, '   ✅ Assistente IA especializado em Mercado Livre');
  
  log(colors.yellow, '\n💡 COMO USAR:');
  log(colors.blue, '   - "Como implementar checkout do ML?"');
  log(colors.blue, '   - "Gere código para buscar produtos"');
  log(colors.blue, '   - "Qual endpoint para atualizar estoque?"');
  log(colors.blue, '   - "Implemente webhook de pagamentos"');
}

async function main() {
  log(colors.bold + colors.green, '🔧 Configurando MCP Server do Mercado Livre...\n');
  
  const hasToken = await checkAccessToken();
  
  if (!hasToken) {
    log(colors.red, '\n❌ Configure o ML_ACCESS_TOKEN antes de continuar.');
    process.exit(1);
  }
  
  const token = hasToken; // hasToken agora retorna o token validado
  
  // Gerar configurações atualizadas com token real
  const cursorConfig = generateConfig('cursor', token);
  const windsurfConfig = generateConfig('windsurf', token);
  const generalConfig = generateConfig('general', token);
  
  // Criar diretório .mcp se não existir
  const mcpDir = path.join(process.cwd(), '..', '.mcp');
  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true });
  }
  
  // Atualizar arquivos com token real
  fs.writeFileSync(path.join(mcpDir, 'cursor-config.json'), cursorConfig);
  fs.writeFileSync(path.join(mcpDir, 'windsurf-config.json'), windsurfConfig);
  fs.writeFileSync(path.join(mcpDir, 'general-config.json'), generalConfig);
  
  log(colors.green, '✅ Configurações atualizadas com seu Access Token!');
  
  showInstructions();
}

if (require.main === module) {
  main().catch(console.error);
}