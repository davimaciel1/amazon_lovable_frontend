# Testes E2E - Sistema Amazon Seller

Este diretório contém testes end-to-end completos para o Sistema Amazon Seller, incluindo testes de login, integração com API da Amazon e fluxo completo do sistema.

## 📋 Pré-requisitos

1. **Node.js** instalado (v14 ou superior)
2. **PostgreSQL** rodando localmente ou acessível
3. **Backend** e **Frontend** configurados corretamente

## 🚀 Preparação do Ambiente

### 1. Instalar Dependências

```bash
# Na pasta raiz do projeto
npm install
```

### 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=amazon_seller_db
DB_USER=postgres
DB_PASSWORD=postgres

# API
API_URL=http://localhost:8080
FRONTEND_URL=http://localhost:3000

# Amazon SP-API
SP_API_APP_CLIENT_ID=seu_client_id
SP_API_APP_CLIENT_SECRET=seu_client_secret
SP_API_REFRESH_TOKEN=seu_refresh_token
SP_API_ACCESS_KEY_ID=sua_aws_access_key
SP_API_SECRET_ACCESS_KEY=sua_aws_secret_key
SP_API_ROLE_ARN=seu_role_arn
SP_API_REGION=na
SP_API_MARKETPLACE_IDS=ATVPDKIKX0DER
SP_API_SELLER_ID=seu_seller_id

# JWT
JWT_SECRET=seu_jwt_secret_aqui
JWT_REFRESH_SECRET=seu_refresh_secret_aqui
```

### 3. Iniciar os Serviços

#### Backend (Terminal 1)
```bash
cd amazon-unified-backend
npm install
npm run dev
```

O backend deve estar rodando em `http://localhost:8080`

#### Frontend (Terminal 2)
```bash
cd lovable-frontend
npm install
npm run dev
```

O frontend deve estar rodando em `http://localhost:3000`

## 🧪 Executando os Testes

### Método 1: Script NPM (Recomendado)
```bash
# Teste completo
npm run test:e2e

# Teste com navegador em modo headless (sem interface visual)
npm run test:e2e:headless

# Teste apenas de login
npm run test:login

# Teste apenas da integração com API
npm run test:api
```

### Método 2: Scripts Batch/PowerShell (Windows)

#### Batch
```cmd
run-e2e-tests.bat
```

#### PowerShell
```powershell
# Execução básica
.\run-e2e-tests.ps1

# Com opções
.\run-e2e-tests.ps1 -Headless        # Modo headless
.\run-e2e-tests.ps1 -Debug           # Modo debug
.\run-e2e-tests.ps1 -TestFilter login # Filtrar testes específicos
```

### Método 3: Execução Direta
```bash
node tests/e2e/test-complete-system.js
```

## 📊 Testes Disponíveis

### 1. **test-complete-system.js**
Suite completa de testes E2E que verifica:
- ✅ Login e autenticação
- ✅ Carregamento do dashboard
- ✅ Integração com API da Amazon
- ✅ Página de vendas
- ✅ Endpoints da API
- ✅ Integridade do banco de dados
- ✅ Atualizações em tempo real (WebSocket)
- ✅ Logout

## 🔍 Verificação dos Dados da Amazon

O teste verifica automaticamente se existem dados da Amazon no banco de dados:

1. **Orders**: Pedidos com `amazon_order_id`
2. **Products**: Produtos com `asin`
3. **Order Items**: Itens de pedido com `order_item_id`

### Formato dos IDs da Amazon
- **Order ID**: `XXX-XXXXXXX-XXXXXXX` (ex: 123-4567890-1234567)
- **ASIN**: 10 caracteres alfanuméricos (ex: B08N5WRWNW)

## 📸 Screenshots

Em caso de falha, screenshots são salvos automaticamente em `./screenshots/`

## 🐛 Troubleshooting

### Problema: Backend não está rodando
```bash
# Verifique se a porta 8080 está em uso
netstat -an | findstr :8080

# Inicie o backend manualmente
cd amazon-unified-backend
npm run dev
```

### Problema: Frontend não está rodando
```bash
# Verifique se a porta 3000 está em uso
netstat -an | findstr :3000

# Inicie o frontend manualmente
cd lovable-frontend
npm run dev
```

### Problema: Banco de dados não conecta
```bash
# Verifique se o PostgreSQL está rodando
psql -U postgres -h localhost -p 5432 -d amazon_seller_db -c "SELECT 1"

# Se necessário, crie o banco
psql -U postgres -c "CREATE DATABASE amazon_seller_db"
```

### Problema: Sem dados da Amazon
O teste tentará disparar uma sincronização automática. Se falhar:
```bash
# Execute sincronização manual
node scripts/sync/sync-all-real-data.js
```

## 📈 Interpretação dos Resultados

### Saída Esperada
```
====================================
Amazon Seller System E2E Test Suite
====================================

✅ PASSED: Login Flow (234ms)
✅ PASSED: Dashboard Data Loading (1523ms)
✅ PASSED: Amazon API Data Verification (3421ms)
✅ PASSED: Sales Page (892ms)
✅ PASSED: API Endpoints (567ms)
✅ PASSED: Database Integrity (234ms)
✅ PASSED: Real-time Updates (123ms)
✅ PASSED: Logout (345ms)

====================================
📊 TEST SUMMARY
====================================
✅ Passed: 8
❌ Failed: 0
⏱️  Total Time: 7339ms
====================================
```

### Códigos de Saída
- **0**: Todos os testes passaram
- **1**: Um ou mais testes falharam
- **130**: Interrompido pelo usuário (CTRL+C)

## 🔄 Integração Contínua

Para CI/CD, use o modo headless:

```yaml
# GitHub Actions exemplo
- name: Run E2E Tests
  run: |
    npm ci
    npm run test:e2e:headless
  env:
    HEADLESS: true
    DB_HOST: ${{ secrets.DB_HOST }}
    DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
```

## 📝 Desenvolvendo Novos Testes

Para adicionar novos testes, siga o padrão:

```javascript
async function testNewFeature() {
  const page = testSuite.page;
  
  // Seu código de teste aqui
  await page.goto(`${BASE_URL}/new-feature`);
  
  // Asserções
  const element = await page.$('.expected-element');
  if (!element) {
    throw new Error('Element not found');
  }
  
  return true;
}

// Adicione ao runner
await testSuite.runTest('New Feature Test', testNewFeature);
```

## 🤝 Contribuindo

1. Crie novos testes seguindo o padrão existente
2. Garanta que todos os testes passem antes de commitar
3. Adicione documentação para novos testes
4. Mantenha os testes independentes e idempotentes

## 📚 Recursos Adicionais

- [Puppeteer Documentation](https://pptr.dev/)
- [Amazon SP-API Documentation](https://developer-docs.amazon.com/sp-api/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)