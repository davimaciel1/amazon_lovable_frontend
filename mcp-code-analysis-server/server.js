#!/usr/bin/env node

/**
 * Amazon Seller Dashboard - Code Analysis MCP Server
 * Model Context Protocol server para análise de código e detecção de bugs
 * 
 * Permite ao ChatGPT acessar código fonte de forma segura para:
 * - Analisar arquivos específicos
 * - Buscar por bugs e vulnerabilidades
 * - Sugerir melhorias de código
 * 
 * SEGURANÇA: Implementa whitelist rigorosa para proteger dados sensíveis
 */

import fastify from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração do servidor
const CODE_ANALYSIS_PORT = process.env.CODE_ANALYSIS_PORT || 6000;
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Lista de DIRETÓRIOS seguros para análise recursiva
const SAFE_DIRECTORIES = [
  'lovable-frontend/src',
  'amazon-unified-backend/src',
  'shared'
];

// Lista de ARQUIVOS específicos seguros
const SAFE_FILES = [
  'amazon-unified-backend/storage.ts',
  'amazon-unified-backend/package.json',
  'lovable-frontend/package.json',
  'lovable-frontend/vite.config.ts',
  'lovable-frontend/tsconfig.json',
  'amazon-unified-backend/tsconfig.json'
];

// Lista de arquivos/extensões BLOQUEADOS (dados sensíveis)
const BLOCKED_PATTERNS = [
  /\.env$/,
  /\.key$/,
  /\.pem$/,
  /\.p12$/,
  /\.keystore$/,
  /secrets/,
  /\.git/,
  /node_modules/,
  /dist/,
  /build/,
  /\.log$/,
  /\.pid$/,
  /\.lock$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /\.cache/,
  /\.tmp/,
  /\.temp/
];

// Extensões de código permitidas
const CODE_EXTENSIONS = [
  '.js', '.ts', '.tsx', '.jsx', '.json', '.md', '.yml', '.yaml', 
  '.sql', '.html', '.css', '.scss', '.vue', '.py', '.go', '.rs'
];

// Criar servidor Fastify
const server = fastify({
  logger: true
});

// Configurar CORS para ChatGPT
await server.register(cors, {
  origin: [
    'https://chatgpt.com',
    'https://chat.openai.com', 
    'https://api.openai.com',
    /^https:\/\/.*\.replit\.dev$/,
    /^https:\/\/.*\.replit\.app$/,
    true
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS']
});

/**
 * Verificar se um caminho é seguro para análise
 */
function isPathSafe(filePath) {
  // Normalizar caminho para prevenir directory traversal
  const normalizedPath = path.normalize(filePath).replace(/^\/+/, '');
  
  // Verificar se é um arquivo específico permitido
  if (SAFE_FILES.includes(normalizedPath)) {
    return true;
  }
  
  // Verificar se está em um diretório seguro
  const isInSafeDirectory = SAFE_DIRECTORIES.some(safeDir => 
    normalizedPath.startsWith(safeDir)
  );
  
  if (!isInSafeDirectory) {
    server.log.warn(`🚫 Acesso negado ao caminho: ${normalizedPath}`);
    return false;
  }
  
  // Verificar se não está bloqueado
  const isBlocked = BLOCKED_PATTERNS.some(pattern => 
    pattern.test(normalizedPath)
  );
  
  if (isBlocked) {
    server.log.warn(`🚫 Caminho bloqueado por padrão: ${normalizedPath}`);
    return false;
  }
  
  // Verificar extensão
  const ext = path.extname(normalizedPath).toLowerCase();
  return CODE_EXTENSIONS.includes(ext) || !ext; // Permitir diretórios
}

/**
 * Buscar arquivos recursivamente
 */
async function findFiles(dirPath, pattern = '', maxResults = 50) {
  const results = [];
  
  try {
    const fullPath = path.join(PROJECT_ROOT, dirPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      
      const entryPath = path.join(dirPath, entry.name);
      
      if (!isPathSafe(entryPath)) continue;
      
      if (entry.isDirectory()) {
        // Buscar recursivamente em subdiretórios
        const subResults = await findFiles(entryPath, pattern, maxResults - results.length);
        results.push(...subResults);
      } else if (entry.isFile()) {
        // Verificar se corresponde ao padrão de busca
        if (!pattern || 
            entry.name.toLowerCase().includes(pattern.toLowerCase()) ||
            entryPath.toLowerCase().includes(pattern.toLowerCase())) {
          results.push({
            id: entryPath,
            title: entry.name,
            url: `file://${entryPath}`
          });
        }
      }
    }
  } catch (error) {
    server.log.error(`Erro ao buscar arquivos em ${dirPath}:`, error.message);
  }
  
  return results;
}

/**
 * Ler arquivo de código
 */
async function readCodeFile(filePath) {
  try {
    if (!isPathSafe(filePath)) {
      throw new Error('Acesso negado: arquivo fora da área segura');
    }
    
    const fullPath = path.join(PROJECT_ROOT, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const stats = await fs.stat(fullPath);
    
    return {
      id: filePath,
      title: path.basename(filePath),
      text: content,
      url: `file://${filePath}`,
      metadata: {
        type: 'source_code',
        extension: path.extname(filePath),
        size: stats.size,
        modified: stats.mtime.toISOString(),
        lines: content.split('\n').length
      }
    };
  } catch (error) {
    throw new Error(`Erro ao ler arquivo ${filePath}: ${error.message}`);
  }
}

// ---- PROTOCOLO MCP OFICIAL ----

/**
 * Endpoint principal MCP via GET - informações do servidor
 */
server.get('/', async (request, reply) => {
  return {
    name: 'Amazon Seller Dashboard - Code Analysis MCP Server',
    version: '1.0.0',
    description: 'Servidor MCP para análise segura de código fonte e detecção de bugs',
    capabilities: {
      tools: ['search_code', 'analyze_file']
    },
    protocol: 'mcp',
    security: {
      safe_directories: SAFE_DIRECTORIES,
      safe_files: SAFE_FILES,
      blocked_patterns: BLOCKED_PATTERNS.map(p => p.toString()),
      allowed_extensions: CODE_EXTENSIONS
    }
  };
});

// ---- ENDPOINTS OAUTH PARA COMPATIBILIDADE COM CHATGPT ----

/**
 * Endpoint de configuração OAuth para descoberta automática
 */
server.get('/.well-known/oauth-authorization-server', async (request, reply) => {
  const baseUrl = `${request.protocol}://${request.hostname}${request.port && request.port !== '80' && request.port !== '443' ? ':' + request.port : ''}`;
  reply.type('application/json').send({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    scopes_supported: ['read'],
    token_endpoint_auth_methods_supported: ['none']
  });
});

server.get('/.well-known/openid-configuration', async (request, reply) => {
  const baseUrl = `${request.protocol}://${request.hostname}${request.port && request.port !== '80' && request.port !== '443' ? ':' + request.port : ''}`;
  reply.type('application/json').send({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    scopes_supported: ['read'],
    token_endpoint_auth_methods_supported: ['none']
  });
});

server.get('/.well-known/oauth-protected-resource', async (request, reply) => {
  const baseUrl = `${request.protocol}://${request.hostname}${request.port && request.port !== '80' && request.port !== '443' ? ':' + request.port : ''}`;
  reply.type('application/json').send({
    resource: baseUrl,
    scopes_supported: ['read'],
    bearer_methods_supported: ['header']
  });
});

// Endpoints OAuth básicos para ChatGPT
server.get('/oauth/authorize', async (request, reply) => {
  const { client_id, redirect_uri, state, response_type, scope } = request.query;
  
  // Retorna código de autorização automaticamente (para desenvolvimento)
  const code = 'mcp_auth_code_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const redirectUrl = `${redirect_uri}?code=${code}&state=${state || ''}`;
  
  server.log.info(`🔐 OAuth Authorize: redirect para ${redirectUrl}`);
  reply.redirect(redirectUrl);
});

server.post('/oauth/token', async (request, reply) => {
  const { grant_type, code, client_id, client_secret, redirect_uri } = request.body;
  
  // Valida parâmetros básicos
  if (grant_type !== 'authorization_code') {
    return reply.code(400).send({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code grant type is supported'
    });
  }
  
  // Gera token de acesso
  const accessToken = 'mcp_access_token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  server.log.info(`🔐 OAuth Token: gerado token ${accessToken.substr(0, 20)}...`);
  
  reply.type('application/json').send({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'read'
  });
});

/**
 * Endpoint principal MCP via POST - JSON-RPC 2.0
 */
server.post('/', async (request, reply) => {
  const { jsonrpc, id, method, params = {} } = request.body || {};
  
  server.log.info(`🔧 MCP Code Analysis RPC Call: "${method}" (id: ${id})`);
  
  // Verificar se é uma request JSON-RPC válida
  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code: -32600,
        message: 'Invalid Request - jsonrpc field must be "2.0"'
      }
    };
  }
  
  try {
    let result;
    
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'Amazon Seller Dashboard Code Analysis',
            version: '1.0.0'
          }
        };
        break;
        
      case 'tools/list':
        result = {
          tools: [
            {
              name: 'search_code',
              description: 'Buscar arquivos de código por nome, padrão ou conteúdo',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Termo de busca: nome do arquivo, extensão, ou palavra-chave'
                  }
                },
                required: ['query']
              }
            },
            {
              name: 'analyze_file',
              description: 'Analisar arquivo específico para detectar bugs, vulnerabilidades e melhorias',
              inputSchema: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Caminho do arquivo para análise (ex: lovable-frontend/src/App.tsx)'
                  }
                },
                required: ['id']
              }
            }
          ]
        };
        break;
        
      case 'tools/call':
        const { name, arguments: args } = params;
        
        if (name === 'search_code') {
          const searchResult = await handleSearchCode(args.query || '');
          result = searchResult; // Já retorna { content: [...] }
        } else if (name === 'analyze_file') {
          const analyzeResult = await handleAnalyzeFile(args.id || '');
          result = analyzeResult; // Já retorna { content: [...] }
        } else {
          return {
            jsonrpc: '2.0',
            id: id || null,
            error: {
              code: -32601,
              message: `Tool not found: ${name}`
            }
          };
        }
        break;
        
      default:
        return {
          jsonrpc: '2.0',
          id: id || null,
          error: {
            code: -32601,
            message: `Method not supported: ${method}`
          }
        };
    }
    
    // Resposta JSON-RPC 2.0 bem sucedida
    return {
      jsonrpc: '2.0',
      id: id || null,
      result: result
    };
    
  } catch (error) {
    server.log.error('Erro no processamento RPC:', error);
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    };
  }
});

// ---- FUNÇÕES DE HANDLE ----

async function handleSearchCode(query) {
  try {
    server.log.info(`🔍 Code search query: "${query}"`);
    
    let results = [];
    
    // Buscar em cada diretório seguro
    for (const safeDir of SAFE_DIRECTORIES) {
      const pathResults = await findFiles(safeDir, query, 20);
      results.push(...pathResults);
    }
    
    // Buscar também em arquivos específicos seguros que correspondem à query
    for (const safeFile of SAFE_FILES) {
      if (!query || safeFile.toLowerCase().includes(query.toLowerCase())) {
        const fileName = path.basename(safeFile);
        results.push({
          id: safeFile,
          title: fileName,
          url: `file://${safeFile}`
        });
      }
    }
    
    // Limitar resultados
    results = results.slice(0, 50);
    
    return {
      content: [
        {
          type: "text",
          text: `Encontrados ${results.length} arquivos de código:\n\n${results.map((result, i) => 
            `${i + 1}. **${result.title}**\n   - Caminho: ${result.id}\n   - URL: ${result.url}`
          ).join('\n\n')}`
        }
      ]
    };
  } catch (error) {
    server.log.error('Erro no search_code:', error);
    return {
      content: [
        {
          type: "text",
          text: `❌ **Erro na busca de código**

Erro interno do servidor: ${error.message}

Por favor, verifique se:
- O termo de busca é válido
- Os arquivos existem nos diretórios seguros
- As permissões de acesso estão corretas`
        }
      ]
    };
  }
}

async function handleAnalyzeFile(filePath) {
  try {
    server.log.info(`📄 Analyzing file: "${filePath}"`);
    
    const fileData = await readCodeFile(filePath);
    
    return {
      content: [
        {
          type: "text", 
          text: `# Análise do arquivo: ${fileData.title}

**Caminho**: ${fileData.id}
**Extensão**: ${fileData.metadata.extension}
**Tamanho**: ${fileData.metadata.size} bytes
**Linhas**: ${fileData.metadata.lines}
**Modificado**: ${fileData.metadata.modified}

## Conteúdo do arquivo:

\`\`\`${fileData.metadata.extension.replace('.', '')}
${fileData.text}
\`\`\`

## Informações técnicas:
- **URL**: ${fileData.url}
- **Tipo**: ${fileData.metadata.type}
`
        }
      ]
    };
  } catch (error) {
    server.log.error('Erro no analyze_file:', error);
    return {
      content: [
        {
          type: "text",
          text: `❌ **Erro ao analisar arquivo**: ${filePath || 'unknown'}

**Erro**: ${error.message}

**Possíveis causas**:
- Arquivo não existe ou foi movido
- Arquivo está fora dos diretórios seguros
- Permissões de acesso insuficientes
- Arquivo está na lista de bloqueados

**Arquivos seguros permitidos**:
${SAFE_FILES.map(file => `- ${file}`).join('\n')}

**Diretórios seguros permitidos**:
${SAFE_DIRECTORIES.map(dir => `- ${dir}/`).join('\n')}`
        }
      ]
    };
  }
}

/**
 * Health check endpoint
 */
server.get('/health', async (request, reply) => {
  return { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    safe_directories: SAFE_DIRECTORIES.length,
    safe_files: SAFE_FILES.length,
    blocked_patterns: BLOCKED_PATTERNS.length
  };
});

/**
 * Endpoint de informações do servidor MCP
 */
server.get('/info', async (request, reply) => {
  return {
    name: 'Amazon Seller Dashboard - Code Analysis MCP Server',
    version: '1.0.0',
    description: 'Servidor MCP para análise segura de código fonte e detecção de bugs',
    tools: ['search_code', 'analyze_file'],
    security: {
      safe_directories: SAFE_DIRECTORIES,
      safe_files: SAFE_FILES,
      allowed_extensions: CODE_EXTENSIONS
    },
    timestamp: new Date().toISOString()
  };
});

// Iniciar servidor
const start = async () => {
  try {
    await server.listen({ 
      port: CODE_ANALYSIS_PORT, 
      host: '0.0.0.0' 
    });
    
    server.log.info(`🚀 Code Analysis MCP Server rodando na porta ${CODE_ANALYSIS_PORT}`);
    server.log.info(`🔒 Diretórios seguros: ${SAFE_DIRECTORIES.join(', ')}`);
    server.log.info(`📄 Arquivos seguros: ${SAFE_FILES.length} arquivos`);
    server.log.info(`🔗 Health check: http://localhost:${CODE_ANALYSIS_PORT}/health`);
    server.log.info(`📝 Server info: http://localhost:${CODE_ANALYSIS_PORT}/info`);
    
  } catch (err) {
    server.log.error('Erro ao iniciar servidor:', err);
    process.exit(1);
  }
};

start();