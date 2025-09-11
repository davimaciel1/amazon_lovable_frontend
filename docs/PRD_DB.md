# PRD_DB - Database Architecture Document
# PostgreSQL Database Schema for Amazon SP-API SaaS

## 1. Database Overview

### 1.1 Informações de Conexão
```yaml
Production (Coolify):
  Host: <DB_HOST>
  Port: 5456
  Database: amazon_monitor
  User: saas
  Password: <DB_PASSWORD>
  SSL: required

Development:
  Host: localhost
  Port: 5432
  Database: amazon_monitor_dev
  User: postgres
  Password: postgres
```

### 1.2 Arquitetura Geral
```
┌─────────────────────────────────────────┐
│         PostgreSQL Database             │
│            (Multi-tenant)                │
├─────────────────────────────────────────┤
│  Core Tables:                           │
│  - tenants (isolamento)                 │
│  - profiles (usuários)                  │
│  - credentials (API keys)               │
├─────────────────────────────────────────┤
│  Business Tables:                       │
│  - products, orders, order_items        │
│  - finance_events, ad_performance       │
│  - business_metrics, alerts             │
├─────────────────────────────────────────┤
│  Support Tables:                        │
│  - sync_jobs, activity_logs             │
│  - inventory_history, price_history     │
└─────────────────────────────────────────┘
```

## 2. Schema Completo com Prisma

### 2.1 Configuração Prisma
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 2.2 Tabelas Core (Sistema)

#### Tenant (Multi-tenancy)
```prisma
model Tenant {
  id               String   @id @default(cuid())
  name             String
  email            String   @unique
  plan             String   @default("FREE") // FREE, STARTER, PRO, ENTERPRISE
  isActive         Boolean  @default(true)
  
  // Limites do plano
  maxUsers         Int      @default(1)
  maxProducts      Int      @default(100)
  maxOrdersPerMonth Int     @default(500)
  maxMarketplaces  Int      @default(1)
  
  // Configurações
  settings         Json?    @default("{}")
  features         String[] @default([])
  
  // Billing
  stripeCustomerId String?  @unique
  subscription     Json?
  billingEmail     String?
  
  // Timestamps
  trialEndsAt      DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  // Relations
  profiles         Profile[]
  credentials      Credentials[]
  orders           Order[]
  products         Product[]
  financeEvents    FinanceEvent[]
  adPerformance    AdPerformance[]
  businessMetrics  BusinessMetrics[]
  alerts           Alert[]
  syncJobs         SyncJob[]
  activityLogs     ActivityLog[]
  
  @@index([email])
  @@index([plan, isActive])
}
```

#### Profile (Usuários)
```prisma
model Profile {
  id               String   @id @default(cuid())
  userId           String   @unique // Supabase auth.users.id
  tenantId         String
  
  // Informações básicas
  email            String   @unique
  fullName         String
  username         String?  @unique
  avatarUrl        String?
  
  // Informações profissionais
  jobTitle         String?
  department       String?
  phone            String?
  phoneVerified    Boolean  @default(false)
  
  // Role e permissões
  role             String   @default("viewer") // owner, admin, manager, analyst, viewer
  permissions      String[] @default([])
  
  // Preferências
  timezone         String   @default("America/Sao_Paulo")
  language         String   @default("pt-BR")
  currency         String   @default("BRL")
  dateFormat       String   @default("DD/MM/YYYY")
  
  // Notificações
  emailNotifications Boolean @default(true)
  smsNotifications   Boolean @default(false)
  pushNotifications  Boolean @default(true)
  
  // UI Preferences
  theme            String   @default("light")
  sidebarCollapsed Boolean  @default(false)
  dashboardLayout  Json?
  
  // Security
  twoFactorEnabled Boolean  @default(false)
  twoFactorSecret  String?
  lastLoginAt      DateTime?
  lastLoginIp      String?
  
  // Status
  isActive         Boolean  @default(true)
  isVerified       Boolean  @default(false)
  onboardingStep   Int      @default(0)
  
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  // Relations
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  sessions         Session[]
  apiKeys          ApiKey[]
  activities       ActivityLog[]
  
  @@unique([tenantId, email])
  @@index([tenantId, role])
  @@index([userId])
}
```

#### Credentials (Amazon API)
```prisma
model Credentials {
  id               String   @id @default(cuid())
  tenantId         String
  
  // Tipo de credencial
  type             String   // SPAPI, ADS
  name             String?  // Nome amigável
  
  // Tokens (criptografados)
  refreshToken     String   @db.Text // Encrypted
  accessToken      String?  @db.Text // Temporary, encrypted
  accessTokenExpiry DateTime?
  
  // Configurações Amazon
  sellingPartnerId String?
  marketplaceIds   String[]
  profileIds       BigInt[] // Para ADS API
  region           String?  // na, eu, fe
  
  // Status
  isActive         Boolean  @default(true)
  isPrimary        Boolean  @default(false)
  lastSyncAt       DateTime?
  lastErrorAt      DateTime?
  lastError        String?
  
  // Metadados
  metadata         Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, type, name])
  @@index([tenantId, isActive])
  @@index([type])
}
```

### 2.3 Tabelas de Negócio

#### Product (Produtos)
```prisma
model Product {
  tenantId         String
  asin             String
  marketplaceId    String
  
  // Identificação
  sku              String
  fnsku            String?
  ean              String?
  upc              String?
  
  // Informações básicas
  title            String   @db.Text
  brand            String?
  manufacturer     String?
  category         String?
  subcategory      String?
  productGroup     String?
  
  // Imagens e links
  imageUrl         String?
  thumbnailUrl     String?
  productUrl       String?
  
  // Dimensões e peso
  weight           Decimal? @db.Decimal(10, 3)
  weightUnit       String?
  height           Decimal? @db.Decimal(10, 2)
  width            Decimal? @db.Decimal(10, 2)
  length           Decimal? @db.Decimal(10, 2)
  dimensionUnit    String?
  
  // Preços
  currentPrice     Decimal? @db.Decimal(10, 2)
  listPrice        Decimal? @db.Decimal(10, 2)
  salePrice        Decimal? @db.Decimal(10, 2)
  businessPrice    Decimal? @db.Decimal(10, 2)
  
  // Competição
  competitorCount  Int?
  lowestPrice      Decimal? @db.Decimal(10, 2)
  buyBoxPrice      Decimal? @db.Decimal(10, 2)
  buyBoxWinner     Boolean  @default(false)
  
  // Inventário FBA
  fbaStock         Int      @default(0)
  fbaInbound       Int      @default(0)
  fbaReserved      Int      @default(0)
  fbaUnsellable    Int      @default(0)
  
  // Inventário FBM
  fbmStock         Int      @default(0)
  fbmReserved      Int      @default(0)
  
  // Totais
  totalStock       Int      @default(0)
  availableStock   Int      @default(0)
  
  // Rankings
  salesRank        Int?
  categoryRank     Int?
  subcategoryRank  Int?
  
  // Métricas (30 dias)
  totalSales30d    Decimal? @db.Decimal(12, 2)
  totalUnits30d    Int?
  totalOrders30d   Int?
  avgPrice30d      Decimal? @db.Decimal(10, 2)
  avgMargin30d     Decimal? @db.Decimal(5, 2)
  velocity30d      Decimal? @db.Decimal(10, 2) // units/day
  conversionRate   Decimal? @db.Decimal(5, 2)
  
  // Custos
  unitCost         Decimal? @db.Decimal(10, 2)
  shippingCost     Decimal? @db.Decimal(10, 2)
  fbaFees          Decimal? @db.Decimal(10, 2)
  referralFee      Decimal? @db.Decimal(10, 2)
  
  // Configurações usuário
  minStockAlert    Int?
  maxStock         Int?
  targetMargin     Decimal? @db.Decimal(5, 2)
  notes            String?  @db.Text
  tags             String[]
  customFields     Json?
  
  // Status
  isActive         Boolean  @default(true)
  listingStatus    String?  // ACTIVE, INACTIVE, INCOMPLETE
  fulfillmentChannel String? // AFN, MFN, BOTH
  
  // Sync
  lastSyncAt       DateTime?
  lastPriceUpdate  DateTime?
  lastStockUpdate  DateTime?
  
  // Metadata
  metadata         Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  // Relations
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  orderItems       OrderItem[]
  inventoryHistory InventoryHistory[]
  priceHistory     PriceHistory[]
  
  @@id([tenantId, asin, marketplaceId])
  @@index([tenantId, sku])
  @@index([tenantId, isActive])
  @@index([tenantId, buyBoxWinner])
  @@index([tenantId, totalStock])
}
```

#### Order (Pedidos)
```prisma
model Order {
  tenantId         String
  amazonOrderId    String
  
  // Informações do pedido
  marketplaceId    String
  purchaseDate     DateTime
  lastUpdateDate   DateTime
  orderStatus      String   // Pending, Unshipped, Shipped, Canceled, etc
  
  // Canal e tipo
  fulfillmentChannel String? // AFN (FBA), MFN (FBM)
  orderType        String?  // StandardOrder, LongLeadTimeOrder, etc
  salesChannel     String?
  shipServiceLevel String?
  
  // Valores
  orderTotal       Decimal  @db.Decimal(10, 2)
  orderCurrency    String
  itemSubtotal     Decimal? @db.Decimal(10, 2)
  shippingPrice    Decimal? @db.Decimal(10, 2)
  shippingTax      Decimal? @db.Decimal(10, 2)
  totalTax         Decimal? @db.Decimal(10, 2)
  
  // Quantidades
  itemCount        Int      @default(0)
  unitsOrdered     Int      @default(0)
  
  // Cálculos
  totalCost        Decimal? @db.Decimal(10, 2)
  totalFees        Decimal? @db.Decimal(10, 2)
  profit           Decimal? @db.Decimal(10, 2)
  margin           Decimal? @db.Decimal(5, 2)
  
  // Cliente (hash para privacidade)
  buyerEmailHash   String?
  buyerNameHash    String?
  
  // Endereço (parcial para privacidade)
  shippingCity     String?
  shippingState    String?
  shippingPostalCode String?
  shippingCountry  String?
  
  // Entrega
  earliestShipDate DateTime?
  latestShipDate   DateTime?
  earliestDeliveryDate DateTime?
  latestDeliveryDate DateTime?
  
  // Pagamento
  paymentMethod    String?
  paymentDate      DateTime?
  
  // Flags
  isPrime          Boolean  @default(false)
  isPremiumOrder   Boolean  @default(false)
  isBusinessOrder  Boolean  @default(false)
  isReplacementOrder Boolean @default(false)
  
  // Metadata
  metadata         Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  // Relations
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  orderItems       OrderItem[]
  
  @@id([tenantId, amazonOrderId])
  @@index([tenantId, purchaseDate])
  @@index([tenantId, orderStatus])
  @@index([tenantId, fulfillmentChannel])
  @@index([purchaseDate])
}
```

#### OrderItem (Itens do Pedido)
```prisma
model OrderItem {
  tenantId         String
  amazonOrderId    String
  orderItemId      String
  
  // Produto
  asin             String
  sku              String?
  title            String?  @db.Text
  
  // Quantidades
  quantity         Int
  quantityShipped  Int      @default(0)
  quantityCanceled Int      @default(0)
  
  // Preços
  itemPrice        Decimal  @db.Decimal(10, 2)
  itemCurrency     String
  unitPrice        Decimal? @db.Decimal(10, 2)
  
  // Descontos e promoções
  promotionDiscount Decimal? @db.Decimal(10, 2)
  promotionIds     String[]
  couponDiscount   Decimal? @db.Decimal(10, 2)
  
  // Taxas
  itemTax          Decimal? @db.Decimal(10, 2)
  shippingPrice    Decimal? @db.Decimal(10, 2)
  shippingTax      Decimal? @db.Decimal(10, 2)
  shippingDiscount Decimal? @db.Decimal(10, 2)
  
  // Custos e lucro
  unitCost         Decimal? @db.Decimal(10, 2)
  totalCost        Decimal? @db.Decimal(10, 2)
  itemFees         Decimal? @db.Decimal(10, 2)
  itemProfit       Decimal? @db.Decimal(10, 2)
  
  // Gift
  isGift           Boolean  @default(false)
  giftWrapPrice    Decimal? @db.Decimal(10, 2)
  giftWrapTax      Decimal? @db.Decimal(10, 2)
  
  // Metadata
  metadata         Json?
  
  // Relations
  order            Order    @relation(fields: [tenantId, amazonOrderId], references: [tenantId, amazonOrderId], onDelete: Cascade)
  product          Product? @relation(fields: [tenantId, asin, "MARKETPLACE_ID"], references: [tenantId, asin, marketplaceId])
  
  @@id([tenantId, amazonOrderId, orderItemId])
  @@index([tenantId, asin])
  @@index([tenantId, sku])
}
```

#### FinanceEvent (Eventos Financeiros)
```prisma
model FinanceEvent {
  id               String   @id @default(cuid())
  tenantId         String
  
  // Temporal
  eventDate        DateTime
  postedDate       DateTime
  
  // Tipo e categoria
  type             String   // ORDER, REFUND, FEE, REIMBURSEMENT, AD_SPEND, STORAGE_FEE, etc
  category         String   // Revenue, Cost, Fee, Adjustment
  subCategory      String?
  
  // Descrição
  description      String?  @db.Text
  reason           String?
  
  // Valores
  amount           Decimal  @db.Decimal(12, 2)
  currency         String
  
  // Referências
  amazonOrderId    String?
  asin             String?
  sku              String?
  marketplaceId    String?
  shipmentId       String?
  adjustmentId     String?
  
  // Quantidades
  quantity         Int?
  
  // Detalhamento de taxas
  feeType          String?  // Commission, FBAFee, RefundCommission, etc
  feeBreakdown     Json?    // Detalhamento completo
  
  // Status
  status           String?  // Posted, Pending, Canceled
  
  // Metadata
  metadata         Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId, eventDate, type])
  @@index([tenantId, postedDate])
  @@index([tenantId, amazonOrderId])
  @@index([tenantId, asin])
  @@index([type, category])
}
```

#### AdPerformance (Performance de Publicidade)
```prisma
model AdPerformance {
  tenantId         String
  date             DateTime @db.Date
  profileId        BigInt
  
  // Campanha
  campaignId       BigInt
  campaignName     String
  campaignType     String?  // SP, SB, SD
  campaignStatus   String?
  
  // Ad Group
  adGroupId        BigInt?
  adGroupName      String?
  
  // Produto/Keyword
  adId             BigInt?
  asin             String
  sku              String?
  keyword          String?
  matchType        String?  // EXACT, PHRASE, BROAD
  
  // Métricas básicas
  impressions      Int      @default(0)
  clicks           Int      @default(0)
  spend            Decimal  @db.Decimal(10, 2)
  
  // Vendas
  sales            Decimal  @db.Decimal(10, 2)
  orders           Int      @default(0)
  units            Int      @default(0)
  
  // Métricas calculadas
  ctr              Decimal? @db.Decimal(5, 4) // Click-through rate
  cpc              Decimal? @db.Decimal(10, 2) // Cost per click
  cpa              Decimal? @db.Decimal(10, 2) // Cost per acquisition
  acos             Decimal? @db.Decimal(5, 2) // Advertising cost of sales
  roas             Decimal? @db.Decimal(5, 2) // Return on ad spend
  
  // Conversões
  conversionRate   Decimal? @db.Decimal(5, 2)
  
  // Bidding
  defaultBid       Decimal? @db.Decimal(10, 2)
  bidAdjustment    Decimal? @db.Decimal(5, 2)
  
  // Budget
  dailyBudget      Decimal? @db.Decimal(10, 2)
  monthlyBudget    Decimal? @db.Decimal(10, 2)
  
  // Metadata
  metadata         Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@id([tenantId, date, profileId, campaignId, asin])
  @@index([tenantId, date])
  @@index([tenantId, campaignId])
  @@index([tenantId, asin])
  @@index([date])
}
```

#### BusinessMetrics (KPIs Agregados)
```prisma
model BusinessMetrics {
  tenantId         String
  date             DateTime @db.Date
  marketplaceId    String?
  
  // Métricas de receita
  revenue          Decimal  @db.Decimal(12, 2)
  refunds          Decimal  @db.Decimal(12, 2)
  netRevenue       Decimal  @db.Decimal(12, 2)
  recurringRevenue Decimal? @db.Decimal(12, 2)
  
  // Métricas de custo
  productCost      Decimal  @db.Decimal(12, 2)
  amazonFees       Decimal  @db.Decimal(12, 2)
  fbaFees          Decimal  @db.Decimal(12, 2)
  storageFees      Decimal  @db.Decimal(12, 2)
  advertisingSpend Decimal  @db.Decimal(12, 2)
  shippingCost     Decimal  @db.Decimal(12, 2)
  otherCosts       Decimal  @db.Decimal(12, 2)
  totalCosts       Decimal  @db.Decimal(12, 2)
  
  // Métricas de lucro
  grossProfit      Decimal  @db.Decimal(12, 2)
  operatingProfit  Decimal  @db.Decimal(12, 2)
  netProfit        Decimal  @db.Decimal(12, 2)
  ebitda           Decimal  @db.Decimal(12, 2)
  
  // Margens
  grossMargin      Decimal  @db.Decimal(5, 2)
  operatingMargin  Decimal  @db.Decimal(5, 2)
  netMargin        Decimal  @db.Decimal(5, 2)
  
  // Métricas de vendas
  orders           Int      @default(0)
  units            Int      @default(0)
  canceledOrders   Int      @default(0)
  returnedUnits    Int      @default(0)
  
  // Valores médios
  avgOrderValue    Decimal  @db.Decimal(10, 2)
  avgSellingPrice  Decimal  @db.Decimal(10, 2)
  avgUnitCost      Decimal  @db.Decimal(10, 2)
  
  // Métricas de publicidade
  adSpend          Decimal? @db.Decimal(10, 2)
  adSales          Decimal? @db.Decimal(10, 2)
  adOrders         Int?
  adImpressions    Int?
  adClicks         Int?
  acos             Decimal? @db.Decimal(5, 2)
  tacos            Decimal? @db.Decimal(5, 2)
  roas             Decimal? @db.Decimal(5, 2)
  
  // Métricas de conversão
  sessions         Int?
  pageViews        Int?
  conversionRate   Decimal? @db.Decimal(5, 2)
  cartAbandonment  Decimal? @db.Decimal(5, 2)
  
  // Métricas de inventário
  inventoryValue   Decimal? @db.Decimal(12, 2)
  inventoryTurns   Decimal? @db.Decimal(5, 2)
  daysOfInventory  Int?
  stockoutRate     Decimal? @db.Decimal(5, 2)
  
  // Métricas de cliente
  newCustomers     Int?
  repeatCustomers  Int?
  customerLifetimeValue Decimal? @db.Decimal(10, 2)
  
  // Metadata
  metadata         Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@id([tenantId, date])
  @@index([tenantId, date])
  @@index([date])
}
```

### 2.4 Tabelas de Suporte

#### Alert (Alertas)
```prisma
model Alert {
  id               String   @id @default(cuid())
  tenantId         String
  
  // Tipo e severidade
  type             String   // STOCK_LOW, PRICE_CHANGE, BUYBOX_LOST, HIGH_ACOS, NEGATIVE_MARGIN, etc
  severity         String   // LOW, MEDIUM, HIGH, CRITICAL
  category         String?  // inventory, pricing, performance, etc
  
  // Status
  status           String   @default("ACTIVE") // ACTIVE, ACKNOWLEDGED, RESOLVED, DISMISSED
  
  // Conteúdo
  title            String
  message          String   @db.Text
  details          Json?
  
  // Entidades relacionadas
  asin             String?
  sku              String?
  amazonOrderId    String?
  campaignId       BigInt?
  marketplaceId    String?
  
  // Ações sugeridas
  suggestedAction  String?  @db.Text
  actionUrl        String?
  
  // Thresholds que triggeram o alerta
  thresholdValue   Decimal? @db.Decimal(10, 2)
  actualValue      Decimal? @db.Decimal(10, 2)
  
  // Tracking
  isRead           Boolean  @default(false)
  readAt           DateTime?
  readBy           String?
  
  acknowledgedAt   DateTime?
  acknowledgedBy   String?
  
  resolvedAt       DateTime?
  resolvedBy       String?
  resolution       String?  @db.Text
  
  dismissedAt      DateTime?
  dismissedBy      String?
  dismissReason    String?
  
  // Auto-resolve
  autoResolve      Boolean  @default(false)
  autoResolveAt    DateTime?
  
  // Notificações
  emailSent        Boolean  @default(false)
  smsSent          Boolean  @default(false)
  pushSent         Boolean  @default(false)
  
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId, status, severity])
  @@index([tenantId, type, createdAt])
  @@index([tenantId, isRead])
  @@index([createdAt])
}
```

#### SyncJob (Jobs de Sincronização)
```prisma
model SyncJob {
  id               String   @id @default(cuid())
  tenantId         String
  
  // Tipo de sincronização
  type             String   // ORDERS, INVENTORY, PRICING, FINANCE, ADS, METRICS, FULL
  subType          String?  // Detalhamento específico
  
  // Status
  status           String   @default("PENDING") // PENDING, QUEUED, RUNNING, SUCCESS, FAILED, CANCELLED
  priority         Int      @default(5) // 1 (highest) to 10 (lowest)
  
  // Período
  startDate        DateTime?
  endDate          DateTime?
  
  // Execução
  startedAt        DateTime?
  completedAt      DateTime?
  duration         Int?     // em segundos
  
  // Progress tracking
  totalRecords     Int?
  processedRecords Int?
  failedRecords    Int?
  skippedRecords   Int?
  
  // Performance
  avgProcessingTime Decimal? @db.Decimal(10, 2) // ms per record
  dataVolume       BigInt?  // bytes
  
  // Resultados
  summary          Json?
  errors           Json?
  warnings         Json?
  
  // Retry
  retryCount       Int      @default(0)
  maxRetries       Int      @default(3)
  lastError        String?  @db.Text
  nextRetryAt      DateTime?
  
  // Scheduling
  scheduledFor     DateTime?
  recurring        Boolean  @default(false)
  cronExpression   String?
  
  // Dependencies
  dependsOn        String?  // Job ID that must complete first
  triggeredBy      String?  // manual, scheduled, dependency, api
  
  metadata         Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId, type, status])
  @@index([tenantId, status, priority])
  @@index([scheduledFor, status])
  @@index([status, priority])
}
```

#### ActivityLog (Log de Atividades)
```prisma
model ActivityLog {
  id               String   @id @default(cuid())
  tenantId         String
  userId           String?
  
  // Ação
  action           String   // login, logout, create, update, delete, export, sync, etc
  category         String   // auth, data, settings, billing, etc
  resource         String   // user, product, order, settings, etc
  resourceId       String?
  
  // Detalhes
  description      String?  @db.Text
  metadata         Json?    // Dados adicionais sobre a ação
  changes          Json?    // Before/after para updates
  
  // Request info
  ipAddress        String?
  userAgent        String?
  requestId        String?
  sessionId        String?
  
  // Response
  status           String   @default("success") // success, failed, partial
  statusCode       Int?
  errorMessage     String?  @db.Text
  duration         Int?     // ms
  
  createdAt        DateTime @default(now())
  
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user             Profile? @relation(fields: [userId], references: [id], onDelete: SetNull)
  
  @@index([tenantId, userId, action])
  @@index([tenantId, resource, action])
  @@index([tenantId, createdAt])
  @@index([createdAt])
}
```

### 2.5 Tabelas de Histórico

#### InventoryHistory
```prisma
model InventoryHistory {
  id               String   @id @default(cuid())
  tenantId         String
  asin             String
  marketplaceId    String
  
  date             DateTime @db.Date
  
  // Snapshot do inventário
  fbaStock         Int
  fbaInbound       Int
  fbaReserved      Int
  fbmStock         Int
  totalStock       Int
  
  // Movimentações do dia
  unitsReceived    Int?
  unitsSold        Int?
  unitsReturned    Int?
  unitsAdjusted    Int?
  
  // Análise
  stockoutRisk     Boolean  @default(false)
  daysOfStock      Int?
  
  createdAt        DateTime @default(now())
  
  product          Product  @relation(fields: [tenantId, asin, marketplaceId], references: [tenantId, asin, marketplaceId], onDelete: Cascade)
  
  @@index([tenantId, asin, date])
  @@index([date])
}
```

#### PriceHistory
```prisma
model PriceHistory {
  id               String   @id @default(cuid())
  tenantId         String
  asin             String
  marketplaceId    String
  
  date             DateTime
  
  // Nossos preços
  ourPrice         Decimal  @db.Decimal(10, 2)
  ourShipping      Decimal? @db.Decimal(10, 2)
  
  // Competição
  competitorPrice  Decimal? @db.Decimal(10, 2)
  lowestPrice      Decimal? @db.Decimal(10, 2)
  buyBoxPrice      Decimal? @db.Decimal(10, 2)
  competitorCount  Int?
  
  // Status
  buyBoxWinner     Boolean
  pricePosition    Int?     // Nossa posição no ranking de preço
  
  // Mudanças
  priceChange      Decimal? @db.Decimal(10, 2)
  changePercent    Decimal? @db.Decimal(5, 2)
  
  createdAt        DateTime @default(now())
  
  product          Product  @relation(fields: [tenantId, asin, marketplaceId], references: [tenantId, asin, marketplaceId], onDelete: Cascade)
  
  @@index([tenantId, asin, date])
  @@index([date])
}
```

### 2.6 Tabelas de Sessão e Segurança

#### Session
```prisma
model Session {
  id               String   @id @default(cuid())
  userId           String
  
  // Token info
  accessToken      String   @unique
  refreshToken     String   @unique
  
  // Device info
  deviceId         String?
  deviceName       String?
  deviceType       String?  // desktop, mobile, tablet
  browser          String?
  os               String?
  
  // Location
  ipAddress        String?
  country          String?
  city             String?
  
  // Session management
  isActive         Boolean  @default(true)
  lastActivity     DateTime @default(now())
  
  createdAt        DateTime @default(now())
  expiresAt        DateTime
  
  user             Profile  @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId, isActive])
  @@index([accessToken])
  @@index([expiresAt])
}
```

#### ApiKey
```prisma
model ApiKey {
  id               String   @id @default(cuid())
  tenantId         String
  userId           String
  
  // Key info
  name             String
  keyHash          String   @unique // Hashed API key
  keyPrefix        String   // First 7 chars for identification
  description      String?  @db.Text
  
  // Permissions
  permissions      String[] // Specific permissions
  scopes           String[] // API scopes
  
  // Restrictions
  allowedIps       String[]
  allowedOrigins   String[]
  
  // Rate limiting
  rateLimitPerHour Int      @default(1000)
  rateLimitPerDay  Int      @default(10000)
  
  // Usage
  lastUsedAt       DateTime?
  lastUsedIp       String?
  totalRequests    Int      @default(0)
  
  // Status
  isActive         Boolean  @default(true)
  expiresAt        DateTime?
  
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  user             Profile  @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([tenantId, isActive])
  @@index([keyHash])
}
```

## 3. Índices e Otimizações

### 3.1 Índices Principais
```sql
-- Índices para queries frequentes
CREATE INDEX idx_orders_tenant_date ON orders(tenant_id, purchase_date DESC);
CREATE INDEX idx_orders_status ON orders(tenant_id, order_status);
CREATE INDEX idx_orders_channel ON orders(tenant_id, fulfillment_channel);

CREATE INDEX idx_products_tenant_active ON products(tenant_id, is_active);
CREATE INDEX idx_products_stock ON products(tenant_id, total_stock);
CREATE INDEX idx_products_buybox ON products(tenant_id, buy_box_winner);

CREATE INDEX idx_finance_events_date ON finance_events(tenant_id, event_date DESC);
CREATE INDEX idx_finance_events_type ON finance_events(tenant_id, type, category);

CREATE INDEX idx_alerts_unread ON alerts(tenant_id, is_read, created_at DESC);
CREATE INDEX idx_alerts_active ON alerts(tenant_id, status) WHERE status = 'ACTIVE';

-- Índices para full-text search
CREATE INDEX idx_products_search ON products 
USING gin(to_tsvector('english', title || ' ' || COALESCE(brand, '') || ' ' || asin || ' ' || sku));

CREATE INDEX idx_orders_search ON orders 
USING gin(to_tsvector('english', amazon_order_id || ' ' || COALESCE(buyer_email_hash, '')));
```

### 3.2 Particionamento
```sql
-- Particionar orders por data (mensal)
CREATE TABLE orders_2024_01 PARTITION OF orders
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE orders_2024_02 PARTITION OF orders
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Particionar finance_events por data
CREATE TABLE finance_events_2024_q1 PARTITION OF finance_events
FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

-- Particionar activity_logs por data
CREATE TABLE activity_logs_2024_01 PARTITION OF activity_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### 3.3 Views Materializadas
```sql
-- Dashboard KPIs
CREATE MATERIALIZED VIEW mv_dashboard_kpis AS
SELECT 
  tenant_id,
  DATE(purchase_date) as date,
  COUNT(*) as order_count,
  SUM(order_total) as revenue,
  SUM(profit) as profit,
  AVG(margin) as avg_margin,
  COUNT(DISTINCT buyer_email_hash) as unique_customers
FROM orders
WHERE purchase_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY tenant_id, DATE(purchase_date)
WITH DATA;

CREATE UNIQUE INDEX ON mv_dashboard_kpis(tenant_id, date);

-- Product Rankings
CREATE MATERIALIZED VIEW mv_product_rankings AS
SELECT 
  p.tenant_id,
  p.asin,
  p.title,
  p.total_sales_30d,
  p.total_units_30d,
  p.avg_margin_30d,
  RANK() OVER (PARTITION BY p.tenant_id ORDER BY p.total_sales_30d DESC) as sales_rank
FROM products p
WHERE p.is_active = true
WITH DATA;

CREATE INDEX ON mv_product_rankings(tenant_id, sales_rank);

-- Financial Summary
CREATE MATERIALIZED VIEW mv_financial_summary AS
SELECT 
  tenant_id,
  DATE_TRUNC('month', event_date) as month,
  type,
  category,
  SUM(amount) as total_amount,
  COUNT(*) as transaction_count
FROM finance_events
WHERE event_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY tenant_id, DATE_TRUNC('month', event_date), type, category
WITH DATA;

CREATE INDEX ON mv_financial_summary(tenant_id, month);
```

### 3.4 Funções e Triggers

#### Triggers de Atualização
```sql
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar em todas tabelas com updated_at
CREATE TRIGGER update_tenant_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### Função para Cálculo de Métricas
```sql
-- Calcular métricas de produto
CREATE OR REPLACE FUNCTION calculate_product_metrics(
  p_tenant_id TEXT,
  p_asin TEXT,
  p_marketplace_id TEXT,
  p_days INTEGER DEFAULT 30
) RETURNS TABLE(
  total_sales DECIMAL,
  total_units INTEGER,
  total_orders INTEGER,
  avg_price DECIMAL,
  avg_margin DECIMAL,
  velocity DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(oi.item_price), 0)::DECIMAL as total_sales,
    COALESCE(SUM(oi.quantity), 0)::INTEGER as total_units,
    COUNT(DISTINCT o.amazon_order_id)::INTEGER as total_orders,
    AVG(oi.unit_price)::DECIMAL as avg_price,
    AVG((oi.item_profit / NULLIF(oi.item_price, 0)) * 100)::DECIMAL as avg_margin,
    (COALESCE(SUM(oi.quantity), 0) / p_days::DECIMAL)::DECIMAL as velocity
  FROM orders o
  JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
    AND o.tenant_id = oi.tenant_id
  WHERE o.tenant_id = p_tenant_id
    AND oi.asin = p_asin
    AND o.marketplace_id = p_marketplace_id
    AND o.purchase_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
    AND o.order_status NOT IN ('Cancelled', 'Pending');
END;
$$ LANGUAGE plpgsql;
```

#### Função para Alertas Automáticos
```sql
-- Criar alertas de estoque baixo
CREATE OR REPLACE FUNCTION check_low_stock_alerts()
RETURNS void AS $$
DECLARE
  product_rec RECORD;
BEGIN
  FOR product_rec IN 
    SELECT 
      p.*,
      p.velocity_30d * 7 as weekly_velocity
    FROM products p
    WHERE p.is_active = true
      AND p.min_stock_alert IS NOT NULL
      AND p.total_stock < p.min_stock_alert
      AND NOT EXISTS (
        SELECT 1 FROM alerts a
        WHERE a.tenant_id = p.tenant_id
          AND a.asin = p.asin
          AND a.type = 'STOCK_LOW'
          AND a.status = 'ACTIVE'
      )
  LOOP
    INSERT INTO alerts (
      tenant_id, type, severity, status,
      title, message, asin, marketplace_id
    ) VALUES (
      product_rec.tenant_id,
      'STOCK_LOW',
      CASE 
        WHEN product_rec.total_stock = 0 THEN 'CRITICAL'
        WHEN product_rec.total_stock < product_rec.weekly_velocity THEN 'HIGH'
        ELSE 'MEDIUM'
      END,
      'ACTIVE',
      'Low stock alert for ' || product_rec.title,
      'Product has ' || product_rec.total_stock || ' units remaining. Weekly velocity: ' || 
        ROUND(product_rec.weekly_velocity, 0) || ' units.',
      product_rec.asin,
      product_rec.marketplace_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

## 4. Segurança e Performance

### 4.1 Row Level Security (RLS)
```sql
-- Habilitar RLS em todas tabelas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_events ENABLE ROW LEVEL SECURITY;

-- Policy para tenant isolation
CREATE POLICY tenant_isolation ON products
  FOR ALL 
  USING (tenant_id = current_setting('app.current_tenant')::TEXT);

CREATE POLICY tenant_isolation ON orders
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant')::TEXT);

-- Policy para roles
CREATE POLICY role_based_access ON finance_events
  FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant')::TEXT
    AND (
      current_setting('app.current_role') IN ('owner', 'admin', 'manager')
      OR (current_setting('app.current_role') = 'analyst' AND type != 'COST')
    )
  );
```

### 4.2 Backup e Recovery
```sql
-- Backup configuration
-- Coolify/PostgreSQL deve ter configurado:
-- - Backup automático diário
-- - Point-in-time recovery (PITR)
-- - Retenção de 30 dias

-- Backup manual
pg_dump -h <DB_HOST> -p 5456 -U saas -d amazon_monitor > backup_$(date +%Y%m%d).sql

-- Restore
psql -h <DB_HOST> -p 5456 -U saas -d amazon_monitor < backup_20241201.sql
```

### 4.3 Monitoramento
```sql
-- Queries lentas
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top queries por tempo
SELECT 
  query,
  mean_exec_time,
  calls,
  total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Tamanho das tabelas
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Conexões ativas
SELECT 
  pid,
  usename,
  application_name,
  client_addr,
  state,
  query
FROM pg_stat_activity
WHERE state != 'idle';
```

## 5. Migrations com Prisma

### 5.1 Setup Inicial
```bash
# Instalar Prisma
npm install -D prisma
npm install @prisma/client

# Inicializar Prisma
npx prisma init

# Configurar .env
DATABASE_URL="postgresql://saas:<DB_PASSWORD>@<DB_HOST>:5456/amazon_monitor?schema=public"

# Gerar cliente Prisma
npx prisma generate

# Criar primeira migration
npx prisma migrate dev --name init

# Deploy em produção
npx prisma migrate deploy
```

### 5.2 Workflow de Desenvolvimento
```bash
# 1. Modificar schema.prisma

# 2. Criar migration
npx prisma migrate dev --name add_new_field

# 3. Gerar cliente atualizado
npx prisma generate

# 4. Deploy em produção
npx prisma migrate deploy

# 5. Seed inicial (opcional)
npx prisma db seed
```

### 5.3 Seed Data
```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Criar tenant de teste
  const tenant = await prisma.tenant.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      name: 'Demo Company',
      email: 'demo@example.com',
      plan: 'PRO'
    }
  })
  
  // Criar usuário admin
  const admin = await prisma.profile.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      userId: 'demo-user-id',
      tenantId: tenant.id,
      email: 'admin@example.com',
      fullName: 'Admin User',
      role: 'admin'
    }
  })
  
  console.log({ tenant, admin })
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

## 6. Queries Úteis

### 6.1 Dashboard Queries
```sql
-- KPIs do dia
SELECT 
  COUNT(*) as orders_today,
  SUM(order_total) as revenue_today,
  SUM(profit) as profit_today,
  AVG(margin) as avg_margin_today
FROM orders
WHERE tenant_id = $1
  AND DATE(purchase_date) = CURRENT_DATE;

-- Top produtos do mês
SELECT 
  p.asin,
  p.title,
  p.image_url,
  SUM(oi.quantity) as units_sold,
  SUM(oi.item_price) as revenue,
  SUM(oi.item_profit) as profit
FROM products p
JOIN order_items oi ON p.asin = oi.asin
JOIN orders o ON oi.amazon_order_id = o.amazon_order_id
WHERE p.tenant_id = $1
  AND o.purchase_date >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY p.asin, p.title, p.image_url
ORDER BY revenue DESC
LIMIT 10;
```

### 6.2 Relatórios
```sql
-- P&L Mensal
SELECT 
  DATE_TRUNC('month', event_date) as month,
  SUM(CASE WHEN category = 'Revenue' THEN amount ELSE 0 END) as revenue,
  SUM(CASE WHEN category = 'Cost' THEN amount ELSE 0 END) as costs,
  SUM(CASE WHEN category = 'Fee' THEN amount ELSE 0 END) as fees,
  SUM(CASE WHEN category = 'Revenue' THEN amount ELSE 0 END) - 
    SUM(CASE WHEN category IN ('Cost', 'Fee') THEN amount ELSE 0 END) as net_profit
FROM finance_events
WHERE tenant_id = $1
  AND event_date >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', event_date)
ORDER BY month;

-- Análise de velocidade
SELECT 
  p.asin,
  p.title,
  p.total_stock,
  p.velocity_30d,
  CASE 
    WHEN p.velocity_30d > 0 THEN p.total_stock / p.velocity_30d
    ELSE 999
  END as days_of_stock,
  CASE
    WHEN p.total_stock / NULLIF(p.velocity_30d, 0) < 7 THEN 'CRITICAL'
    WHEN p.total_stock / NULLIF(p.velocity_30d, 0) < 14 THEN 'LOW'
    WHEN p.total_stock / NULLIF(p.velocity_30d, 0) < 30 THEN 'NORMAL'
    ELSE 'HIGH'
  END as stock_level
FROM products p
WHERE p.tenant_id = $1
  AND p.is_active = true
ORDER BY days_of_stock ASC;
```

---
*Documento mantido por: Database Team*
*Última atualização: Dezembro 2024*
*Versão: 1.0*