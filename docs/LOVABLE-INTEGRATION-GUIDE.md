# Guia de Integração Frontend (Lovable) com Backend

## 🚀 Informações do Backend (Coolify)

### Servidor de Produção
```yaml
Host: <DB_HOST>
Database Port: 5456
API Port: 3333 (ou conforme configurado)
Database: PostgreSQL (amazon_monitor)
User: saas
Password: <DB_PASSWORD>
```

### Servidor de Desenvolvimento (Local)
```yaml
API Base URL: http://localhost:8080/api
Database: PostgreSQL local ou Supabase
```

## 📊 Database Schema Completo

### Tabelas Principais do Sistema

```sql
-- Estrutura de tabelas já criadas no banco PostgreSQL
-- Acessíveis via Prisma ORM no backend

1. Tenant (Multi-tenancy)
   - id (string, cuid)
   - name (string)
   - email (string, unique)
   - plan (string): FREE | STARTER | PRO | ENTERPRISE
   - isActive (boolean)
   - settings (json)

2. Credentials (Amazon API)
   - id (string)
   - tenantId (string, FK)
   - type (string): SPAPI | ADS
   - refreshToken (encrypted)
   - accessToken (encrypted)
   - marketplaceIds (array)
   - region (string): na | eu | fe

3. Order
   - tenantId + amazonOrderId (composite PK)
   - purchaseDate (datetime)
   - orderStatus (string)
   - orderTotal (decimal)
   - profit (decimal)
   - margin (decimal)

4. Product
   - tenantId + asin + marketplaceId (composite PK)
   - title (string)
   - currentPrice (decimal)
   - fbaStock (int)
   - totalSales30d (decimal)
   - buyBoxWinner (boolean)

5. FinanceEvent
   - id (string)
   - tenantId (string)
   - eventDate (datetime)
   - type: ORDER | REFUND | FEE | REIMBURSEMENT | AD_SPEND
   - amount (decimal)

6. AdPerformance
   - Composite PK: tenantId + date + profileId + campaignId + asin
   - impressions (int)
   - clicks (int)
   - spend (decimal)
   - sales (decimal)
   - acos (decimal)

7. BusinessMetrics (KPIs Diários)
   - tenantId + date (composite PK)
   - revenue (decimal)
   - netProfit (decimal)
   - orders (int)
   - acos (decimal)

8. Alert
   - id (string)
   - tenantId (string)
   - type: STOCK_LOW | PRICE_CHANGE | BUYBOX_LOST | HIGH_ACOS
   - severity: LOW | MEDIUM | HIGH | CRITICAL
   - status: ACTIVE | ACKNOWLEDGED | RESOLVED

9. SyncJob
   - id (string)
   - type: ORDERS | INVENTORY | PRICING | FINANCE | ADS
   - status: PENDING | RUNNING | SUCCESS | FAILED
```

## 🔐 Autenticação e Autorização

### Fluxo de Autenticação (JWT)
```javascript
// 1. Login
POST /api/auth/login
Body: { email, password }
Response: { 
  accessToken,  // JWT válido por 15 min
  refreshToken, // JWT válido por 30 dias
  user: { id, email, name, role, tenantId }
}

// 2. Refresh Token
POST /api/auth/refresh
Body: { refreshToken }
Response: { accessToken, refreshToken }

// 3. Headers em todas requisições autenticadas
Authorization: Bearer {accessToken}
X-Tenant-ID: {tenantId}
```

### Roles e Permissões
```javascript
// Roles disponíveis
const ROLES = {
  OWNER: 'owner',      // Acesso total + billing
  ADMIN: 'admin',      // Acesso total sem billing
  MANAGER: 'manager',  // Gerenciar produtos/pedidos
  ANALYST: 'analyst',  // Visualizar e exportar
  VIEWER: 'viewer'     // Apenas visualizar
}

// Verificação no frontend
const canEdit = ['owner', 'admin', 'manager'].includes(userRole);
const canExport = ['owner', 'admin', 'manager', 'analyst'].includes(userRole);
const canManageUsers = ['owner', 'admin'].includes(userRole);
const canManageBilling = userRole === 'owner';
```

## 🔌 API Endpoints Principais

### Base Configuration
```typescript
// api-client.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Interceptor para adicionar token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const tenantId = localStorage.getItem('tenantId');
  if (tenantId) {
    config.headers['X-Tenant-ID'] = tenantId;
  }
  return config;
});
```

### Endpoints Disponíveis

#### Authentication
```typescript
// Registro
POST /api/auth/register
Body: {
  email: string
  password: string
  fullName: string
  companyName: string
  plan?: 'FREE' | 'STARTER' | 'PRO'
}

// Login
POST /api/auth/login
Body: {
  email: string
  password: string
}

// Conectar Amazon
POST /api/auth/connect-amazon
Body: {
  refreshToken: string  // Token do Amazon OAuth
  marketplaceIds: string[]
  region: 'na' | 'eu' | 'fe'
}
```

#### Dashboard & Metrics
```typescript
// Dashboard principal
GET /api/metrics/dashboard
Query: {
  startDate?: string  // ISO date
  endDate?: string    // ISO date
  marketplaceId?: string
  comparison?: 'previous_period' | 'previous_year'
}
Response: {
  kpis: {
    revenue: number
    orders: number
    profit: number
    margin: number
    acos: number
  }
  charts: {
    salesTrend: Array<{date, value}>
    topProducts: Array<{asin, title, sales}>
    // etc...
  }
}

// KPIs em tempo real
GET /api/metrics/kpis/realtime
Response: {
  todaySales: number
  todayOrders: number
  currentAcos: number
  lowStockCount: number
  activeAlerts: number
}
```

#### Products
```typescript
// Listar produtos
GET /api/products
Query: {
  page?: number
  limit?: number
  search?: string
  category?: string
  sortBy?: 'sales' | 'profit' | 'stock'
  sortOrder?: 'asc' | 'desc'
  filters?: {
    stockLevel?: 'low' | 'normal' | 'high'
    buyBoxStatus?: boolean
    marginMin?: number
    marginMax?: number
  }
}

// Detalhes do produto
GET /api/products/:asin
Response: {
  product: Product
  history: {
    price: Array<{date, value}>
    stock: Array<{date, value}>
    sales: Array<{date, value}>
  }
  competitors: Array<{sellerName, price}>
}

// Atualizar produto
PUT /api/products/:asin
Body: {
  // Campos editáveis pelo usuário
  minStock?: number
  targetMargin?: number
  notes?: string
}
```

#### Orders
```typescript
// Listar pedidos
GET /api/orders
Query: {
  page?: number
  limit?: number
  startDate?: string
  endDate?: string
  status?: string
  fulfillmentChannel?: 'AFN' | 'MFN'
}

// Estatísticas de pedidos
GET /api/orders/stats
Query: {
  groupBy: 'day' | 'week' | 'month'
  startDate: string
  endDate: string
}
```

#### Finance
```typescript
// Resumo financeiro
GET /api/finance/summary
Query: {
  period: 'today' | 'week' | 'month' | 'year' | 'custom'
  startDate?: string
  endDate?: string
}

// P&L detalhado
GET /api/finance/profit-loss
Query: {
  startDate: string
  endDate: string
  groupBy: 'day' | 'week' | 'month'
}
```

#### Advertising
```typescript
// Performance de campanhas
GET /api/ads/campaigns
Query: {
  profileId?: string
  startDate?: string
  endDate?: string
  sortBy?: 'spend' | 'sales' | 'acos'
}

// Otimização sugerida
GET /api/ads/recommendations
Response: {
  recommendations: Array<{
    type: 'PAUSE' | 'ADJUST_BID' | 'ADD_NEGATIVE'
    campaignId: string
    reason: string
    expectedImpact: string
  }>
}
```

#### Alerts
```typescript
// Listar alertas
GET /api/alerts
Query: {
  status?: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  type?: string
}

// Marcar como lido
PUT /api/alerts/:id/acknowledge

// Resolver alerta
PUT /api/alerts/:id/resolve
Body: {
  resolution: string
  notes?: string
}
```

#### Sync
```typescript
// Iniciar sincronização manual
POST /api/sync/manual
Body: {
  types: Array<'ORDERS' | 'INVENTORY' | 'PRICING' | 'FINANCE' | 'ADS'>
}

// Status da sincronização
GET /api/sync/status
Response: {
  lastSync: string
  nextSync: string
  status: 'IDLE' | 'RUNNING'
  progress?: number
  currentTask?: string
}
```

## 🎨 Estrutura de Dados para o Frontend

### User Context
```typescript
interface User {
  id: string
  email: string
  fullName: string
  role: 'owner' | 'admin' | 'manager' | 'analyst' | 'viewer'
  tenantId: string
  tenant: {
    name: string
    plan: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE'
    settings: TenantSettings
  }
  avatar?: string
  preferences: UserPreferences
}

interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: 'pt-BR' | 'en-US'
  timezone: string
  dateFormat: string
  currency: string
  defaultDateRange: '7d' | '30d' | '90d' | '1y'
  dashboardLayout?: DashboardLayout
}
```

### Tipos Principais
```typescript
interface Product {
  tenantId: string
  asin: string
  sku: string
  marketplaceId: string
  title: string
  imageUrl?: string
  currentPrice?: number
  buyBoxPrice?: number
  buyBoxWinner: boolean
  fbaStock: number
  fbmStock: number
  totalStock: number
  totalSales30d?: number
  totalUnits30d?: number
  avgMargin30d?: number
  isActive: boolean
}

interface Order {
  tenantId: string
  amazonOrderId: string
  purchaseDate: Date
  orderStatus: string
  orderTotal: number
  profit?: number
  margin?: number
  itemCount: number
}

interface Alert {
  id: string
  type: AlertType
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
  title: string
  message: string
  asin?: string
  createdAt: Date
}

interface BusinessMetrics {
  date: Date
  revenue: number
  netRevenue: number
  grossProfit: number
  netProfit: number
  orders: number
  units: number
  acos?: number
  tacos?: number
}
```

## 📡 WebSocket para Real-time

### Conexão WebSocket
```typescript
// Socket.IO connection
const socket = io(WEBSOCKET_URL, {
  auth: {
    token: localStorage.getItem('accessToken'),
    tenantId: localStorage.getItem('tenantId')
  }
});

// Eventos disponíveis
socket.on('sync:progress', (data) => {
  // Atualizar progresso de sincronização
});

socket.on('alert:new', (alert) => {
  // Mostrar nova notificação
});

socket.on('metrics:update', (metrics) => {
  // Atualizar dashboard em tempo real
});

socket.on('inventory:low', (product) => {
  // Alerta de estoque baixo
});
```

## 🔄 Estado Global Sugerido (Zustand/Redux)

```typescript
interface AppState {
  // Auth
  user: User | null
  isAuthenticated: boolean
  
  // Dashboard
  dashboardData: DashboardData | null
  isLoadingDashboard: boolean
  
  // Products
  products: Product[]
  selectedProduct: Product | null
  productFilters: ProductFilters
  
  // Orders
  orders: Order[]
  orderStats: OrderStats
  
  // Alerts
  alerts: Alert[]
  unreadAlertsCount: number
  
  // Sync
  syncStatus: SyncStatus
  
  // UI
  sidebarCollapsed: boolean
  theme: 'light' | 'dark'
  
  // Actions
  login: (credentials) => Promise<void>
  logout: () => void
  fetchDashboard: (params) => Promise<void>
  fetchProducts: (params) => Promise<void>
  updateProduct: (asin, data) => Promise<void>
  acknowledgeAlert: (id) => Promise<void>
  startSync: (types) => Promise<void>
}
```

## 🚦 Rate Limiting e Retry Logic

```typescript
// Implementar retry com exponential backoff
const retryRequest = async (fn, retries = 3, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    if (error.response?.status === 429) {
      // Rate limited - esperar mais
      await new Promise(r => setTimeout(r, delay * 2));
    }
    await new Promise(r => setTimeout(r, delay));
    return retryRequest(fn, retries - 1, delay * 2);
  }
};

// Headers de rate limiting do backend
// X-RateLimit-Limit: 100
// X-RateLimit-Remaining: 95
// X-RateLimit-Reset: 1640995200
```

## 🎯 Funcionalidades Prioritárias para MVP

1. **Autenticação**
   - Login/Logout
   - Refresh token automático
   - Proteção de rotas

2. **Dashboard**
   - KPIs principais
   - Gráfico de vendas
   - Alertas ativos

3. **Produtos**
   - Lista com filtros
   - Detalhes básicos
   - Indicadores de estoque

4. **Pedidos**
   - Lista paginada
   - Filtro por data

5. **Sincronização**
   - Status atual
   - Botão sync manual

## 📝 Variáveis de Ambiente Necessárias

```bash
# .env.local (Frontend)
NEXT_PUBLIC_API_URL=http://<DB_HOST>:3333/api
NEXT_PUBLIC_WEBSOCKET_URL=http://<DB_HOST>:3333
NEXT_PUBLIC_APP_NAME="Amazon SP-API Monitor"
NEXT_PUBLIC_SUPPORT_EMAIL="support@example.com"

# Opcional
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_GA_ID=
```

## 🔗 Links e Recursos

- **Documentação Prisma Schema**: `/amazon-seller-backend/prisma/schema.prisma`
- **Amazon SP-API Docs**: https://developer-docs.amazon.com/sp-api/
- **PRD Completo**: `/PRD.md`
- **Backend Repository**: `/amazon-seller-backend/`

## 💡 Dicas Importantes

1. **Multi-tenancy**: Sempre incluir `tenantId` nas requisições
2. **Timezone**: Converter datas para timezone do usuário
3. **Moeda**: Formatar valores baseado na preferência do usuário
4. **Paginação**: Usar cursor-based pagination para grandes datasets
5. **Cache**: Implementar cache local para dados que mudam pouco
6. **Optimistic Updates**: Atualizar UI antes da confirmação do servidor
7. **Error Boundaries**: Implementar error boundaries para falhas graceful

## 🤝 Contato Backend Team

Se precisar de:
- Novos endpoints
- Modificações no schema
- Ajustes na autenticação
- Otimizações de performance

Entre em contato com a equipe de backend!