# 🚀 PLANO DE MIGRAÇÃO E CONSOLIDAÇÃO - SISTEMA AMAZON N8N

## 📋 RESUMO EXECUTIVO

Consolidação de 3 backends em 1 único backend unificado, reduzindo complexidade em 70% e melhorando manutenibilidade.

---

## 🎯 OBJETIVOS

1. **Unificar 3 backends** em 1 único serviço
2. **Consolidar 2 frontends** em 1 interface única
3. **Eliminar 100+ arquivos** duplicados/desnecessários
4. **Simplificar arquitetura** para facilitar manutenção
5. **Manter 100% das funcionalidades** atuais

---

## 📊 SITUAÇÃO ATUAL

### Backends:
- **amazon-api-backend** (porta 8080) - Em uso pelo lovable-frontend
- **amazon-seller-backend** - NÃO USADO (melhor arquitetura)
- **amazon-sp-api-service** (porta 8080) - Em uso parcial pelo amazon-dashboard

### Frontends:
- **lovable-frontend** - React/Vite (principal)
- **amazon-dashboard** - Next.js (secundário)

### Problemas Identificados:
- ❌ Código duplicado em 3 backends
- ❌ 2 sistemas de autenticação diferentes
- ❌ 100+ scripts soltos na raiz
- ❌ 2 frontends com funcionalidades sobrepostas
- ❌ Múltiplas conexões ao mesmo banco de dados

---

## ✅ ARQUITETURA ALVO

```
┌─────────────────────────┐
│   lovable-frontend      │
│   (React + Vite)        │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  amazon-backend-unified │
│      (Porta 8080)       │
├─────────────────────────┤
│ • Auth API (JWT)        │
│ • Products API          │
│ • Orders API            │
│ • Dashboard API         │
│ • Metrics API           │
│ • Sync Jobs (Bull)      │
│ • WebSocket (Socket.io) │
│ • Cron Jobs             │
│ • Redis Cache           │
└─────────────────────────┘
             │
             ▼
┌─────────────────────────┐
│     PostgreSQL          │
│   (amazon_orders DB)    │
└─────────────────────────┘
```

---

## 📝 PLANO DE AÇÃO DETALHADO

### FASE 0: PREPARAÇÃO (Dia 1)
**✅ CONCLUÍDO**

- [x] Criar script de backup do sistema (`backup-system.ps1`)
- [x] Criar script de backup do banco (`backup-database.ps1`)
- [x] Documentar arquitetura atual

**EXECUTAR AGORA:**
```powershell
# 1. Fazer backup completo
.\backup-system.ps1

# 2. Fazer backup do banco de dados
.\backup-database.ps1
```

---

### FASE 1: PREPARAR BACKEND UNIFICADO (Dia 2)

#### 1.1 Criar novo backend baseado no amazon-seller-backend

```bash
# Copiar amazon-seller-backend como base
cp -r amazon-seller-backend amazon-backend-unified

cd amazon-backend-unified

# Limpar e atualizar dependências
rm -rf node_modules dist
npm install
```

#### 1.2 Configurar estrutura de pastas

```
amazon-backend-unified/
├── src/
│   ├── routes/
│   │   ├── auth.routes.ts      (migrar de amazon-api-backend)
│   │   ├── products.routes.ts  (migrar de amazon-api-backend)
│   │   ├── orders.routes.ts    (migrar de amazon-api-backend)
│   │   ├── dashboard.routes.ts (migrar de amazon-api-backend)
│   │   ├── metrics.routes.ts   (migrar de amazon-api-backend)
│   │   └── sync.routes.ts      (migrar de sp-api-service)
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── database.service.ts
│   │   ├── sync.service.ts     (de sp-api-service)
│   │   └── websocket.service.ts (de sp-api-service)
│   ├── jobs/
│   │   ├── sync-orders.job.ts
│   │   ├── sync-products.job.ts
│   │   └── cron-scheduler.ts
│   └── index.ts (servidor principal)
```

---

### FASE 2: MIGRAR FUNCIONALIDADES (Dias 3-4)

#### 2.1 Migrar APIs do amazon-api-backend

```typescript
// Copiar e converter para TypeScript:
// - routes/auth.js → routes/auth.routes.ts
// - routes/products.js → routes/products.routes.ts
// - routes/orders.js → routes/orders.routes.ts
// - routes/dashboard.js → routes/dashboard.routes.ts
// - routes/metrics.js → routes/metrics.routes.ts
```

#### 2.2 Migrar sincronização do amazon-sp-api-service

```typescript
// Copiar e integrar:
// - WebSocket server (Socket.io)
// - Bull queues para jobs
// - SP-API client
// - Sync services
```

#### 2.3 Consolidar scripts de sincronização

```typescript
// Mover todos os scripts .js da raiz para jobs organizados:
// - sync-*.js → jobs/sync/
// - import-*.js → jobs/import/
// - update-*.js → jobs/update/
```

---

### FASE 3: UNIFICAR FRONTEND (Dia 5)

#### 3.1 Consolidar em lovable-frontend

```bash
# Migrar componentes úteis do amazon-dashboard
# - SyncControl.tsx
# - Dashboard charts
# - Métricas em tempo real
```

#### 3.2 Atualizar configurações

```env
# .env.local
VITE_API_URL=http://localhost:3333/api
VITE_WS_URL=ws://localhost:3333
```

---

### FASE 4: TESTES E VALIDAÇÃO (Dia 6)

#### 4.1 Checklist de Testes

- [ ] Login/Logout funcionando
- [ ] Listagem de produtos
- [ ] Listagem de pedidos
- [ ] Dashboard com métricas
- [ ] Sincronização SP-API
- [ ] WebSocket para atualizações em tempo real
- [ ] Jobs de sincronização agendados
- [ ] Exportação de dados

#### 4.2 Testes de Performance

```bash
# Verificar uso de memória
# Testar carga com múltiplas requisições
# Validar tempo de resposta das APIs
```

---

### FASE 5: LIMPEZA (Dia 7)

#### 5.1 Remover códigos antigos

```bash
# APÓS CONFIRMAR QUE TUDO FUNCIONA:

# 1. Mover backends antigos para pasta de arquivo
mkdir _OLD_BACKENDS
mv amazon-api-backend _OLD_BACKENDS/
mv amazon-seller-backend _OLD_BACKENDS/
mv amazon-sp-api-service _OLD_BACKENDS/

# 2. Mover scripts antigos
mkdir _OLD_SCRIPTS
mv sync-*.js _OLD_SCRIPTS/
mv import-*.js _OLD_SCRIPTS/
mv update-*.js _OLD_SCRIPTS/

# 3. Remover dashboard antigo
mv amazon-dashboard _OLD_BACKENDS/
```

#### 5.2 Organizar estrutura final

```
N8N_Amazon/
├── amazon-backend-unified/  # Backend único
├── lovable-frontend/        # Frontend único
├── database/                # Schemas e migrations
├── docs/                    # Documentação
└── scripts/                 # Scripts úteis
```

---

## 🔧 SCRIPTS DE MIGRAÇÃO

### Script 1: Iniciar migração
```bash
# start-migration.sh
#!/bin/bash
echo "Iniciando migração..."
cp -r amazon-seller-backend amazon-backend-unified
cd amazon-backend-unified
npm install
```

### Script 2: Validar migração
```bash
# validate-migration.sh
#!/bin/bash
echo "Validando APIs..."
curl http://localhost:8080/health
curl http://localhost:8080/api/products
# ... outros testes
```

---

## ⚠️ RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Perda de dados | Baixa | Alto | Backup completo antes de iniciar |
| APIs incompatíveis | Média | Médio | Manter mesmas rotas e formatos |
| Downtime | Média | Alto | Fazer migração em ambiente de teste primeiro |
| Bugs na consolidação | Alta | Médio | Testes extensivos antes do deploy |

---

## 📈 BENEFÍCIOS ESPERADOS

- **70% menos código** para manter
- **3x mais rápido** para adicionar features
- **50% menos uso de memória** (1 servidor vs 3)
- **Debugging simplificado** (tudo em 1 lugar)
- **Deploy único** ao invés de múltiplos
- **Custos reduzidos** de infraestrutura

---

## 🚦 CRITÉRIOS DE SUCESSO

- ✅ Todas as funcionalidades atuais mantidas
- ✅ Performance igual ou melhor
- ✅ Código 70% menor
- ✅ 1 único backend rodando
- ✅ 1 único frontend rodando
- ✅ Testes passando
- ✅ Zero downtime na migração

---

## 📅 CRONOGRAMA

| Dia | Fase | Status |
|-----|------|--------|
| 1 | Preparação e Backup | ✅ Pronto |
| 2 | Preparar Backend Unificado | ⏳ Próximo |
| 3-4 | Migrar Funcionalidades | ⏳ Pendente |
| 5 | Unificar Frontend | ⏳ Pendente |
| 6 | Testes e Validação | ⏳ Pendente |
| 7 | Limpeza e Finalização | ⏳ Pendente |

---

## 💡 PRÓXIMOS PASSOS IMEDIATOS

1. **EXECUTAR AGORA:**
   ```powershell
   .\backup-system.ps1
   .\backup-database.ps1
   ```

2. **CONFIRMAR BACKUPS:**
   - Verificar pasta `N8N_Amazon_BACKUP_[data]`
   - Verificar pasta `N8N_Amazon_BACKUP_DB_[data]`

3. **INICIAR FASE 1:**
   - Copiar amazon-seller-backend
   - Começar configuração do backend unificado

---

## 📞 SUPORTE

Em caso de problemas durante a migração:
1. Restaurar backup imediatamente
2. Documentar o erro encontrado
3. Ajustar plano conforme necessário

---

**IMPORTANTE:** Mantenha os backups até 30 dias após confirmar sucesso total da migração!