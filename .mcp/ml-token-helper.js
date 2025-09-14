#!/usr/bin/env node

/**
 * Helper para gerenciar Access Token do Mercado Livre
 * Facilita obtenção e verificação de tokens para uso com MCP Server
 */

const https = require('https');
const fs = require('fs');

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

/**
 * Gera access token usando client credentials (para apps)
 */
async function generateAccessToken() {
  const clientId = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_APP_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_APP_SECRET;
  
  if (!clientId || !clientSecret) {
    log(colors.red, '❌ ML_CLIENT_ID e ML_CLIENT_SECRET são necessários');
    log(colors.blue, 'ℹ️  Configure essas variáveis de ambiente primeiro');
    return null;
  }
  
  return new Promise((resolve, reject) => {
    const postData = `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`;
    
    const options = {
      hostname: 'api.mercadolibre.com',
      port: 443,
      path: '/oauth/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error(response.error_description || 'Erro ao obter token'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Verifica se um token é válido
 */
async function validateToken(token) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.mercadolibre.com',
      port: 443,
      path: '/users/me',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
    
    const req = https.request(options, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'generate':
      log(colors.blue, '🔄 Gerando access token...');
      try {
        const token = await generateAccessToken();
        if (token) {
          log(colors.green, '✅ Token gerado com sucesso!');
          log(colors.yellow, `📋 Token: ${token}`);
          log(colors.blue, '💡 Adicione este token como ML_ACCESS_TOKEN nas suas secrets do Replit');
        }
      } catch (error) {
        log(colors.red, `❌ Erro: ${error.message}`);
      }
      break;
      
    case 'validate':
      const token = process.env.ML_ACCESS_TOKEN || process.argv[3];
      if (!token) {
        log(colors.red, '❌ Token não fornecido');
        log(colors.blue, 'ℹ️  Use: node ml-token-helper.js validate <token>');
        return;
      }
      
      log(colors.blue, '🔄 Validando token...');
      const isValid = await validateToken(token);
      
      if (isValid) {
        log(colors.green, '✅ Token válido!');
      } else {
        log(colors.red, '❌ Token inválido ou expirado');
      }
      break;
      
    default:
      log(colors.bold + colors.blue, '🔧 ML Token Helper');
      log(colors.yellow, '\nComandos disponíveis:');
      log(colors.blue, '  generate  - Gera novo access token usando client credentials');
      log(colors.blue, '  validate  - Valida se um token está ativo');
      log(colors.yellow, '\nExemplos:');
      log(colors.blue, '  node ml-token-helper.js generate');
      log(colors.blue, '  node ml-token-helper.js validate <token>');
  }
}

if (require.main === module) {
  main().catch(console.error);
}