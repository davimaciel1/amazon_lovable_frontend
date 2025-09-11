# 🧹 Plano de Limpeza e Reorganização - Projeto N8N Amazon

## 📊 Situação Atual
- **150 arquivos JS na raiz** (totalmente desorganizado!)
- **Múltiplos arquivos duplicados** com variações de nomes
- **Sem estrutura clara** de pastas
- **Arquivos de teste misturados** com código de produção

## 📁 Nova Estrutura Proposta

```
N8N_Amazon/
├── src/                        # Código principal da aplicação
│   ├── api/                    # APIs e rotas
│   ├── services/               # Lógica de negócio
│   │   ├── amazon/            # Integração Amazon
│   │   ├── database/          # Operações de banco
│   │   └── sync/              # Sincronização
│   ├── config/                # Configurações
│   └── utils/                 # Utilitários
│
├── scripts/                    # Scripts auxiliares
│   ├── sync/                  # Scripts de sincronização
│   ├── workflows/             # Workflows N8N
│   ├── migration/             # Migração de dados
│   └── maintenance/           # Manutenção e fixes
│
├── tests/                      # Testes
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/                       # Documentação
│
├── backup/                     # Backup dos arquivos antigos
│
└── [arquivos de config na raiz: package.json, .env, etc]
```

## 🎯 Ações de Limpeza

### 1. Arquivos para REMOVER (duplicados/temporários)
- `import-*.js` (26 arquivos de workflow) → Manter apenas o mais recente
- `workflow-*.js` (múltiplas versões) → Consolidar em um único
- `fix-*.js` temporários → Mover para scripts/maintenance
- `test-*.js` → Mover para tests/
- `check-*.js` e `verify-*.js` → Consolidar em scripts/validation

### 2. Arquivos para ORGANIZAR

#### → `/src/services/amazon/`
- amazon-ads-real-api.js
- amazon-ads-token-manager.js
- amazon-advertising-api.js
- saas-amazon-ads-integration.js

#### → `/src/services/sync/`
- sync-orchestrator.js
- sync-all-data-auto.js
- sync-amazon-ads-v3.js
- autonomous-ads-sync.js
- daily-sync-scheduler.js

#### → `/scripts/workflows/`
- Consolidar todos os workflow-*.js em um único arquivo
- Manter apenas a versão final funcional

#### → `/tests/`
- Todos os test-*.js
- e2e-test-complete.js

#### → `/scripts/maintenance/`
- fix-database-complete.js
- fix-order-items-final.js
- update-*.js

### 3. Arquivos CORE para manter em `/src/`
- Identificar o arquivo principal de entrada (server.js ou index.js)
- APIs principais
- Configurações essenciais

## 📝 Ordem de Execução

1. **Criar backup completo** → `/backup/2024-12-28/`
2. **Criar nova estrutura de pastas**
3. **Mover arquivos organizadamente**
4. **Remover duplicados óbvios**
5. **Atualizar imports nos arquivos principais**
6. **Testar aplicação**
7. **Documentar estrutura final**

## ⚠️ Arquivos Críticos (NÃO REMOVER)
- dashboard-server.js (servidor principal?)
- sync-orchestrator.js (orquestrador principal)
- .env e configurações
- package.json e package-lock.json

## 🔍 Validação Pós-Limpeza
- [ ] Aplicação ainda funciona
- [ ] Sincronização com Amazon OK
- [ ] Conexão com banco de dados OK
- [ ] Dashboard acessível
- [ ] Testes passando

## 📈 Resultados Esperados
- De 150 arquivos na raiz → ~10 arquivos
- Estrutura clara e manutenível
- Fácil localização de funcionalidades
- Redução de ~70% no número total de arquivos