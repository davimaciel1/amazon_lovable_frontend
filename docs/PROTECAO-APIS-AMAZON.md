# 🔒 PROTEÇÃO DAS APIS AMAZON - MIGRAÇÃO SEGURA

## ⚠️ CRÍTICO: INTEGRAÇÕES QUE NÃO PODEM SER QUEBRADAS

### 📊 BANCO DE DADOS ÚNICO (PRODUÇÃO)
```javascript
// CONFIGURAÇÃO IMUTÁVEL - NÃO ALTERAR
const DB_CONFIG = {
  host: '<DB_HOST>',
  port: 5456,
  database: 'amazon_monitor',
  user: 'saas',
  password: '<DB_PASSWORD>'
};
```

---

## 🛡️ APIs AMAZON EM FUNCIONAMENTO

### 1. AMAZON SP-API (Selling Partner API)
**Status**: ✅ FUNCIONANDO
**Localização**: `amazon-sp-api-service/`

#### Funcionalidades Críticas
```typescript
// PRESERVE ESTAS INTEGRAÇÕES
├── Orders Sync
│   ├── getOrders()           // Busca pedidos
│   ├── getOrderItems()        // Busca itens dos pedidos
│   └── getOrderAddress()      // Busca endereços
├── Products Sync
│   ├── getCatalogItem()       // Informações de produtos
│   ├── getProductPricing()    // Preços
│   └── getInventorySummaries() // Estoque
├── Finance Reports
│   ├── getFinancialEvents()   // Eventos financeiros
│   └── getSettlementReport()  // Relatórios de liquidação
```

#### Credenciais SP-API (NÃO PERDER!)
```typescript
// amazon-sp-api-service/.env
SP_API_CLIENT_ID=amzn1.application-oa2-client.ed333d81a7d34ff1b84982ff1962acb9
SP_API_CLIENT_SECRET=<AMAZON_OAUTH_SECRET>
SP_API_REFRESH_TOKEN=[ATIVO - NÃO COMPARTILHAR]
AMAZON_SELLER_ID=<AMAZON_SELLER_ID>
```

#### Jobs de Sincronização Ativos
```javascript
// MANTER ESTES JOBS RODANDO
- sync-orders.ts       // A cada 15 minutos
- sync-products.ts     // A cada 1 hora
- sync-inventory.ts    // A cada 30 minutos
- sync-finance.ts      // Diário
```

### 2. AMAZON ADVERTISING API
**Status**: ✅ TOKENS VÁLIDOS (mas sem campanhas ativas)
**Localização**: `amazon-advertising-api.js`

#### Funcionalidades
```javascript
// PRESERVE ESTAS INTEGRAÇÕES
├── Campaigns
│   ├── getCampaigns()
│   └── getCampaignMetrics()
├── Ad Groups
│   ├── getAdGroups()
│   └── getAdGroupMetrics()
├── Reports
│   ├── requestReport()
│   ├── getReportStatus()
│   └── downloadReport()
├── Metrics
│   ├── calculateACOS()  // (Ad Spend / Sales) * 100
│   └── calculateTACOS() // (Total Ad Spend / Total Sales) * 100
```

#### Credenciais Ads API (NÃO PERDER!)
```javascript
// amazon-ads-tokens.json
{
  "client_id": "amzn1.application-oa2-client.18254efcd1ef40ecb7f0e54c979c479f",
  "client_secret": "<AMAZON_OAUTH_SECRET>",
  "refresh_token": "Atzr|IwEBIGSC67QmdrSWEhWYYKzbUbRQcdHGNJol9lNnCWoTz5pFA0kv9YP-AH5fxT0kpMJJsntnrHz5Uws_Ckq9FMzr2OB_VV3zIhVMB0QTlVmfN4WrwPtlo2ii7HDrWsVfD0rF_goiL4mASlDS1rWk79l0nLrIDC-Y4rMffnsMGGZ1tWZJN5CrjrCH7dj_hRYTkLaXyCweeIIFNqhBJeX_06nL6ommJRfd_Mqnl41_g_jq-w9CjozqakbO0M5ZfRWW9dncp2KU-1ufktvkMimcwf92L_1zPermPoOX3g8UzFySwVHSWkOVbskfJZ7I7WKgcWRYTG-AXvHbyDK6Sz7AhksSVmgd9PKYmdY_Lk_ykQWIBYpYlMZob8masaY0yul1nmVe4VQKhTb-NuWufODPxYLFb9a4d2ttg4WCYn98X3UKSb9nsIFkseMsqQPWvG2wutjlvL44WKw7n0wSbXe-XZyvy3c4CAb2-hrQJ0AcVG6JGhekyQBkD4uOHkJ0OPZVhPrpJSjTEiWSKjGt2sPdkQt9iFBthkw46dWEV0YzYd0-nPEYCw",
  "security_profile_id": "amzn1.application.71b8e1ef75a945c8bfb1f5b4b6873841"
}
```

---

## 📦 PLANO DE MIGRAÇÃO SEGURA

### FASE 1: BACKUP E DOCUMENTAÇÃO
```bash
# 1. Backup completo do banco
pg_dump -h <DB_HOST> -p 5456 -U saas -d amazon_monitor > backup_$(date +%Y%m%d).sql

# 2. Backup de todas as credenciais
cp -r amazon-sp-api-service/.env backup/sp-api.env
cp amazon-ads-tokens.json backup/ads-tokens.json

# 3. Documentar todos os endpoints em uso
grep -r "await.*query\|INSERT\|UPDATE\|SELECT" --include="*.js" --include="*.ts" > database_operations.txt
```

### FASE 2: MIGRAÇÃO DO CÓDIGO (SEM QUEBRAR NADA)

#### Novo Backend Unificado - Estrutura de Serviços Amazon
```typescript
// amazon-unified-backend/src/services/amazon/

├── sp-api/
│   ├── sp-api.service.ts      // Core SP-API client
│   ├── orders.sync.ts         // Sincronização de pedidos
│   ├── products.sync.ts       // Sincronização de produtos
│   ├── inventory.sync.ts      // Sincronização de estoque
│   └── finance.sync.ts        // Relatórios financeiros
│
├── ads-api/
│   ├── ads-api.service.ts     // Core Ads API client
│   ├── campaigns.sync.ts      // Sincronização de campanhas
│   ├── metrics.service.ts     // ACOS/TACOS calculations
│   └── token-manager.ts       // Gerenciamento de tokens
│
└── database/
    ├── connection.ts           // Conexão única com PostgreSQL
    └── repositories/
        ├── orders.repository.ts
        ├── products.repository.ts
        ├── campaigns.repository.ts
        └── metrics.repository.ts
```

#### Preservar Lógica de Sincronização
```typescript
// amazon-unified-backend/src/services/amazon/sp-api/orders.sync.ts

import { Pool } from 'pg';
import { SellingPartnerAPI } from '@sp-api-sdk/common';

// MANTER A MESMA CONFIGURAÇÃO DO BANCO
const pool = new Pool({
  host: '<DB_HOST>',
  port: 5456,
  database: 'amazon_monitor',
  user: 'saas',
  password: '<DB_PASSWORD>'
});

export class OrdersSyncService {
  private spApi: SellingPartnerAPI;
  
  constructor() {
    // USAR AS MESMAS CREDENCIAIS
    this.spApi = new SellingPartnerAPI({
      region: 'na',
      credentials: {
        clientId: process.env.SP_API_CLIENT_ID,
        clientSecret: process.env.SP_API_CLIENT_SECRET,
        refreshToken: process.env.SP_API_REFRESH_TOKEN,
        sellerId: process.env.AMAZON_SELLER_ID
      }
    });
  }

  async syncOrders() {
    try {
      // MANTER A MESMA LÓGICA DE SINCRONIZAÇÃO
      const lastSync = await this.getLastSyncDate();
      const orders = await this.spApi.getOrders({
        CreatedAfter: lastSync,
        MarketplaceIds: ['ATVPDKIKX0DER'] // US Marketplace
      });

      for (const order of orders) {
        // USAR AS MESMAS QUERIES SQL
        await pool.query(`
          INSERT INTO orders (
            amazon_order_id, purchase_date, order_status,
            order_total, marketplace_id, buyer_email,
            seller_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          ON CONFLICT (amazon_order_id) 
          DO UPDATE SET 
            order_status = EXCLUDED.order_status,
            updated_at = NOW()
        `, [
          order.AmazonOrderId,
          order.PurchaseDate,
          order.OrderStatus,
          order.OrderTotal?.Amount,
          order.MarketplaceId,
          order.BuyerEmail,
          process.env.AMAZON_SELLER_ID
        ]);

        // Sincronizar itens do pedido
        await this.syncOrderItems(order.AmazonOrderId);
      }

      await this.updateLastSyncDate();
      console.log(`✅ Sincronizados ${orders.length} pedidos`);
      
    } catch (error) {
      console.error('❌ Erro na sincronização:', error);
      // NÃO QUEBRAR O PROCESSO - CONTINUAR COM PRÓXIMA SYNC
    }
  }

  async syncOrderItems(orderId: string) {
    const items = await this.spApi.getOrderItems(orderId);
    
    for (const item of items) {
      await pool.query(`
        INSERT INTO order_items (
          order_id, asin, seller_sku, title,
          quantity_ordered, quantity_shipped,
          item_price, item_tax, shipping_price,
          shipping_tax, promotion_discount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (order_id, asin) DO UPDATE SET
          quantity_shipped = EXCLUDED.quantity_shipped
      `, [
        orderId,
        item.ASIN,
        item.SellerSKU,
        item.Title,
        item.QuantityOrdered,
        item.QuantityShipped,
        item.ItemPrice?.Amount,
        item.ItemTax?.Amount,
        item.ShippingPrice?.Amount,
        item.ShippingTax?.Amount,
        item.PromotionDiscount?.Amount
      ]);
    }
  }
}
```

### FASE 3: JOBS AGENDADOS (MANTER FUNCIONANDO)

```typescript
// amazon-unified-backend/src/jobs/scheduler.ts

import cron from 'node-cron';
import { OrdersSyncService } from '../services/amazon/sp-api/orders.sync';
import { ProductsSyncService } from '../services/amazon/sp-api/products.sync';
import { InventorySyncService } from '../services/amazon/sp-api/inventory.sync';
import { CampaignsSyncService } from '../services/amazon/ads-api/campaigns.sync';

export class Scheduler {
  private orderSync = new OrdersSyncService();
  private productSync = new ProductsSyncService();
  private inventorySync = new InventorySyncService();
  private campaignSync = new CampaignsSyncService();

  start() {
    // MANTER OS MESMOS INTERVALOS
    
    // Sincronizar pedidos a cada 15 minutos
    cron.schedule('*/15 * * * *', async () => {
      console.log('🔄 Sincronizando pedidos...');
      await this.orderSync.syncOrders();
    });

    // Sincronizar produtos a cada 1 hora
    cron.schedule('0 * * * *', async () => {
      console.log('🔄 Sincronizando produtos...');
      await this.productSync.syncProducts();
    });

    // Sincronizar estoque a cada 30 minutos
    cron.schedule('*/30 * * * *', async () => {
      console.log('🔄 Sincronizando estoque...');
      await this.inventorySync.syncInventory();
    });

    // Sincronizar campanhas diariamente às 2AM
    cron.schedule('0 2 * * *', async () => {
      console.log('🔄 Sincronizando campanhas publicitárias...');
      await this.campaignSync.syncCampaigns();
    });

    console.log('✅ Scheduler iniciado - Todas as sincronizações ativas');
  }
}
```

---

## 🧪 TESTES DE VALIDAÇÃO

### Teste 1: Verificar Conexão com Banco
```javascript
// test-database-connection.js
const { Client } = require('pg');

const client = new Client({
  host: '<DB_HOST>',
  port: 5456,
  database: 'amazon_monitor',
  user: 'saas',
  password: '<DB_PASSWORD>'
});

async function test() {
  await client.connect();
  const result = await client.query('SELECT COUNT(*) FROM orders');
  console.log('Total orders:', result.rows[0].count);
  await client.end();
}

test();
```

### Teste 2: Verificar SP-API
```javascript
// test-sp-api.js
const { SellingPartnerAPI } = require('@sp-api-sdk/common');

async function test() {
  const api = new SellingPartnerAPI({
    credentials: {
      clientId: process.env.SP_API_CLIENT_ID,
      clientSecret: process.env.SP_API_CLIENT_SECRET,
      refreshToken: process.env.SP_API_REFRESH_TOKEN
    }
  });
  
  const orders = await api.getOrders({ 
    CreatedAfter: new Date(Date.now() - 24*60*60*1000) 
  });
  
  console.log('Orders found:', orders.length);
}

test();
```

### Teste 3: Verificar Ads API
```javascript
// test-ads-api.js
const axios = require('axios');
const tokens = require('./amazon-ads-tokens.json');

async function test() {
  const response = await axios.get(
    'https://advertising-api.amazon.com/v2/profiles',
    {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Amazon-Advertising-API-ClientId': tokens.client_id
      }
    }
  );
  
  console.log('Profiles found:', response.data.length);
}

test();
```

---

## ⛔ CHECKLIST DE SEGURANÇA

### Antes da Migração
- [ ] Backup completo do banco de dados
- [ ] Backup de todas as credenciais e tokens
- [ ] Documentar todas as queries SQL em uso
- [ ] Testar conexões com APIs Amazon
- [ ] Verificar jobs de sincronização ativos

### Durante a Migração
- [ ] NÃO alterar estrutura do banco de dados
- [ ] NÃO modificar credenciais
- [ ] MANTER mesmos intervalos de sincronização
- [ ] PRESERVAR toda lógica de upsert/conflict
- [ ] TESTAR cada serviço migrado individualmente

### Após a Migração
- [ ] Verificar se pedidos continuam sendo sincronizados
- [ ] Confirmar atualização de produtos
- [ ] Validar cálculos de ACOS/TACOS
- [ ] Monitorar logs por 48 horas
- [ ] Ter plano de rollback pronto

---

## 🚨 PLANO DE EMERGÊNCIA

### Se algo quebrar:
```bash
# 1. Parar novo backend
systemctl stop amazon-unified-backend

# 2. Voltar backend antigo
cd amazon-sp-api-service
npm start

# 3. Verificar sincronizações
node check-sync-status.js

# 4. Se necessário, restaurar backup
psql -h <DB_HOST> -p 5456 -U saas -d amazon_monitor < backup.sql
```

---

## 📞 CONTATOS CRÍTICOS

- **DBA**: Responsável pelo banco PostgreSQL
- **DevOps**: Deploy e rollback
- **Amazon API Support**: Em caso de bloqueio de API

---

**⚠️ IMPORTANTE**: Este documento deve ser seguido RIGOROSAMENTE durante a migração. Qualquer desvio pode resultar em perda de dados ou quebra das integrações com Amazon.