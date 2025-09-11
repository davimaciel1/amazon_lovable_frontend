# PRD_SERVER - Backend Requirements Document
# Amazon SP-API Monitoring SaaS - Server Architecture

## 1. Arquitetura do Sistema

### 1.1 Overview Técnico
```yaml
Stack: Node.js + TypeScript + Express
Database: PostgreSQL 15+
ORM: Prisma
Cache: Redis
Queue: BullMQ
Storage: S3/R2
Container: Docker
Deploy: Coolify/Railway
```

### 1.2 Arquitetura de Microsserviços
```
┌─────────────────────────────────────────────────┐
│                  API Gateway                     │
│                 (Express + JWT)                   │
└────────────┬────────────────────────┬────────────┘
             │                        │
    ┌────────▼────────┐      ┌───────▼────────┐
    │   Core API      │      │  Sync Service  │
    │   (REST API)    │      │  (SP-API/ADS)  │
    └────────┬────────┘      └───────┬────────┘
             │                        │
    ┌────────▼────────────────────────▼────────┐
    │           PostgreSQL Database             │
    │              (Multi-tenant)               │
    └───────────────────────────────────────────┘
             │                        │
    ┌────────▼────────┐      ┌───────▼────────┐
    │  Redis Cache    │      │   BullMQ Queue │
    └─────────────────┘      └────────────────┘
```

## 2. API REST Specification

### 2.1 Authentication Endpoints

#### POST /api/auth/register
```typescript
Request: {
  email: string
  password: string  // min 8 chars, 1 upper, 1 lower, 1 number
  fullName: string
  companyName: string
  phone?: string
  timezone?: string
  language?: string  // pt-BR, en-US
}

Response: {
  success: boolean
  user: {
    id: string
    email: string
    tenantId: string
    role: string
  }
  tokens: {
    accessToken: string   // JWT, 15 min
    refreshToken: string  // JWT, 30 days
  }
}

Errors:
- 400: Invalid input data
- 409: Email already exists
- 500: Server error
```

#### POST /api/auth/login
```typescript
Request: {
  email: string
  password: string
}

Response: {
  user: User
  tokens: Tokens
  tenant: {
    id: string
    name: string
    plan: string
    settings: TenantSettings
  }
}

Errors:
- 401: Invalid credentials
- 403: Account locked/suspended
- 429: Too many attempts
```

#### POST /api/auth/refresh
```typescript
Request: {
  refreshToken: string
}

Response: {
  accessToken: string
  refreshToken: string
}

Errors:
- 401: Invalid/expired token
```

#### POST /api/auth/connect-amazon
```typescript
Request: {
  authorizationCode: string  // OAuth code from Amazon
  redirectUri: string
  marketplaceIds: string[]
  region: 'na' | 'eu' | 'fe'
}

Response: {
  success: boolean
  credentials: {
    id: string
    type: 'SPAPI'
    marketplaceIds: string[]
    isActive: boolean
  }
}

Process:
1. Exchange auth code for refresh token
2. Encrypt and store refresh token
3. Test API connection
4. Setup initial sync
```

### 2.2 Dashboard & Metrics

#### GET /api/metrics/dashboard
```typescript
Query: {
  startDate: string  // ISO date
  endDate: string
  marketplaceId?: string
  comparison?: 'previous_period' | 'previous_year' | 'custom'
  comparisonStartDate?: string
  comparisonEndDate?: string
}

Response: {
  period: {
    current: MetricsPeriod
    previous?: MetricsPeriod
    change?: ChangeMetrics
  }
  kpis: {
    revenue: KPI
    orders: KPI
    profit: KPI
    acos: KPI
    conversion: KPI
    avgOrderValue: KPI
  }
  charts: {
    salesTrend: TimeSeriesData[]
    topProducts: ProductRanking[]
    salesByCategory: CategoryBreakdown[]
    hourlyPerformance: HourlyData[]
    geographicDistribution: GeoData[]
  }
  alerts: {
    active: Alert[]
    critical: number
    warning: number
  }
}

Cache: Redis, 5 minutes TTL
```

#### GET /api/metrics/realtime
```typescript
Response: {
  timestamp: ISO8601
  todaySales: number
  todayOrders: number
  todayUnits: number
  currentInventoryValue: number
  lowStockProducts: number
  activeAlerts: number
  syncStatus: 'idle' | 'running' | 'error'
}

WebSocket: Real-time updates via Socket.IO
Cache: Redis, 30 seconds TTL
```

### 2.3 Products Management

#### GET /api/products
```typescript
Query: {
  page: number         // default: 1
  limit: number        // default: 25, max: 100
  search?: string      // ASIN, SKU, title
  category?: string
  brand?: string
  sortBy?: 'sales' | 'profit' | 'stock' | 'margin' | 'updated'
  sortOrder?: 'asc' | 'desc'
  filters?: {
    stockLevel?: 'critical' | 'low' | 'normal' | 'high' | 'excess'
    buyBoxStatus?: 'winner' | 'lost' | 'suppressed'
    marginMin?: number
    marginMax?: number
    priceMin?: number
    priceMax?: number
    isActive?: boolean
    fulfillmentChannel?: 'FBA' | 'FBM' | 'both'
  }
}

Response: {
  data: Product[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
  aggregations: {
    totalProducts: number
    totalValue: number
    avgMargin: number
    lowStockCount: number
  }
}

Performance: 
- Index on: asin, sku, title, stockLevel
- Cursor-based pagination for >1000 items
```

#### GET /api/products/:asin
```typescript
Response: {
  product: Product
  metrics: {
    sales30d: number
    sales90d: number
    units30d: number
    velocity: number  // units/day
    daysOfStock: number
    rankHistory: RankData[]
  }
  history: {
    price: TimeSeriesData[]
    stock: TimeSeriesData[]
    sales: TimeSeriesData[]
    rank: TimeSeriesData[]
  }
  competitors: {
    count: number
    lowestPrice: number
    averagePrice: number
    sellers: CompetitorData[]
  }
  recommendations: {
    restockDate?: Date
    restockQuantity?: number
    targetPrice?: number
    warnings?: string[]
  }
}
```

#### PUT /api/products/:asin
```typescript
Request: {
  // User editable fields only
  minStockAlert?: number
  maxStock?: number
  targetMargin?: number
  notes?: string
  tags?: string[]
  customFields?: Record<string, any>
}

Response: {
  success: boolean
  product: Product
}

Validation:
- minStockAlert >= 0
- maxStock > minStockAlert
- targetMargin between 0-100
```

#### POST /api/products/bulk-update
```typescript
Request: {
  asins: string[]
  updates: {
    minStockAlert?: number
    tags?: string[]
    // etc
  }
}

Response: {
  success: boolean
  updated: number
  failed: string[]
}

Limits: Max 100 products per request
```

### 2.4 Orders & Sales

#### GET /api/orders
```typescript
Query: {
  page: number
  limit: number
  startDate: string
  endDate: string
  status?: OrderStatus[]
  fulfillmentChannel?: 'AFN' | 'MFN'
  marketplaceId?: string
  minAmount?: number
  maxAmount?: number
}

Response: {
  orders: Order[]
  pagination: Pagination
  summary: {
    totalOrders: number
    totalRevenue: number
    avgOrderValue: number
    totalUnits: number
  }
}
```

#### GET /api/orders/:amazonOrderId
```typescript
Response: {
  order: Order
  items: OrderItem[]
  customer: {
    // Hashed/anonymized data
    cityHash: string
    stateCode: string
    countryCode: string
  }
  fulfillment: {
    status: string
    trackingNumber?: string
    carrier?: string
    estimatedDelivery?: Date
  }
  financial: {
    revenue: number
    fees: FeeBreakdown
    profit: number
    margin: number
  }
}
```

#### GET /api/orders/export
```typescript
Query: {
  format: 'csv' | 'xlsx' | 'json'
  startDate: string
  endDate: string
  fields?: string[]  // Specific fields to export
}

Response: Stream (file download)

Process:
1. Queue job for large exports
2. Generate file in background
3. Send email with download link
4. Auto-delete after 24h
```

### 2.5 Finance & Accounting

#### GET /api/finance/summary
```typescript
Query: {
  period: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'
  startDate?: string
  endDate?: string
  groupBy?: 'day' | 'week' | 'month'
}

Response: {
  revenue: {
    gross: number
    net: number
    refunds: number
    trend: number  // % change
  }
  costs: {
    product: number
    amazonFees: number
    advertising: number
    shipping: number
    other: number
    total: number
  }
  profit: {
    gross: number
    net: number
    margin: number
    ebitda: number
  }
  breakdown: {
    byMarketplace: Record<string, FinancialSummary>
    byCategory: Record<string, FinancialSummary>
    byProduct: TopProductFinancials[]
  }
}
```

#### GET /api/finance/transactions
```typescript
Query: {
  type?: TransactionType[]
  startDate: string
  endDate: string
  minAmount?: number
  page: number
  limit: number
}

Response: {
  transactions: FinanceEvent[]
  pagination: Pagination
  totals: {
    credits: number
    debits: number
    net: number
  }
}
```

#### GET /api/finance/pnl
```typescript
Query: {
  startDate: string
  endDate: string
  compareWith?: 'previous_period' | 'previous_year'
}

Response: {
  current: ProfitLossStatement
  comparison?: ProfitLossStatement
  variance?: VarianceAnalysis
  recommendations: string[]
}

ProfitLossStatement: {
  revenue: LineItems
  cogs: LineItems
  grossProfit: number
  operatingExpenses: LineItems
  ebitda: number
  netIncome: number
}
```

### 2.6 Advertising Management

#### GET /api/ads/campaigns
```typescript
Query: {
  profileId?: string
  status?: 'enabled' | 'paused' | 'archived'
  type?: 'SP' | 'SB' | 'SD'
  startDate: string
  endDate: string
  sortBy?: 'spend' | 'sales' | 'acos' | 'impressions'
  page: number
  limit: number
}

Response: {
  campaigns: Campaign[]
  totals: {
    spend: number
    sales: number
    impressions: number
    clicks: number
    acos: number
    roas: number
  }
  pagination: Pagination
}
```

#### GET /api/ads/performance
```typescript
Query: {
  granularity: 'hour' | 'day' | 'week' | 'month'
  startDate: string
  endDate: string
  campaignId?: string
  adGroupId?: string
}

Response: {
  performance: TimeSeriesMetrics[]
  breakdown: {
    byCampaign: CampaignPerformance[]
    byAdGroup: AdGroupPerformance[]
    byKeyword: KeywordPerformance[]
    byProduct: ProductAdPerformance[]
  }
}
```

#### POST /api/ads/optimize
```typescript
Request: {
  campaignIds: string[]
  strategy: 'conservative' | 'balanced' | 'aggressive'
  targetAcos?: number
  budgetLimit?: number
}

Response: {
  recommendations: Optimization[]
  estimatedImpact: {
    costSavings: number
    salesIncrease: number
    acosImprovement: number
  }
  autoApply: boolean
}

Optimization: {
  type: 'pause' | 'adjust_bid' | 'add_negative' | 'change_budget'
  entityId: string
  entityType: 'campaign' | 'adGroup' | 'keyword'
  currentValue: any
  suggestedValue: any
  reason: string
}
```

### 2.7 Alerts & Notifications

#### GET /api/alerts
```typescript
Query: {
  status?: 'active' | 'acknowledged' | 'resolved'
  severity?: 'low' | 'medium' | 'high' | 'critical'
  type?: AlertType[]
  page: number
  limit: number
}

Response: {
  alerts: Alert[]
  pagination: Pagination
  summary: {
    total: number
    critical: number
    unread: number
  }
}
```

#### PUT /api/alerts/:id
```typescript
Request: {
  status?: 'acknowledged' | 'resolved'
  resolution?: string
  notes?: string
}

Response: {
  success: boolean
  alert: Alert
}

Side effects:
- Send notification to team
- Update activity log
- Trigger automation if configured
```

#### POST /api/alerts/settings
```typescript
Request: {
  rules: AlertRule[]
  channels: {
    email: boolean
    sms: boolean
    push: boolean
    slack?: SlackConfig
    webhook?: WebhookConfig
  }
  schedule: {
    quietHours?: TimeRange
    timezone: string
  }
}

AlertRule: {
  type: AlertType
  enabled: boolean
  threshold?: number
  frequency?: 'immediate' | 'hourly' | 'daily'
  severity: 'low' | 'medium' | 'high' | 'critical'
}
```

### 2.8 Sync Management

#### POST /api/sync/manual
```typescript
Request: {
  types: SyncType[]  // 'orders' | 'inventory' | 'pricing' | 'finance' | 'ads'
  priority?: 'low' | 'normal' | 'high'
  dateRange?: {
    startDate: string
    endDate: string
  }
}

Response: {
  jobId: string
  status: 'queued' | 'processing'
  estimatedTime: number  // seconds
}

Process:
1. Validate API credentials
2. Queue sync jobs
3. Return job ID for tracking
4. WebSocket updates for progress
```

#### GET /api/sync/status
```typescript
Response: {
  currentJobs: SyncJob[]
  lastSync: {
    timestamp: Date
    duration: number
    recordsProcessed: number
    errors: number
  }
  nextScheduledSync: Date
  apiHealth: {
    spapi: 'healthy' | 'degraded' | 'down'
    ads: 'healthy' | 'degraded' | 'down'
  }
  rateLimits: {
    spapi: RateLimitInfo
    ads: RateLimitInfo
  }
}
```

#### GET /api/sync/history
```typescript
Query: {
  startDate?: string
  endDate?: string
  type?: SyncType
  status?: 'success' | 'failed' | 'partial'
  page: number
  limit: number
}

Response: {
  history: SyncJob[]
  pagination: Pagination
  statistics: {
    successRate: number
    avgDuration: number
    totalRecords: number
  }
}
```

## 3. Amazon SP-API Integration

### 3.1 Authentication Flow
```typescript
class AmazonAuthService {
  async exchangeAuthCode(code: string): Promise<Tokens> {
    // 1. Exchange authorization code for refresh token
    const tokens = await axios.post('https://api.amazon.com/auth/o2/token', {
      grant_type: 'authorization_code',
      code,
      client_id: process.env.AMAZON_CLIENT_ID,
      client_secret: process.env.AMAZON_CLIENT_SECRET
    });
    
    // 2. Encrypt refresh token
    const encrypted = await encrypt(tokens.refresh_token);
    
    // 3. Store in database
    await prisma.credentials.create({
      data: {
        tenantId,
        type: 'SPAPI',
        refreshToken: encrypted,
        // ...
      }
    });
    
    return tokens;
  }
  
  async getAccessToken(tenantId: string): Promise<string> {
    // 1. Check cache
    const cached = await redis.get(`access_token:${tenantId}`);
    if (cached) return cached;
    
    // 2. Get refresh token
    const creds = await prisma.credentials.findFirst({
      where: { tenantId, type: 'SPAPI' }
    });
    
    // 3. Exchange for access token
    const response = await axios.post('https://api.amazon.com/auth/o2/token', {
      grant_type: 'refresh_token',
      refresh_token: decrypt(creds.refreshToken),
      client_id: process.env.AMAZON_CLIENT_ID,
      client_secret: process.env.AMAZON_CLIENT_SECRET
    });
    
    // 4. Cache with TTL
    await redis.setex(
      `access_token:${tenantId}`,
      3500, // Just under 1 hour
      response.data.access_token
    );
    
    return response.data.access_token;
  }
}
```

### 3.2 API Client Implementation
```typescript
class SPAPIClient {
  private rateLimiter: RateLimiter;
  
  constructor(private tenantId: string) {
    // Initialize rate limiter based on API limits
    this.rateLimiter = new RateLimiter({
      orders: { rate: 10, burst: 30 },
      inventory: { rate: 2, burst: 5 },
      products: { rate: 5, burst: 10 },
      reports: { rate: 2, burst: 5 }
    });
  }
  
  async request(endpoint: string, options: RequestOptions) {
    // 1. Rate limiting
    await this.rateLimiter.acquire(endpoint);
    
    // 2. Get access token
    const accessToken = await authService.getAccessToken(this.tenantId);
    
    // 3. Sign request (AWS Signature V4)
    const signedHeaders = this.signRequest(endpoint, accessToken);
    
    // 4. Make request with retry logic
    return await this.executeWithRetry(
      () => axios({
        url: `${SP_API_BASE_URL}${endpoint}`,
        headers: signedHeaders,
        ...options
      }),
      { maxRetries: 3, backoff: 'exponential' }
    );
  }
  
  private async executeWithRetry(fn: Function, options: RetryOptions) {
    let lastError;
    
    for (let i = 0; i < options.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['x-amzn-ratelimit-limit'];
          await sleep(retryAfter * 1000);
          continue;
        }
        
        // Handle temporary errors
        if ([500, 502, 503, 504].includes(error.response?.status)) {
          await sleep(Math.pow(2, i) * 1000); // Exponential backoff
          continue;
        }
        
        throw error; // Permanent error
      }
    }
    
    throw lastError;
  }
}
```

### 3.3 Data Sync Services

#### Orders Sync
```typescript
class OrderSyncService {
  async syncOrders(startDate: Date, endDate: Date) {
    const client = new SPAPIClient(this.tenantId);
    
    // 1. Create report request
    const reportId = await client.request('/reports', {
      method: 'POST',
      data: {
        reportType: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL',
        dataStartTime: startDate.toISOString(),
        dataEndTime: endDate.toISOString(),
        marketplaceIds: this.marketplaceIds
      }
    });
    
    // 2. Poll for report completion
    let report;
    while (true) {
      report = await client.request(`/reports/${reportId}`);
      if (report.processingStatus === 'DONE') break;
      await sleep(5000);
    }
    
    // 3. Download report
    const documentUrl = await client.request(`/reports/documents/${report.reportDocumentId}`);
    const data = await this.downloadAndParse(documentUrl);
    
    // 4. Process in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      
      await prisma.$transaction(async (tx) => {
        for (const order of batch) {
          // Upsert order
          await tx.order.upsert({
            where: {
              tenantId_amazonOrderId: {
                tenantId: this.tenantId,
                amazonOrderId: order.amazonOrderId
              }
            },
            update: this.mapOrderData(order),
            create: {
              tenantId: this.tenantId,
              ...this.mapOrderData(order)
            }
          });
          
          // Upsert order items
          for (const item of order.items) {
            await tx.orderItem.upsert({
              where: {
                tenantId_amazonOrderId_orderItemId: {
                  tenantId: this.tenantId,
                  amazonOrderId: order.amazonOrderId,
                  orderItemId: item.orderItemId
                }
              },
              update: this.mapItemData(item),
              create: {
                tenantId: this.tenantId,
                amazonOrderId: order.amazonOrderId,
                ...this.mapItemData(item)
              }
            });
          }
        }
      });
      
      // 5. Update progress
      await this.updateSyncProgress(i + batch.length, data.length);
    }
    
    // 6. Update metrics
    await this.calculateMetrics();
  }
}
```

#### Inventory Sync
```typescript
class InventorySyncService {
  async syncInventory() {
    const client = new SPAPIClient(this.tenantId);
    
    // 1. Get FBA inventory
    const fbaInventory = await client.request('/fba/inventory/v1/summaries', {
      params: {
        granularityType: 'Marketplace',
        granularityId: this.marketplaceId,
        marketplaceIds: this.marketplaceIds
      }
    });
    
    // 2. Get FBM inventory (if applicable)
    const fbmInventory = await this.getFBMInventory();
    
    // 3. Merge and update
    const inventory = this.mergeInventory(fbaInventory, fbmInventory);
    
    // 4. Batch update products
    await prisma.$transaction(async (tx) => {
      for (const item of inventory) {
        await tx.product.update({
          where: {
            tenantId_asin_marketplaceId: {
              tenantId: this.tenantId,
              asin: item.asin,
              marketplaceId: this.marketplaceId
            }
          },
          data: {
            fbaStock: item.fbaStock,
            fbmStock: item.fbmStock,
            inboundStock: item.inboundStock,
            reservedStock: item.reservedStock,
            totalStock: item.totalStock,
            lastSyncAt: new Date()
          }
        });
        
        // Save history
        await tx.inventoryHistory.create({
          data: {
            tenantId: this.tenantId,
            asin: item.asin,
            marketplaceId: this.marketplaceId,
            date: new Date(),
            ...item
          }
        });
      }
    });
    
    // 5. Check for low stock alerts
    await this.checkLowStockAlerts(inventory);
  }
  
  private async checkLowStockAlerts(inventory: any[]) {
    for (const item of inventory) {
      const product = await prisma.product.findUnique({
        where: {
          tenantId_asin_marketplaceId: {
            tenantId: this.tenantId,
            asin: item.asin,
            marketplaceId: this.marketplaceId
          }
        }
      });
      
      if (product?.minStockAlert && item.totalStock < product.minStockAlert) {
        await alertService.create({
          tenantId: this.tenantId,
          type: 'STOCK_LOW',
          severity: item.totalStock === 0 ? 'CRITICAL' : 'HIGH',
          title: `Low stock alert for ${product.title}`,
          message: `Only ${item.totalStock} units remaining`,
          asin: item.asin
        });
      }
    }
  }
}
```

## 4. Queue System (BullMQ)

### 4.1 Queue Configuration
```typescript
// queues.config.ts
export const queues = {
  sync: new Queue('sync', {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    }
  }),
  
  reports: new Queue('reports', {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 100,
      timeout: 30 * 60 * 1000 // 30 minutes
    }
  }),
  
  alerts: new Queue('alerts', {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: 1000,
      attempts: 5
    }
  }),
  
  email: new Queue('email', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'fixed',
        delay: 5000
      }
    }
  })
};
```

### 4.2 Workers Implementation
```typescript
// workers/sync.worker.ts
export class SyncWorker {
  constructor() {
    const worker = new Worker('sync', async (job) => {
      const { type, tenantId, params } = job.data;
      
      try {
        // Update job progress
        await job.updateProgress(0);
        
        switch (type) {
          case 'ORDERS':
            await this.syncOrders(tenantId, params);
            break;
          case 'INVENTORY':
            await this.syncInventory(tenantId, params);
            break;
          case 'PRICING':
            await this.syncPricing(tenantId, params);
            break;
          case 'FINANCE':
            await this.syncFinance(tenantId, params);
            break;
          case 'ADS':
            await this.syncAds(tenantId, params);
            break;
        }
        
        await job.updateProgress(100);
        
        // Log success
        await this.logSyncJob(tenantId, type, 'SUCCESS');
        
      } catch (error) {
        // Log failure
        await this.logSyncJob(tenantId, type, 'FAILED', error);
        throw error;
      }
    }, {
      connection: redisConnection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 60000 // 10 jobs per minute
      }
    });
    
    // Event handlers
    worker.on('completed', (job) => {
      logger.info(`Job ${job.id} completed`);
      websocket.emit(`sync:complete:${job.data.tenantId}`, job.returnvalue);
    });
    
    worker.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed:`, err);
      websocket.emit(`sync:failed:${job.data.tenantId}`, err.message);
    });
    
    worker.on('progress', (job, progress) => {
      websocket.emit(`sync:progress:${job.data.tenantId}`, progress);
    });
  }
}
```

### 4.3 Scheduler (Cron Jobs)
```typescript
// scheduler/sync.scheduler.ts
export class SyncScheduler {
  private scheduler: Agenda;
  
  constructor() {
    this.scheduler = new Agenda({
      db: { address: process.env.DATABASE_URL },
      processEvery: '1 minute'
    });
    
    this.defineJobs();
  }
  
  private defineJobs() {
    // Hourly sync for PRO plans
    this.scheduler.define('sync:hourly', async (job) => {
      const tenants = await prisma.tenant.findMany({
        where: {
          plan: { in: ['PRO', 'ENTERPRISE'] },
          isActive: true
        }
      });
      
      for (const tenant of tenants) {
        await queues.sync.add('sync:all', {
          tenantId: tenant.id,
          types: ['ORDERS', 'INVENTORY', 'PRICING']
        });
      }
    });
    
    // Daily sync for STARTER plans
    this.scheduler.define('sync:daily', async (job) => {
      const tenants = await prisma.tenant.findMany({
        where: {
          plan: 'STARTER',
          isActive: true
        }
      });
      
      for (const tenant of tenants) {
        await queues.sync.add('sync:all', {
          tenantId: tenant.id,
          types: ['ORDERS', 'INVENTORY', 'PRICING', 'FINANCE']
        });
      }
    });
    
    // Weekly metrics calculation
    this.scheduler.define('calculate:weekly-metrics', async (job) => {
      const tenants = await prisma.tenant.findMany({
        where: { isActive: true }
      });
      
      for (const tenant of tenants) {
        await this.calculateWeeklyMetrics(tenant.id);
      }
    });
  }
  
  async start() {
    await this.scheduler.start();
    
    // Schedule recurring jobs
    await this.scheduler.every('1 hour', 'sync:hourly');
    await this.scheduler.every('1 day', 'sync:daily', { hour: 2 }); // 2 AM
    await this.scheduler.every('1 week', 'calculate:weekly-metrics');
    
    logger.info('Scheduler started');
  }
}
```

## 5. Security & Middleware

### 5.1 Authentication Middleware
```typescript
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw new UnauthorizedError('No token provided');
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    
    // Check if user exists and is active
    const user = await prisma.profile.findUnique({
      where: { id: decoded.userId },
      include: {
        tenant: true,
        role: {
          include: {
            permissions: true
          }
        }
      }
    });
    
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }
    
    if (!user.tenant.isActive) {
      throw new ForbiddenError('Tenant account is suspended');
    }
    
    // Attach to request
    req.user = user;
    req.tenantId = user.tenantId;
    req.permissions = user.role.permissions;
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
    } else {
      next(error);
    }
  }
};
```

### 5.2 Authorization Middleware
```typescript
export const authorize = (...requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userPermissions = req.permissions?.map(p => p.id) || [];
    
    const hasPermission = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );
    
    if (!hasPermission) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: requiredPermissions,
        current: userPermissions
      });
    }
    
    next();
  };
};

// Usage example:
router.get('/api/finance/export', 
  authenticate, 
  authorize('finance.view', 'finance.export'),
  financeController.export
);
```

### 5.3 Rate Limiting
```typescript
export const rateLimiter = {
  api: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: req.rateLimit.resetTime
      });
    }
  }),
  
  auth: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Strict for auth endpoints
    skipSuccessfulRequests: true
  }),
  
  sync: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    skip: (req) => req.user?.tenant.plan === 'ENTERPRISE'
  })
};
```

### 5.4 Input Validation
```typescript
// Using Zod for validation
export const validators = {
  register: z.object({
    email: z.string().email(),
    password: z.string()
      .min(8)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
    fullName: z.string().min(2).max(100),
    companyName: z.string().min(2).max(100),
    phone: z.string().optional(),
    timezone: z.string().optional(),
    language: z.enum(['pt-BR', 'en-US']).optional()
  }),
  
  productUpdate: z.object({
    minStockAlert: z.number().min(0).optional(),
    maxStock: z.number().positive().optional(),
    targetMargin: z.number().min(0).max(100).optional(),
    notes: z.string().max(500).optional(),
    tags: z.array(z.string()).max(10).optional()
  }),
  
  dateRange: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime()
  }).refine(data => new Date(data.endDate) > new Date(data.startDate), {
    message: 'End date must be after start date'
  })
};

export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
      } else {
        next(error);
      }
    }
  };
};
```

## 6. Performance Optimization

### 6.1 Database Optimization
```sql
-- Indexes for common queries
CREATE INDEX idx_orders_tenant_date ON orders(tenant_id, purchase_date DESC);
CREATE INDEX idx_products_tenant_active ON products(tenant_id, is_active);
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('english', title || ' ' || asin || ' ' || sku));
CREATE INDEX idx_finance_events_date ON finance_events(tenant_id, event_date DESC);
CREATE INDEX idx_alerts_tenant_status ON alerts(tenant_id, status, created_at DESC);

-- Partitioning for large tables
CREATE TABLE orders_2024_q1 PARTITION OF orders
FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

CREATE TABLE orders_2024_q2 PARTITION OF orders
FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');

-- Materialized views for dashboards
CREATE MATERIALIZED VIEW dashboard_kpis AS
SELECT 
  tenant_id,
  DATE(purchase_date) as date,
  COUNT(*) as order_count,
  SUM(order_total) as revenue,
  SUM(profit) as profit,
  AVG(margin) as avg_margin
FROM orders
WHERE purchase_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY tenant_id, DATE(purchase_date);

-- Refresh materialized views
CREATE OR REPLACE FUNCTION refresh_dashboard_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_kpis;
  REFRESH MATERIALIZED VIEW CONCURRENTLY product_rankings;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh
SELECT cron.schedule('refresh-views', '*/15 * * * *', 'SELECT refresh_dashboard_views()');
```

### 6.2 Caching Strategy
```typescript
export class CacheService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3
    });
  }
  
  // Cache patterns
  async getOrSet<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    ttl: number = 300
  ): Promise<T> {
    // Try cache first
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fetch and cache
    const data = await fetcher();
    await this.redis.setex(key, ttl, JSON.stringify(data));
    
    return data;
  }
  
  // Cache invalidation
  async invalidate(pattern: string) {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
  
  // Cache warming
  async warmCache(tenantId: string) {
    // Pre-load frequently accessed data
    const promises = [
      this.warmDashboard(tenantId),
      this.warmProducts(tenantId),
      this.warmAlerts(tenantId)
    ];
    
    await Promise.all(promises);
  }
  
  private async warmDashboard(tenantId: string) {
    const key = `dashboard:${tenantId}`;
    const data = await dashboardService.calculate(tenantId);
    await this.redis.setex(key, 300, JSON.stringify(data));
  }
}
```

### 6.3 Query Optimization
```typescript
export class QueryOptimizer {
  // Use cursor-based pagination for large datasets
  async paginateWithCursor<T>(
    model: any,
    options: {
      where?: any;
      orderBy?: any;
      take?: number;
      cursor?: string;
    }
  ): Promise<PaginatedResult<T>> {
    const take = options.take || 25;
    
    const query: any = {
      where: options.where,
      orderBy: options.orderBy || { createdAt: 'desc' },
      take: take + 1 // Get one extra to check if there's more
    };
    
    if (options.cursor) {
      query.cursor = { id: options.cursor };
      query.skip = 1; // Skip the cursor item
    }
    
    const items = await model.findMany(query);
    
    const hasMore = items.length > take;
    const edges = hasMore ? items.slice(0, -1) : items;
    
    return {
      edges,
      pageInfo: {
        hasNextPage: hasMore,
        endCursor: edges[edges.length - 1]?.id
      }
    };
  }
  
  // Batch loading to avoid N+1 queries
  async batchLoad<T>(
    ids: string[],
    loader: (ids: string[]) => Promise<T[]>
  ): Promise<Map<string, T>> {
    const items = await loader(ids);
    return new Map(items.map(item => [item.id, item]));
  }
  
  // Aggregate queries with window functions
  async getProductMetrics(tenantId: string, days: number = 30) {
    return await prisma.$queryRaw`
      WITH daily_sales AS (
        SELECT 
          p.asin,
          DATE(o.purchase_date) as date,
          SUM(oi.quantity) as units,
          SUM(oi.item_price) as revenue
        FROM products p
        JOIN order_items oi ON p.asin = oi.asin
        JOIN orders o ON oi.amazon_order_id = o.amazon_order_id
        WHERE p.tenant_id = ${tenantId}
          AND o.purchase_date >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY p.asin, DATE(o.purchase_date)
      ),
      ranked_products AS (
        SELECT 
          asin,
          SUM(units) as total_units,
          SUM(revenue) as total_revenue,
          AVG(units) as avg_daily_units,
          ROW_NUMBER() OVER (ORDER BY SUM(revenue) DESC) as rank
        FROM daily_sales
        GROUP BY asin
      )
      SELECT * FROM ranked_products
      ORDER BY rank
      LIMIT 100
    `;
  }
}
```

## 7. Error Handling & Logging

### 7.1 Error Classes
```typescript
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public isOperational: boolean = true
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, true);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, true);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, true);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds`, 429, true);
  }
}

export class AmazonAPIError extends AppError {
  constructor(
    message: string,
    public amazonErrorCode?: string,
    public retryAfter?: number
  ) {
    super(message, 503, true);
  }
}
```

### 7.2 Global Error Handler
```typescript
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error
  logger.error({
    error: err,
    request: {
      method: req.method,
      url: req.url,
      params: req.params,
      query: req.query,
      user: req.user?.id
    }
  });
  
  // Handle known errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }
  
  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Duplicate entry',
        field: err.meta?.target
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Record not found'
      });
    }
  }
  
  // Handle validation errors
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors
    });
  }
  
  // Default error
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { 
      message: err.message,
      stack: err.stack 
    })
  });
};
```

### 7.3 Logging Service
```typescript
import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'amazon-sp-api',
    environment: process.env.NODE_ENV
  },
  transports: [
    // Console for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File for production
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5
    }),
    
    // Elasticsearch for analysis
    new ElasticsearchTransport({
      level: 'info',
      clientOpts: {
        node: process.env.ELASTICSEARCH_URL
      },
      index: 'logs-amazon-api'
    })
  ]
});

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      userId: req.user?.id,
      tenantId: req.tenantId,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  
  next();
};
```

## 8. Testing Strategy

### 8.1 Unit Tests
```typescript
// tests/services/product.service.test.ts
describe('ProductService', () => {
  let service: ProductService;
  
  beforeEach(() => {
    service = new ProductService();
  });
  
  describe('calculateMetrics', () => {
    it('should calculate 30-day metrics correctly', async () => {
      // Mock data
      const mockOrders = [
        { date: '2024-01-01', units: 10, revenue: 100 },
        { date: '2024-01-02', units: 15, revenue: 150 }
      ];
      
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue(mockOrders);
      
      const result = await service.calculateMetrics('ASIN123', 30);
      
      expect(result).toEqual({
        totalUnits: 25,
        totalRevenue: 250,
        avgDailyUnits: 0.83,
        velocity: 0.83
      });
    });
  });
});
```

### 8.2 Integration Tests
```typescript
// tests/integration/auth.test.ts
describe('Auth Endpoints', () => {
  describe('POST /api/auth/register', () => {
    it('should create a new user and tenant', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Test123!@#',
          fullName: 'Test User',
          companyName: 'Test Company'
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.user.email).toBe('test@example.com');
      
      // Verify in database
      const user = await prisma.profile.findUnique({
        where: { email: 'test@example.com' }
      });
      expect(user).toBeTruthy();
    });
    
    it('should reject duplicate emails', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(validUserData);
      
      // Duplicate attempt
      const response = await request(app)
        .post('/api/auth/register')
        .send(validUserData);
      
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });
});
```

### 8.3 E2E Tests
```typescript
// tests/e2e/sync-flow.test.ts
describe('Complete Sync Flow', () => {
  it('should sync orders from Amazon to database', async () => {
    // 1. Setup: Create tenant with credentials
    const tenant = await createTestTenant();
    await createTestCredentials(tenant.id);
    
    // 2. Mock Amazon API responses
    nock('https://sellingpartnerapi-na.amazon.com')
      .post('/reports/2021-06-30/reports')
      .reply(200, { reportId: 'REPORT123' });
    
    nock('https://sellingpartnerapi-na.amazon.com')
      .get('/reports/2021-06-30/reports/REPORT123')
      .reply(200, {
        processingStatus: 'DONE',
        reportDocumentId: 'DOC123'
      });
    
    // 3. Trigger sync
    const response = await request(app)
      .post('/api/sync/manual')
      .set('Authorization', `Bearer ${getTestToken(tenant.id)}`)
      .send({ types: ['ORDERS'] });
    
    expect(response.status).toBe(202);
    
    // 4. Wait for job completion
    await waitForJob(response.body.jobId);
    
    // 5. Verify data in database
    const orders = await prisma.order.findMany({
      where: { tenantId: tenant.id }
    });
    
    expect(orders).toHaveLength(10);
    expect(orders[0]).toHaveProperty('amazonOrderId');
  });
});
```

## 9. Deployment Configuration

### 9.1 Docker Configuration
```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production

# Build application
COPY . .
RUN npm run build
RUN npx prisma generate

# Production image
FROM node:18-alpine

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3333

CMD ["npm", "run", "start:prod"]
```

### 9.2 Environment Configuration
```env
# .env.production
NODE_ENV=production
PORT=3333

# Database
DATABASE_URL=postgresql://saas:<DB_PASSWORD>@<DB_HOST>:5456/amazon_monitor?schema=public

# Redis
REDIS_HOST=<DB_HOST>
REDIS_PORT=6379
REDIS_PASSWORD=redis_password

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-token-secret-min-32-chars

# Amazon SP-API
AMAZON_CLIENT_ID=amzn1.application-oa2-client.xxxxx
AMAZON_CLIENT_SECRET=xxxxx
SP_API_BASE_URL=https://sellingpartnerapi-na.amazon.com

# Amazon ADS API
ADS_CLIENT_ID=amzn1.application-oa2-client.yyyyy
ADS_CLIENT_SECRET=yyyyy
ADS_API_BASE_URL=https://advertising-api.amazon.com

# AWS (for request signing)
AWS_ACCESS_KEY_ID=<AMAZON_SELLER_ID>
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxx

# Storage (S3 or R2)
STORAGE_ENDPOINT=https://xxxxx.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY=xxxxx
STORAGE_SECRET_KEY=yyyyy
STORAGE_BUCKET=amazon-saas

# Monitoring
SENTRY_DSN=https://xxxxx@sentry.io/yyyyy
ELASTICSEARCH_URL=http://localhost:9200
NEW_RELIC_LICENSE_KEY=xxxxx

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 9.3 Monitoring & Health Checks
```typescript
// health.controller.ts
export class HealthController {
  async check(req: Request, res: Response) {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkAmazonAPI(),
      this.checkStorage()
    ]);
    
    const status = checks.every(c => c.status === 'fulfilled') 
      ? 'healthy' 
      : 'degraded';
    
    res.status(status === 'healthy' ? 200 : 503).json({
      status,
      version: process.env.npm_package_version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database: checks[0].status === 'fulfilled' ? 'ok' : 'error',
        redis: checks[1].status === 'fulfilled' ? 'ok' : 'error',
        amazonAPI: checks[2].status === 'fulfilled' ? 'ok' : 'error',
        storage: checks[3].status === 'fulfilled' ? 'ok' : 'error'
      }
    });
  }
  
  private async checkDatabase() {
    await prisma.$queryRaw`SELECT 1`;
  }
  
  private async checkRedis() {
    await redis.ping();
  }
  
  private async checkAmazonAPI() {
    // Check if we can get tokens
    const tenant = await prisma.tenant.findFirst();
    if (tenant) {
      await authService.getAccessToken(tenant.id);
    }
  }
  
  private async checkStorage() {
    await s3.headBucket({ Bucket: process.env.STORAGE_BUCKET }).promise();
  }
}
```

## 10. Performance Requirements

### 10.1 Response Time SLAs
- **Authentication**: <200ms p95
- **Dashboard**: <500ms p95
- **Product List**: <300ms p95
- **Report Generation**: <30s for 10K records
- **Sync Operations**: <5min for daily data

### 10.2 Throughput Requirements
- **Concurrent Users**: 1000
- **Requests/sec**: 100
- **Database Connections**: 50 pool size
- **Queue Processing**: 1000 jobs/minute

### 10.3 Availability Requirements
- **Uptime SLA**: 99.9% (43.2 minutes/month)
- **RTO**: 1 hour
- **RPO**: 1 hour
- **Backup Frequency**: Every 6 hours
- **Backup Retention**: 30 days

---
*Documento mantido por: Backend Team*
*Última atualização: Dezembro 2024*
*Versão: 1.0*