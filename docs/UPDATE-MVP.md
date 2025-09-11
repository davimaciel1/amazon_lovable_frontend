# 🚀 AMAZON SELLER SAAS MVP - IMPLEMENTATION PLAN

## 📋 ESCOPO DO MVP (FASES 1 E 2)

### FASE 1 - Core Metrics (Implementação Imediata)
Dados essenciais que 100% dos sellers precisam diariamente

#### 1. **Orders & Sales**
- ✅ Orders (resumo de pedidos)
- ✅ Order Items (detalhes dos produtos)
- ✅ Cálculo automático de receita e margem

#### 2. **Catalog & Inventory**
- ✅ Catalog Items (informações dos produtos)
- ✅ Listings Seller (status e disponibilidade)
- ✅ FBA Inventory Summary (estoque em tempo real)

#### 3. **Pricing & Competition**
- ✅ Competitive Pricing (preços da concorrência)
- ✅ Buy Box tracking
- ✅ Fees Estimates (cálculo de taxas)

#### 4. **Finance Core**
- ✅ Finance Events consolidados (única tabela otimizada)
- ✅ Cálculo automático de P&L
- ✅ Margem por produto

#### 5. **Advertising Básico**
- ✅ Sponsored Products campaigns
- ✅ Ad performance metrics
- ✅ ACOS e TACOS em tempo real

### FASE 2 - Growth Features (3-6 meses)
Funcionalidades para crescimento e otimização

#### 1. **Business Reports**
- ✅ Sales & Traffic por ASIN
- ✅ Conversion rates
- ✅ Session tracking

#### 2. **Returns & Reimbursements**
- ✅ FBA Returns tracking
- ✅ Reimbursements automation
- ✅ Alertas de problemas

#### 3. **Feeds System**
- ✅ Bulk price updates
- ✅ Inventory updates
- ✅ Product updates

#### 4. **Alertas Inteligentes**
- ✅ Stock baixo
- ✅ Mudanças de preço
- ✅ Perda de Buy Box
- ✅ Performance de ads

#### 5. **Analytics & KPIs**
- ✅ Business Metrics calculados
- ✅ Tendências e previsões
- ✅ Dashboards em tempo real

## 🏗️ ARQUITETURA TÉCNICA

### Stack Principal
```yaml
Backend:
  - Node.js 20+
  - TypeScript
  - Express.js
  - Prisma ORM
  - PostgreSQL
  - Redis (cache)
  
APIs:
  - Amazon SP-API
  - Amazon Ads API
  - Webhooks/SQS
  
Tools:
  - Zod (validation)
  - Axios (HTTP)
  - node-cron (jobs)
  - p-map (concurrency)
  - winston (logging)
```

### Estrutura de Pastas
```
/amazon-seller-backend
  /src
    /config      # Configurações e environment
    /db          # Prisma schema e migrations
    /auth        # SP-API e Ads OAuth
    /clients     # Clientes HTTP para APIs
    /services    # Lógica de negócio
    /routes      # Endpoints REST
    /jobs        # Cron jobs
    /utils       # Helpers e utilities
    /metrics     # KPIs e analytics
    /alerts      # Sistema de notificações
  /tests         # Testes automatizados
  /scripts       # Scripts de setup
```

## 📊 BANCO DE DADOS OTIMIZADO

### Tabelas Core (15 tabelas essenciais)

```prisma
// Multi-tenant base
model Tenant {
  id               String  @id @default(cuid())
  name             String
  plan             String  // FREE|STARTER|PRO|ENTERPRISE
  isActive         Boolean @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

// Credenciais consolidadas
model Credentials {
  id               String  @id @default(cuid())
  tenantId         String
  type             String  // SPAPI|ADS
  refreshToken     String  // Encrypted
  marketplaceIds   String[]
  sellingPartnerId String?
  profileIds       BigInt[]
  isActive         Boolean @default(true)
}

// Orders simplificado
model Order {
  tenantId         String
  amazonOrderId    String
  purchaseDate     DateTime
  orderStatus      String
  totalAmount      Decimal
  totalCurrency    String
  itemCount        Int
  profit           Decimal? // Calculado
  margin           Decimal? // Calculado
  
  @@id([tenantId, amazonOrderId])
}

// Produtos com métricas
model Product {
  tenantId         String
  asin             String
  sku              String
  title            String
  brand            String?
  category         String?
  imageUrl         String?
  currentPrice     Decimal?
  competitorPrice  Decimal?
  buyBoxPrice      Decimal?
  buyBoxWinner     Boolean @default(false)
  fbaStock         Int?
  fbmStock         Int?
  totalSales30d    Decimal?
  totalUnits30d    Int?
  avgMargin30d     Decimal?
  
  @@id([tenantId, asin])
}

// Finance consolidado
model FinanceEvent {
  id               String  @id @default(cuid())
  tenantId         String
  date             DateTime
  type             String  // ORDER|REFUND|FEE|REIMBURSEMENT|AD_SPEND
  category         String
  amount           Decimal
  currency         String
  amazonOrderId    String?
  asin             String?
  metadata         Json?
  
  @@index([tenantId, date, type])
}

// Ads Performance
model AdPerformance {
  tenantId         String
  date             DateTime
  campaignId       BigInt
  campaignName     String
  asin             String
  impressions      Int
  clicks           Int
  spend            Decimal
  sales            Decimal
  orders           Int
  acos             Decimal
  roas             Decimal
  
  @@id([tenantId, date, campaignId, asin])
}

// Business Metrics (KPIs calculados)
model BusinessMetrics {
  tenantId         String
  date             DateTime
  revenue          Decimal
  profit           Decimal
  margin           Decimal
  orders           Int
  units            Int
  avgOrderValue    Decimal
  adSpend          Decimal
  acos             Decimal
  tacos            Decimal
  conversionRate   Decimal
  
  @@id([tenantId, date])
}

// Sistema de Alertas
model Alert {
  id               String  @id @default(cuid())
  tenantId         String
  type             String  // STOCK_LOW|PRICE_CHANGE|BUYBOX_LOST|HIGH_ACOS
  severity         String  // LOW|MEDIUM|HIGH|CRITICAL
  title            String
  message          String
  asin             String?
  isRead           Boolean @default(false)
  isResolved       Boolean @default(false)
  createdAt        DateTime @default(now())
  
  @@index([tenantId, isRead, severity])
}

// Jobs tracking
model SyncJob {
  id               String  @id @default(cuid())
  tenantId         String
  type             String
  status           String  // PENDING|RUNNING|SUCCESS|FAILED
  startedAt        DateTime?
  completedAt      DateTime?
  recordsProcessed Int?
  error            String?
  metadata         Json?
  
  @@index([tenantId, type, status])
}
```

## 🔄 SINCRONIZAÇÃO E JOBS

### Cron Jobs Configurados

```typescript
// HOURLY (a cada hora)
- Orders dos últimos 60 minutos
- Atualização de preços competitivos
- Verificação de estoque FBA
- Alertas críticos

// EVERY 4 HOURS
- Métricas de advertising
- Cálculo de ACOS/TACOS
- Atualização de Buy Box

// DAILY (2 AM)
- Business Reports completos
- Cálculo de P&L diário
- Returns e Reimbursements
- Finance events reconciliation
- Geração de KPIs consolidados
- Limpeza de alertas antigos

// WEEKLY
- Análise de tendências
- Relatórios de performance
- Backup de dados
```

## 🚦 ROTAS API ESSENCIAIS

### Autenticação
```
GET  /auth/sp-api/connect      # Iniciar OAuth SP-API
GET  /auth/sp-api/callback     # Callback OAuth
GET  /auth/ads/connect         # Iniciar OAuth Ads
GET  /auth/ads/callback        # Callback OAuth
POST /auth/refresh              # Refresh tokens
```

### Sincronização
```
POST /sync/orders               # Sync orders manually
POST /sync/inventory            # Sync inventory
POST /sync/pricing              # Sync pricing
POST /sync/ads                  # Sync advertising
POST /sync/all                  # Full sync
GET  /sync/status/:jobId        # Check sync status
```

### Analytics
```
GET  /metrics/dashboard         # Dashboard principal
GET  /metrics/products          # Métricas por produto
GET  /metrics/profit-loss       # P&L statement
GET  /metrics/advertising       # Ad performance
GET  /metrics/trends            # Tendências
```

### Alertas
```
GET  /alerts                    # Listar alertas
PUT  /alerts/:id/read           # Marcar como lido
PUT  /alerts/:id/resolve        # Resolver alerta
POST /alerts/settings           # Configurar alertas
```

### Produtos
```
GET  /products                  # Listar produtos
GET  /products/:asin            # Detalhes do produto
PUT  /products/:asin/price      # Atualizar preço
POST /products/bulk-update      # Update em massa
```

## 📈 FEATURES DIFERENCIAIS DO MVP

### 1. **Profit Calculator Automático**
- Cálculo real de margem considerando TODAS as taxas
- FBA fees, referral fees, storage fees, ad spend
- Margem por produto e consolidada

### 2. **Alertas Inteligentes**
- Stock baixo (configurável)
- Perda de Buy Box
- ACOS acima do target
- Competitor price changes
- Reimbursement opportunities

### 3. **Analytics Preditivo (Básico)**
- Previsão de vendas (7 dias)
- Tendência de estoque
- Sugestões de reabastecimento

### 4. **Bulk Operations**
- Atualização de preços em massa
- Ajuste de inventory
- Pausar/ativar campanhas

## 🎯 MÉTRICAS DE SUCESSO

### KPIs do Sistema
- Uptime: 99.9%
- Sync frequency: Hourly
- Data freshness: < 1 hour
- API response time: < 200ms
- Alert accuracy: > 95%

### KPIs para Sellers
- Revenue tracking accuracy: 100%
- Profit calculation accuracy: > 98%
- Stock alert precision: > 95%
- Ad optimization suggestions: Daily

## 🚀 PRÓXIMOS PASSOS

1. **Setup Inicial**
   - Configurar PostgreSQL e Redis
   - Criar projeto Node.js/TypeScript
   - Configurar Prisma e migrations

2. **Implementação Core**
   - Auth system (SP-API + Ads)
   - Data sync services
   - REST API routes
   - Cron jobs

3. **Features Essenciais**
   - Alert system
   - Profit calculator
   - Basic analytics

4. **Testing & Deploy**
   - Unit tests
   - Integration tests
   - Docker setup
   - CI/CD pipeline

## 📝 NOTAS IMPORTANTES

- **Segurança**: Todos os tokens são encriptados
- **Multi-tenant**: Isolamento completo por tenant
- **Idempotência**: Todas operações são idempotentes
- **Rate Limiting**: Respeita limits da Amazon
- **Caching**: Redis para dados frequentes
- **Monitoring**: Logs estruturados e métricas

---

**Status**: Ready for Implementation
**Complexidade**: Reduzida em 60% do plano original
**Time to Market**: 4-8 semanas para MVP funcional
**ROI Esperado**: Features focadas no que realmente importa para sellers