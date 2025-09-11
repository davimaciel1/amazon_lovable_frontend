# 🎯 SISTEMA CONSOLIDADO - N8N AMAZON

## ✅ Estrutura Final (Apenas 3 Componentes)

```
N8N_Amazon/
├── 📦 PostgreSQL Database (Externo)
│   └── Host: <DB_HOST>:5456
│
├── 🔧 amazon-unified-backend/ (Backend Único)
│   └── Porta: 8080
│
└── 🎨 lovable-frontend/ (Frontend)
    └── Porta: 8087
```

## 🗑️ Removidos (Movidos para backup/)

1. **amazon-api-backend/** - Backend duplicado
2. **amazon-seller-backend/** - Backend duplicado
3. **amazon-sp-api-service/** - Serviço SP-API separado
4. **amazon-dashboard/** - Frontend Next.js duplicado (usamos Lovable)
5. **AmazonSeller-mcp-server/** - MCP server não utilizado
6. **spapi-service/** - Outro serviço duplicado
7. **dashboard-server.js** - Servidor simples duplicado

## 🚀 Como Executar

### 1. Backend Unificado
```bash
cd amazon-unified-backend
npm install
npm run dev
# Rodando em http://localhost:8080
```

### 2. Frontend Lovable
```bash
cd lovable-frontend
npm install
npm run dev
# Rodando em http://localhost:8087
```

### 3. Docker (Opcional)
```bash
docker-compose up -d
```

## 📊 Melhorias Alcançadas

- **Redução de 71%** em complexidade (7 → 2 serviços)
- **Manutenção simplificada** - apenas 1 backend
- **Deploy mais rápido** - menos componentes
- **Menor uso de recursos** - sem duplicação
- **Código mais limpo** - sem redundância

## 🔐 Variáveis de Ambiente

### Backend (.env)
```env
# Database
DB_HOST=<DB_HOST>
DB_PORT=5456
DB_NAME=amazon_monitor
DB_USER=saas
DB_PASSWORD=<DB_PASSWORD>

# Server
PORT=8080

# Amazon SP-API
SP_API_REFRESH_TOKEN=seu_token_aqui
SP_API_CLIENT_ID=seu_client_id
SP_API_CLIENT_SECRET=seu_secret

# Amazon Ads API
ADS_CLIENT_ID=amzn1.application-oa2-client.xxxxx
ADS_CLIENT_SECRET=<AMAZON_OAUTH_SECRET>
ADS_REFRESH_TOKEN=Atzr|xxxx
```

## 📝 Notas

- Todos os backends antigos estão salvos em `backup/2025-01-28-consolidation/`
- O sistema continua funcionando normalmente
- A consolidação não afeta os dados no banco
- Frontend Lovable permanece inalterado