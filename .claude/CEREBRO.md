# PRD – Cérebro Pensante (com MCP TestSprite)

**Versão:** 1.0
**Status:** Proposto (pronto para implementação)
**Owner:** Eng. de Plataforma / Tech Lead
**Stakeholders:** PM, Eng. Frontend, Eng. Backend, QA, DevEx, Sec/Compliance

---

## 1) Contexto e Objetivo

Criar uma **página interna de orquestração** (“Cérebro”) que mantenha o produto **limpo, atualizado, funcional e útil** como SaaS, integrando:

* Inventário do código/arquitetura (frontend, backend, DB)
* Pipeline de qualidade (testes, estática, segurança, performance)
* **MCP TestSprite** para gerar/rodar testes e sugerir fixes
* Atualização automática do diretório **`.claude/`** com contexto do app
* **Dashboard** (métricas + insights + histórico) e **Chat IA** com *tools*
* Comparador de **concorrentes** com backlog priorizado

**Resultado esperado:** reduzir dívida técnica, automatizar limpeza de código, acelerar QA, padronizar qualidade e orientar roadmap de melhorias com dados.

---

## 2) Escopo

### 2.1 Em Escopo

1. **Observabilidade de código**: mapear rotas, endpoints, componentes, dependências, migrations, entidades e RLS.
2. **Test Runner Unificado**: Unit/integração (Vitest), E2E (Playwright) + acoplamento com **MCP TestSprite** para geração/execução de testes e *auto-fix patches*.
3. **Caça código morto e *smells***: `knip`, `depcheck`, `ts-prune`, `madge`, `eslint` (+ `sonarjs`).
4. **Performance/Bundle**: budgets por página, diffs de bundle; profiling leve no backend.
5. **Segurança** (mínima): `npm audit` e `semgrep` (regras baseline).
6. **DB Introspect**: gerar dicionário de dados, diagrama textual e checagem de chaves ausentes.
7. **Atualizador `.claude/`**: `app-map.md`, `db.md`, `scripts.md`, `quality-gates.md`, `competitors.md`.
8. **Dashboard**: cards + tabelas de *runs* + insights + gráficos simples (históricos de cobertura, duração, pass rate).
9. **Chat IA com *tools***: `runChecks`, `triggerTestspriteRun`, `openPR`, `refreshClaudeContext`, `compareCompetitors`.
10. **Backlog de Concorrentes**: coleta leve de metadados públicos e priorização ICE/RICE.

### 2.2 Fora de Escopo (v1)

* Pentest profundo e SAST/DAST avançado.
* Scraping agressivo de sites de concorrentes.
* Execução de MCP diretamente **no servidor do SaaS** (MCP roda na IDE/ambiente do dev).

---

## 3) Personas

* **Dev**: dispara checks, lê insights, aplica patches via PR.
* **Tech Lead**: define budgets e *quality gates*, aprova PRs automatizados.
* **QA/PM**: consulta estabilidade, flakiness, cobertura e progresso do backlog.
* **AI Reviewer**: usa chat IA para criar/validar melhorias e abrir PRs pequenos.

---

## 4) Requisitos Funcionais

### RF-01 – Inventário/Observabilidade de Código

* Mapear automaticamente: rotas (Next.js), APIs (`route.ts`), componentes, dependências e ciclos.
* Exibir lista navegável no dashboard (com totals, diffs por commit/branch).
* Gerar `app-map.md` em `.claude/`.

**Aceite:** dado um repositório válido, o Cérebro exibe ≥ 95% das rotas e endpoints e persiste `app-map.md` atualizado por execução.

### RF-02 – Testes (Local CI + MCP TestSprite)

* Rodar **Vitest** (unit/integração) e **Playwright** (E2E) com cobertura (c8).
* Integrar com **MCP TestSprite** para: geração de casos de teste, execução enfileirada e **sugestões de fix** com diffs.
* Persistir *runs* (provider, status, pass/fail/flaky, duração, links de relatório).

**Aceite:** ao acionar “Rodar Checks” ou “Executar no MCP”, o dashboard registra o *run*, mostra status em tempo (quase) real e permite abrir PR com patch sugerido.

### RF-03 – Caça Código Morto e Smells

* Executar `knip`, `depcheck`, `ts-prune` e `madge --circular`, consolidando achados por severidade.
* Para cada achado, exibir **sugestão** e (quando seguro) **autofix patch**.

**Aceite:** relatório lista 100% dos exports/arquivos “sem uso” detectados pelas ferramentas, com link para o arquivo e *suggested fix*.

### RF-04 – Performance/Bundle Budgets

* Definir budgets por página (ex.: **≤ 200 KB gzip** inicial).
* Exibir deltas do bundle por PR e regressões com severidade.

**Aceite:** ao exceder budget, o *run* marca falha de performance e o chat IA sugere otimizações (ex.: code-splitting, lazy, compressão).

### RF-05 – Segurança Básica

* Executar `npm audit` e `semgrep` com baseline de regras.
* Consolidar achados com tags `security:low|med|high`.

**Aceite:** achados de alto risco aparecem como **bloqueadores** para merge em `main`.

### RF-06 – DB Introspect

* Coletar metadados de entidades/tabelas, FKs, índices, RLS/policies, migrations aplicadas.
* Gerar `.claude/db.md` e exibir *heatmap* de tabelas sem testes.

**Aceite:** relatório de DB lista todas as entidades e relações conhecidas e aponta lacunas de testes por módulo.

### RF-07 – Atualizador `.claude/`

* (Re)gerar `app-map.md`, `db.md`, `scripts.md`, `quality-gates.md`, `competitors.md` em toda execução.
* Expor botão “Atualizar contexto” no dashboard e no chat IA.

**Aceite:** arquivos presentes e atualizados; data/hora e hash de commit anotados.

### RF-08 – Dashboard (Métricas e Insights)

* **Cards**: Pass rate 24h/7d, duração média, flaky tests, regressões de bundle, cobertura global.
* **Tabelas**: runs (com filtros), findings (lint/dead/arch/security/perf).
* **Gráficos**: séries de cobertura e duração.
* **Detalhe do run**: logs, diffs, links (Playwright, MCP), botão “Abrir PR”.

**Aceite:** dados persistidos, filtros por branch/intervalo e drilldown por run.

### RF-09 – Chat IA com Tools

Ferramentas disponíveis no chat:

* `runChecks(scope)` – executa pipeline local; retorna resumo e links.
* `triggerTestspriteRun(config)` – dispara execução no MCP TestSprite.
* `openPR(patch|branch)` – cria PR com diffs e descrição padronizada.
* `refreshClaudeContext()` – reexecuta geradores `.claude/`.
* `compareCompetitors(list|preset)` – avalia lacunas de UX/feature/pricing e escreve issues com critérios de aceite.

**Aceite:** comandos funcionam, logs do chat armazenados e cada ação gera *audit trail*.

### RF-10 – Comparador de Concorrentes

* `competitors.md` contém links e critérios de avaliação (onboarding, paywall, Web Vitals de *lab*, pricing, recursos).
* Worker (manual/semanal) captura **metadados públicos** e produz **backlog** priorizado (ICE/RICE) com *acceptance criteria*.

**Aceite:** página lista lacunas priorizadas; botão “Gerar issues” cria tickets com escopo mínimo + testes sugeridos.

---

## 5) Requisitos Não Funcionais

* **Segurança:** secrets via variáveis de ambiente; GitHub App para PRs; somente leitura para DB introspect.
* **Performance (dashboard):** respostas em < 300 ms p95 para listagens; jobs assíncronos.
* **Confiabilidade:** retriable jobs; idempotência em webhooks; *at-least-once* na ingestão.
* **Observabilidade:** logs estruturados, métricas (runs/min, pass rate, duração média), traços em endpoints críticos.
* **Acessos/Perfis:** RBAC simples (Viewer/Editor/Admin).
* **Auditoria:** todas as ações do chat e *autofixes* são logadas com usuário, timestamp e hash do commit.

---

## 6) Dependências e Padrões de Stack

* **Frontend**: Next.js 14 (App Router), TypeScript, shadcn/ui, TanStack Table.
* **Copilot in‑app (Chat IA)**: **CopilotKit** (UI + Actions + Contexto do app), provider‑agnostic (Claude/OpenAI). O Copilot chama **server actions/rotas** descritas nas seções 8 e 21.
* **Backend**: Next API Routes/Server Actions, Node 18+.
* **DB**: Postgres (Drizzle ou Prisma) – acesso **read‑only** para introspect no Cérebro.
* **Testes**: Vitest + Testing Library; Playwright (E2E).
* **Qualidade**: ESLint (+ import/sonarjs), knip, depcheck, ts-prune, madge, semgrep.
* **Coverage**: c8.
* **Perf**: Next Bundle Analyzer (budgets por página).
* **MCP**: **TestSprite** instalado na IDE (Cursor/Windsurf/Claude Code). O SaaS consome **webhooks/relatórios** e pode **disparar execuções** via endpoints internos.
* **CI**: GitHub Actions (quality gates obrigatórios, ver §11).

---

## 7) Data Model (mínimo)

```sql
CREATE TABLE brain_runs (
  id UUID PRIMARY KEY,
  provider TEXT,              -- local|testsprite
  branch TEXT,
  scope TEXT[],               -- ['types','lint','dead','arch','test','e2e','coverage','bundle','security']
  status TEXT,                -- queued|running|success|failed|partial
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  report_url TEXT,
  total INT, passed INT, failed INT, flaky INT,
  duration_ms INT
);

CREATE TABLE brain_findings (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES brain_runs(id) ON DELETE CASCADE,
  kind TEXT,                  -- lint|dead|arch|security|bundle|test|db
  severity TEXT,              -- info|warn|error|blocker
  title TEXT,
  file TEXT, line INT,
  suggestion TEXT,
  autofix_patch TEXT          -- diff unificado opcional
);

CREATE TABLE brain_budgets (
  id UUID PRIMARY KEY,
  page TEXT UNIQUE,
  budget_kb_gzip INT DEFAULT 200,
  last_size_kb_gzip INT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE brain_competitors (
  id UUID PRIMARY KEY,
  name TEXT,
  url TEXT,
  notes TEXT,
  enabled BOOLEAN DEFAULT true
);

CREATE TABLE brain_issues (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  title TEXT,
  body TEXT,
  priority TEXT,              -- P0..P3
  score REAL,                 -- ICE/RICE
  status TEXT DEFAULT 'open'
);

CREATE TABLE brain_audit (
  id UUID PRIMARY KEY,
  actor TEXT,
  action TEXT,                -- tool invocations, PRs, updates
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 8) APIs (contratos)

### 8.1 Orquestração de Checks

`POST /api/brain/run`
**Body**

```json
{ "scope": ["types","lint","dead","arch","test","coverage","bundle","security"], "branch": "feat/x" }
```

**Resp**

```json
{ "runId": "uuid", "status": "queued" }
```

`GET /api/brain/run/:id` → status + resumo + links.

### 8.2 Webhook TestSprite

`POST /api/brain/tests/webhook`
**Body (exemplo simplificado)**

```json
{
  "provider": "testsprite",
  "externalRunId": "abc123",
  "status": "success",
  "reportUrl": "https://…",
  "totals": { "total": 120, "passed": 117, "failed": 2, "flaky": 1 },
  "durationMs": 98543
}
```

**Resp** `200 { ok: true }`

### 8.3 Insights (estática + bundle + segurança)

`POST /api/brain/insights/rebuild` → reexecuta ferramentas e grava `brain_findings`.

### 8.4 PR Bot (GitHub App)

`POST /api/brain/pr`
**Body**

```json
{ "branch": "brain/fix-dead-code-123", "patch": "diff --git …", "title": "chore: remove exports mortos", "body": "Resumo/links" }
```

**Resp**

```json
{ "htmlUrl": "https://github.com/.../pull/42" }
```

### 8.5 Atualizador `.claude/`

`POST /api/brain/claude/refresh` → reescreve `app-map.md`, `db.md`, `scripts.md`, `quality-gates.md`, `competitors.md` e retorna hashes.

---

## 9) Fluxos de Usuário

### 9.1 Run Completo (Local)

1. Usuário acessa **Cérebro** → escolhe branch/escopo → clica **Run checks**.
2. API cria `brain_runs` (status `queued`) → executa scripts → atualiza status/logs.
3. Dashboard reflete resultados; usuário pode abrir PRs de fixes propostos.

### 9.2 Execução MCP TestSprite

1. Usuário (ou agente) roda comando na IDE → TestSprite executa plano.
2. Ao concluir, portal/TestSprite envia **webhook** → SaaS registra run e exibe no dashboard.
3. Chat IA sugere PR com patch do TestSprite ou *codemod* interno.

### 9.3 Atualizar `.claude/`

1. Botão **Atualizar contexto** → endpoint gera arquivos.
2. Chat IA passa a usar contexto atualizado nas respostas/correções.

### 9.4 Comparador de Concorrentes

1. PM/Tech Lead seleciona lista em `competitors.md`.
2. Worker extrai metadados públicos e compõe grade de comparação.
3. Chat IA gera backlog (ICE/RICE) + issues com *acceptance criteria*.

### 9.5 **Fluxos do Copilot (Admin) mapeados para Tools**

Cada comando do admin invoca uma **tool** (server action/rota), com RBAC **admin‑only** (ver §19) e templates (ver §20). Mapeamento:

1. **Limpar código morto**
   Tool: `cleanupDeadCode`
   Rota: `POST /api/brain/deadcode/cleanup`
   Action: `actions.cleanupDeadCode(params)` → roda knip/depcheck/ts‑prune/madge e propõe patch.

2. **Consertar testes com TestSprite**
   Tool: `fixBrokenTests`
   Rota: `POST /api/brain/tests/run`
   Action: `actions.triggerTestspriteRun({ suite })` + coleta relatório → gera PR com ajustes.

3. **Evitar regressão de performance**
   Tool: `enforceBundleBudgets`
   Rota: `POST /api/brain/perf/bundle/fix`
   Action: `actions.checkAndFixBundles()` (split, lazy, imagens otimizadas).

4. **Atualizar `.claude/`**
   Tool: `refreshClaudeContext`
   Rota: `POST /api/brain/claude/refresh`
   Action: `actions.refreshClaudeContext()`.

5. **Quality gates**
   Tool: `setQualityGates`
   Rota: `POST /api/brain/quality-gates/enforce`
   Action: `actions.applyQualityGates(cfg)`.

6. **Criar testes onde falta**
   Tool: `generateIntegrationTests`
   Rota: `POST /api/brain/tests/generate`
   Action: `actions.generateTests({ module })` + opcional TestSprite.

7. **Correções de segurança simples**
   Tool: `securityQuickFix`
   Rota: `POST /api/brain/security/quickfix`
   Action: `actions.securityQuickFix()` (audit + semgrep baseline, bumps seguros).

8. **DB: introspect + migrações**
   Tool: `dbIntrospectAndMigrate`
   Rota: `POST /api/brain/db/introspect-migrate`
   Action: `actions.dbIntrospectAndMigrate()`.

9. **Triagem de PR gigante**
   Tool: `summarizePR`
   Rota: `POST /api/brain/pr/summarize`
   Action: `actions.summarizePR({ prNumber })`.

10. **Comparar concorrentes e criar backlog**
    Tool: `compareCompetitors`
    Rota: `POST /api/brain/competitors/compare`
    Action: `actions.compareCompetitors(list)`.

11. **Resolver flakiness**
    Tool: `stabilizeFlakyTests`
    Rota: `POST /api/brain/tests/flaky/stabilize`
    Action: `actions.stabilizeFlakyTests()`.

12. **Higienizar ESLint**
    Tool: `cleanupLint`
    Rota: `POST /api/brain/lint/cleanup`
    Action: `actions.cleanupLint()`.

13. **Plano de refactor orientado a dados**
    Tool: `refactorPlan`
    Rota: `POST /api/brain/refactor/plan`
    Action: `actions.refactorPlan({ module })`.

14. **Checklist de release**
    Tool: `releaseChecklist`
    Rota: `POST /api/brain/release/checklist`
    Action: `actions.releaseChecklist()`.

15. **Hotfix de performance em página**
    Tool: `hotfixPerf`
    Rota: `POST /api/brain/perf/hotfix`
    Action: `actions.hotfixPerf({ route })`.

---

## 10) UI/UX (wireframes textuais)

* **Header:** seletor de branch/ambiente; botões **Run checks**, **Executar no MCP**, **Atualizar `.claude/`**.
* **Tabs:** *Visão Geral* | *Insights* | *Execuções* | *Coverage/Bundle* | *DB* | *Concorrentes* | *Chat IA*.
* **Visão Geral (cards):** Pass rate 7d | Cobertura | Duração média | Flaky | Regressões de bundle | Issues abertas.
* **Insights:** tabela com filtros (tipo, severidade, módulo); cada linha tem **Ver patch** | **Abrir PR**.
* **Execuções:** lista de *runs* com provider, status, totals, duration, link para detalhe.
* **Coverage/Bundle:** gráfico histórico + tabela por página/módulo com budgets.
* **DB:** entidades, relações, “tabelas sem teste”, RLS/policies (resumo).
* **Concorrentes:** checklist de features/UX/pricing e backlog.
* **Chat IA:** janela fixa à direita com *tools* e histórico (persistência opt-in).

---

## 11) Quality Gates (obrigatórios na `main`)

* Cobertura global ≥ **80%**; módulos core ≥ 90%.
* **0** ciclos (`madge`) e **0** exports mortos (`knip`).
* Budgets web: **≤ 200 KB gzip** por página (first load).
* Sem `eslint` warnings; `semgrep` **sem high**.
* PRs somente com checks verdes (local + MCP quando aplicável).

---

## 12) Segurança, Privacidade e Conformidade

* Secrets (API keys/TestSprite, GH App) em **ENV** e secretos de plataforma.
* Acesso DB do Cérebro em **read-only** (introspect).
* **RBAC**: ferramentas do Copilot são **admin‑only** por padrão (ver §19).
* Auditoria: todas as ações do chat e *autofixes* são logadas com usuário, timestamp e hash do commit.
* Dados de concorrentes: apenas metadados públicos; sem scraping agressivo.

---

## 13) Telemetria & Analytics

* Eventos: `brain.run.started|finished`, `brain.finding.created`, `brain.pr.created`, `chat.tool.invoked`.
* Métricas: pass rate (24h/7d), cobertura média, regressões de bundle/PR, MTTR de correções, flakiness por suite.
* Painéis: séries temporais (sem dependência externa).

---

## 14) Roadmap / Marcos

**S1 (dias 1–3):** Data model, endpoints `/run` e `/insights/rebuild`, execução local de `tsc/eslint/knip/madge`.
**S2 (dias 4–6):** Vitest + cobertura, Playwright básico, páginas Dashboard `Visão Geral/Insights/Execuções`.
**S3 (dias 7–9):** Next Bundle Analyzer + budgets, DB introspect, `.claude/*` generator.
**S4 (dias 10–12):** Webhook/poller TestSprite, cards e gráficos históricos, *detail run page*.
**S5 (dias 13–15):** Chat IA com *tools*, PR Bot (GH App), backlog de concorrentes.
**S6 (dias 16–18):** Endurecimento (RBAC, auditoria, retries), limpeza, docs e *rollout*.

---

## 15) Critérios de Sucesso (KPIs)

* ↓ 50% no tempo médio para corrigir regressões de teste.
* ↓ 40% em exports/deps mortos no trimestre.
* Cobertura +10 p.p. em 30 dias.
* ≥ 80% dos PRs com *no regressions* de bundle.
* ≥ 2 melhorias de UX/feature/mês vindas do comparador de concorrentes com impacto mensurável.

---

## 16) Riscos & Mitigações

* **Falsos positivos** (knip/depcheck): validar com *safelist* e PR humano.
* **Flakiness** E2E: *retries*, *testId* estáveis, *network idle*.
* **APIs do TestSprite**: desacoplamento via webhook/poller + *backoff*.
* **Segurança de patches**: PRs sempre em branch isolada; limites de patch (≤ 200 linhas por PR).

---

## 17) Anexos Técnicos

### 17.1 Scripts recomendados (package.json)

```json
{
  "scripts": {
    "check:types": "tsc --noEmit",
    "check:lint": "eslint . --max-warnings=0",
    "check:dead": "knip && depcheck && ts-prune",
    "check:arch": "madge src --circular",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "coverage": "vitest run --coverage",
    "analyze:web": "ANALYZE=true next build",
    "brain:claude": "tsx scripts/gen-claude-context.ts"
  }
}
```

### 17.2 Estrutura `.claude/`

```
.claude/
  system.md
  app-map.md            ← gerado
  db.md                 ← gerado
  scripts.md            ← gerado
  quality-gates.md      ← budgets, metas e políticas
  competitors.md        ← links e critérios (editável)
```

### 17.3 Tools do Chat IA (contrato)

As tools são expostas ao **CopilotKit** como server actions/rotas com RBAC **admin‑only**. Tipos sugeridos:

```ts
export type Scope = ('types'|'lint'|'dead'|'arch'|'test'|'e2e'|'coverage'|'bundle'|'security')[];

export interface BrainTools {
  runChecks(input: { scope: Scope; branch?: string }): Promise<{ runId: string; summary: string }>;
  triggerTestspriteRun(input: { suite: string; branch?: string }): Promise<{ externalRunId: string; link: string }>;
  openPR(input: { patch: string; title: string; body: string; base?: string; head?: string }): Promise<{ url: string }>;
  refreshClaudeContext(): Promise<{ files: { name: string; sha: string }[] }>;
  compareCompetitors(input: { preset?: string; list?: string[] }): Promise<{ issues: { title: string; score: number; url?: string }[] }>;

  cleanupDeadCode(): Promise<{ prUrl: string; removed: number }>;
  fixBrokenTests(input: { suite?: string }): Promise<{ prUrl: string; failuresFixed: number }>;
  enforceBundleBudgets(): Promise<{ prUrl?: string; regressions: number }>;
  setQualityGates(input: { coverageMin: number; blockCycles: boolean }): Promise<{ applied: boolean }>;
  generateIntegrationTests(input: { module: string }): Promise<{ prUrl: string; files: string[] }>;
  securityQuickFix(): Promise<{ prUrl?: string; advisoriesFixed: number }>;
  dbIntrospectAndMigrate(): Promise<{ prUrl: string; changes: string[] }>;
  summarizePR(input: { prNumber: number }): Promise<{ commentUrl: string; risks: string[] }>;
  stabilizeFlakyTests(): Promise<{ prUrl: string; tests: string[] }>;
  cleanupLint(): Promise<{ prUrl: string; fixes: number }>;
  refactorPlan(input: { module: string }): Promise<{ docUrl?: string; issues: string[] }>;
  releaseChecklist(): Promise<{ reportUrl: string; status: 'go'|'no-go' }>;  
  hotfixPerf(input: { route: string }): Promise<{ prUrl: string; beforeKB: number; afterKB: number }>;
}
```

**Guardrails (executados pelo middleware do Copilot):**

* Verificar `session.role === 'admin'` para toda tool (ver §19).
* **Timeouts** (ex.: 60–300s), **idempotência** por `runId`, **rate limit**.
* Logar invocações em `brain_audit` (`chat.tool.invoked`).

### 17.4 Padrão de PR gerado

```
[chore|fix|perf|test]: <resumo>

Contexto:
- Link para run (local/MCP) e relatório
- Achados relevantes (IDs)

Mudanças:
- Lista objetiva de arquivos e porquê

Checks:
- [ ] Vitest OK  - [ ] Playwright OK  - [ ] Budgets OK  - [ ] Semgrep OK
```

---

## 18) Assunções e Itens em Aberto

* Stack predominante Next 14 + TS + Postgres.
* IDEs com MCP TestSprite já configurado (chave válida).
* Definir lista inicial de concorrentes e pesos de critérios (ICE/RICE).
* Escolher Drizzle **ou** Prisma para introspect (padronizar).
* Confirmar quotas de execução (MCP/CI) para não travar times.

---

## 19) RBAC e Guardrails (Admin‑only)

* **Perfis**: `admin`, `editor` (interno), `viewer` (interno).
* **Ferramentas Copilot**: **apenas `admin`** executa; `editor` pode visualizar resultados e gerar PR *draft*; `viewer` só consulta dashboard.
* **Enforcement**: middleware (Next) e wrapper do CopilotKit validam sessão/role; cada tool verifica autorização antes de executar.
* **Rate limits**: por usuário e por tool; **timeouts** e **cancel tokens**.
* **Audit trail**: `brain_audit` registra actor, tool, payload (redigida) e resultado.

---

## 20) Templates de PR & Issue (uso automático pelo Copilot)

### 20.1 Template de PR (padrão)

```
[chore|fix|perf|test|db|security]: <resumo curto>

Contexto
- Run/Relatório: <link>
- Achados relacionados: <ids/resumos>

Mudanças
- <lista objetiva>

Riscos & Rollback
- <riscos previsíveis>
- Plano de rollback: <passos>

Checks
- [ ] Vitest OK  
- [ ] Playwright OK  
- [ ] Budgets OK  
- [ ] Semgrep (no high)  
- [ ] Lint 0 warnings
```

### 20.2 Template de Issue – Feature/UX (ICE/RICE)

```
feat: <título>

Problema/Oportunidade
- <descrição>

Proposta
- <escopo mínimo>

Métrica de sucesso
- <métrica>

Prioridade e Score
- P<0..3>, ICE=<n> (ou RICE=<n>)

Critérios de Aceite
- [ ] <teste E2E/integração relevante>
```

### 20.3 Template de Issue – Dívida Técnica/Correção

```
tech: <título>

Contexto
- <onde dói / achados>

Plano
- <passos curtos>

Risco
- <baixo|médio|alto>

Critérios de Aceite
- [ ] CI verde  
- [ ] Cobertura > X% no módulo  
- [ ] Sem regressão de bundle
```

---

## 21) Server Actions & Rotas (implementação de referência)

**Server actions** (padrão): `actions.runChecks`, `actions.triggerTestspriteRun`, `actions.openPR`, `actions.refreshClaudeContext`, `actions.compareCompetitors`, `actions.cleanupDeadCode`, `actions.fixBrokenTests`, `actions.checkAndFixBundles`, `actions.applyQualityGates`, `actions.generateTests`, `actions.securityQuickFix`, `actions.dbIntrospectAndMigrate`, `actions.summarizePR`, `actions.stabilizeFlakyTests`, `actions.cleanupLint`, `actions.refactorPlan`, `actions.releaseChecklist`, `actions.hotfixPerf`.

**Rotas** (Next API):

* `POST /api/brain/run`
* `POST /api/brain/tests/run`
* `POST /api/brain/pr`
* `POST /api/brain/claude/refresh`
* `POST /api/brain/competitors/compare`
* `POST /api/brain/perf/bundle/fix`
* `POST /api/brain/quality-gates/enforce`
* `POST /api/brain/tests/generate`
* `POST /api/brain/security/quickfix`
* `POST /api/brain/db/introspect-migrate`
* `POST /api/brain/pr/summarize`
* `POST /api/brain/tests/flaky/stabilize`
* `POST /api/brain/lint/cleanup`
* `POST /api/brain/refactor/plan`
* `POST /api/brain/release/checklist`
* `POST /api/brain/perf/hotfix`

> Todas as rotas exigem **auth + role admin** e registram evento em `brain_audit`.

---

**Pronto para desenvolvimento.** Este PRD foi **atualizado** para incluir **CopilotKit** como a implementação do Chat IA (admin‑only), o **mapeamento completo das tools** (server actions/rotas), **RBAC** e **templates automáticos** de PR/issue. A partir dele, o time pode implementar o dashboard e o copiloto administrado com segurança, auditabilidade e foco em qualidade contínua.
