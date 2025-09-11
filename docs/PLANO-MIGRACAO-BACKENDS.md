# 📋 PLANO DETALHADO DE MIGRAÇÃO E CONSOLIDAÇÃO DE BACKENDS

## 📊 RESUMO EXECUTIVO

### Situação Atual
- **7 backends** distribuídos e duplicados
- **Múltiplas versões** do mesmo serviço
- **Alto custo** de manutenção
- **Complexidade** no deployment

### Objetivo Final
- **2 serviços principais** consolidados e otimizados
  - **Backend unificado** em TypeScript
  - **lovable-frontend** como único frontend
- **Redução de 71%** na infraestrutura (de 7 para 2)
- **Deploy simplificado** e manutenção centralizada
- **Remoção do amazon-dashboard** (Next.js duplicado)

---

## 🎯 FASE 1: ANÁLISE E PREPARAÇÃO (Semana 1)

### 1.1 Mapeamento de Funcionalidades

#### **amazon-api-backend/**
```javascript
Funcionalidades:
├── Auth (JWT)
├── Dashboard API
├── Orders CRUD
├── Products CRUD
├── Metrics calculation
└── WebSocket real-time

Arquivos a migrar:
- server-with-auth.js (principal)
- routes/auth.js
- routes/dashboard.js
- routes/orders.js
- routes/products.js
```

#### **amazon-seller-backend/**
```typescript
Funcionalidades:
├── SP-API Integration
├── Ads API Integration
├── Finance reports
├── Pricing updates
├── Alert system
└── Scheduled jobs

Arquivos a migrar:
- src/services/*.ts
- src/routes/*.ts
- src/auth/*.ts
- src/jobs/scheduler.ts
```

#### **amazon-sp-api-service/**
```typescript
Funcionalidades:
├── Orders sync
├── Products sync
├── Inventory management
├── Queue processing
└── Database service

Arquivos a migrar:
- src/services/*.ts
- src/lib/sp-api-client.ts
- src/config/simple.ts
```

#### **dashboard-server.js**
```javascript
Funcionalidades:
├── Dashboard endpoints
├── Real-time updates
└── Static file serving

Pode ser REMOVIDO (funcionalidades já existem em outros)
```

### 1.2 Análise de Dependências

```json
{
  "dependencies_comuns": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "axios": "^1.6.2",
    "dotenv": "^16.3.1",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3"
  },
  "dependencies_especificas": {
    "@sp-api-sdk/common": "^2.0.0",
    "amazon-sp-api": "^1.0.0",
    "ws": "^8.14.2",
    "node-cron": "^3.0.3",
    "winston": "^3.11.0"
  }
}
```

---

## 🏗️ FASE 2: ARQUITETURA DO BACKEND UNIFICADO (Semana 2)

### 2.1 Estrutura de Diretórios

```
amazon-unified-backend/
├── src/
│   ├── config/
│   │   ├── database.ts
│   │   ├── amazon-sp-api.ts
│   │   ├── amazon-ads-api.ts
│   │   └── app.ts
│   ├── models/
│   │   ├── Order.ts
│   │   ├── Product.ts
│   │   ├── User.ts
│   │   └── Campaign.ts
│   ├── services/
│   │   ├── auth/
│   │   │   ├── jwt.service.ts
│   │   │   └── user.service.ts
│   │   ├── amazon/
│   │   │   ├── sp-api.service.ts
│   │   │   ├── ads-api.service.ts
│   │   │   └── finance.service.ts
│   │   ├── sync/
│   │   │   ├── orders.sync.ts
│   │   │   ├── products.sync.ts
│   │   │   └── campaigns.sync.ts
│   │   └── database/
│   │       ├── repository.ts
│   │       └── migrations/
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── dashboard.routes.ts
│   │   ├── orders.routes.ts
│   │   ├── products.routes.ts
│   │   ├── campaigns.routes.ts
│   │   └── admin.routes.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   └── validation.middleware.ts
│   ├── jobs/
│   │   ├── scheduler.ts
│   │   ├── sync-orders.job.ts
│   │   ├── sync-campaigns.job.ts
│   │   └── cleanup.job.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── encryption.ts
│   │   └── validators.ts
│   ├── websocket/
│   │   └── realtime.server.ts
│   └── index.ts
├── tests/
├── .env.example
├── .eslintrc.js
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── package.json
├── README.md
└── tsconfig.json
```

### 2.2 Tecnologias e Padrões

```typescript
// Stack Tecnológica
{
  "runtime": "Node.js 20+",
  "language": "TypeScript 5+",
  "framework": "Express 4",
  "database": "PostgreSQL 15",
  "orm": "Prisma ou TypeORM",
  "validation": "Joi ou Zod",
  "authentication": "JWT + Refresh Tokens",
  "documentation": "Swagger/OpenAPI",
  "testing": "Jest + Supertest",
  "logging": "Winston + Morgan",
  "monitoring": "Prometheus + Grafana"
}
```

### 2.3 Configuração Base

```typescript
// src/index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { errorHandler } from './middleware/error.middleware';
import { authRouter } from './routes/auth.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { ordersRouter } from './routes/orders.routes';
import { productsRouter } from './routes/products.routes';
import { campaignsRouter } from './routes/campaigns.routes';
import { scheduler } from './jobs/scheduler';
import { logger } from './utils/logger';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/products', productsRouter);
app.use('/api/campaigns', campaignsRouter);

// Error handling
app.use(errorHandler);

// Start scheduler
scheduler.start();

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
```

---

## 📅 FASE 3: CRONOGRAMA DE MIGRAÇÃO (Semanas 3-6)

### Semana 3: Setup e Infraestrutura
```yaml
Dia 1-2:
  - Criar repositório amazon-unified-backend
  - Setup inicial com TypeScript e Express
  - Configurar ESLint, Prettier, Jest
  - Setup Docker e docker-compose

Dia 3-4:
  - Configurar banco de dados e migrations
  - Implementar sistema de logging
  - Setup de variáveis de ambiente

Dia 5:
  - Testes da infraestrutura base
  - CI/CD pipeline básico
```

### Semana 4: Migração Core Services
```yaml
Dia 1-2:
  - Migrar serviços de autenticação
  - Migrar modelos de dados

Dia 3-4:
  - Migrar SP-API service
  - Migrar Ads API service

Dia 5:
  - Testes de integração
  - Ajustes e correções
```

### Semana 5: Migração de Rotas e Jobs
```yaml
Dia 1-2:
  - Migrar todas as rotas REST
  - Implementar validações

Dia 3-4:
  - Migrar jobs agendados
  - Implementar WebSocket server

Dia 5:
  - Testes end-to-end
  - Performance testing
```

### Semana 6: Finalização e Deploy
```yaml
Dia 1-2:
  - Migração de dados
  - Testes em ambiente staging

Dia 3-4:
  - Deploy gradual (blue-green)
  - Monitoramento intensivo

Dia 5:
  - Documentação final
  - Treinamento da equipe
```

---

## 🔄 FASE 4: PROCESSO DE MIGRAÇÃO

### 4.1 Migração de Dados

```sql
-- Script de backup antes da migração
pg_dump -h <DB_HOST> -p 5456 -U saas -d amazon_monitor > backup_pre_migration.sql

-- Validação de integridade
SELECT 
  COUNT(*) as total_orders,
  COUNT(DISTINCT seller_id) as sellers,
  COUNT(DISTINCT marketplace_id) as marketplaces
FROM orders;
```

### 4.2 Migração de Código (Exemplo)

```typescript
// ANTES (JavaScript - amazon-api-backend/routes/orders.js)
router.get('/orders', async (req, res) => {
  const orders = await db.query('SELECT * FROM orders');
  res.json(orders.rows);
});

// DEPOIS (TypeScript - amazon-unified-backend/src/routes/orders.routes.ts)
import { Request, Response } from 'express';
import { OrderService } from '../services/orders.service';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { ordersSchema } from '../schemas/orders.schema';

router.get('/orders',
  authenticate,
  validate(ordersSchema.list),
  async (req: Request, res: Response) => {
    try {
      const orders = await OrderService.findAll({
        userId: req.user.id,
        ...req.query
      });
      res.json({
        success: true,
        data: orders,
        total: orders.length
      });
    } catch (error) {
      next(error);
    }
  }
);
```

### 4.3 Estratégia de Deploy

```yaml
Deploy Strategy: Blue-Green com Rollback

1. Preparação:
   - Backend unificado em staging
   - Testes completos executados
   - Backup de dados realizado

2. Deploy Fase 1 (Shadow Mode):
   - Backend unificado rodando em paralelo
   - Duplicação de tráfego para teste
   - Monitoramento de discrepâncias

3. Deploy Fase 2 (Gradual):
   - 10% do tráfego → novo backend
   - 25% → 50% → 75% → 100%
   - Rollback automático se erros > threshold

4. Consolidação:
   - Desligar backends antigos
   - Remover código legacy
   - Atualizar documentação
```

---

## 🛡️ FASE 5: PLANO DE ROLLBACK

### 5.1 Triggers de Rollback

```javascript
const rollbackTriggers = {
  errorRate: 0.05,        // > 5% de erros
  responseTime: 2000,     // > 2s de resposta
  availability: 0.99,     // < 99% uptime
  criticalErrors: 1       // Qualquer erro crítico
};
```

### 5.2 Procedimento de Rollback

```bash
#!/bin/bash
# rollback.sh

echo "🔴 Iniciando rollback..."

# 1. Redirecionar tráfego para backend antigo
kubectl set image deployment/api api=amazon-api:previous

# 2. Verificar saúde do sistema antigo
curl -f http://api/health || exit 1

# 3. Restaurar banco se necessário
if [ "$RESTORE_DB" = "true" ]; then
  psql -h $DB_HOST -U $DB_USER -d $DB_NAME < backup_pre_migration.sql
fi

echo "✅ Rollback completo"
```

---

## 📊 FASE 6: MÉTRICAS DE SUCESSO

### KPIs da Migração

```yaml
Performance:
  - Redução de 50% no tempo de resposta
  - Redução de 70% no uso de memória
  - Aumento de 200% na capacidade de requisições

Operacional:
  - Redução de 60% no tempo de deploy
  - Redução de 80% em bugs relacionados a duplicação
  - Redução de 40% no custo de infraestrutura

Desenvolvimento:
  - Redução de 50% no tempo de desenvolvimento de features
  - Aumento de 90% na cobertura de testes
  - Redução de 70% em tempo de onboarding
```

---

## 🚦 FASE 7: CHECKLIST DE MIGRAÇÃO

### Pre-Migration Checklist
- [ ] Backup completo do banco de dados
- [ ] Documentação de todas as APIs atuais
- [ ] Inventário de todas as integrações
- [ ] Plano de comunicação com usuários
- [ ] Ambiente de staging preparado

### Migration Checklist
- [ ] Código base criado e testado
- [ ] Migrations de banco executadas
- [ ] Testes automatizados passando
- [ ] CI/CD pipeline configurado
- [ ] Monitoring e alertas configurados

### Post-Migration Checklist
- [ ] Todos os endpoints respondendo
- [ ] Performance dentro do esperado
- [ ] Logs sem erros críticos
- [ ] Backup dos sistemas antigos
- [ ] Documentação atualizada

---

## 📝 FASE 8: DOCUMENTAÇÃO E TREINAMENTO

### 8.1 Documentação Técnica

```markdown
1. README.md principal
2. API Documentation (Swagger)
3. Database Schema Documentation
4. Deployment Guide
5. Troubleshooting Guide
6. Migration Guide
```

### 8.2 Treinamento

```yaml
Semana 1:
  - Overview da nova arquitetura
  - Hands-on com o novo backend

Semana 2:
  - Deep dive nos serviços
  - Troubleshooting e monitoring
```

---

## 🎯 RESULTADO ESPERADO

### Antes da Migração
- 7 backends separados
- Múltiplas tecnologias
- Deploy complexo
- Manutenção difícil
- Alto custo

### Depois da Migração
- 1 backend unificado
- Stack única (TypeScript)
- Deploy automatizado
- Manutenção centralizada
- Custo reduzido em 40%

---

## 📞 SUPORTE E CONTATOS

- **Tech Lead**: Responsável pela arquitetura
- **DevOps**: Responsável pelo deploy
- **DBA**: Responsável pela migração de dados
- **QA**: Responsável pelos testes

---

## 🔗 ANEXOS

1. [Diagrama de Arquitetura](./diagrams/architecture.png)
2. [Fluxo de Migração](./diagrams/migration-flow.png)
3. [Scripts de Migração](./scripts/)
4. [Testes Automatizados](./tests/)

---

**Data de Início Prevista**: [A definir]
**Data de Conclusão Prevista**: 6 semanas após início
**Orçamento Estimado**: Redução de 40% nos custos mensais após migração