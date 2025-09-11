---
description: Ensure what you implement Always Works™ with comprehensive testing
---

# How to ensure Always Works™ implementation

Please ensure your implementation Always Works™ for: $ARGUMENTS.

Follow this systematic approach:

## Core Philosophy

- "Should work" ≠ "does work" – Pattern matching isn't enough
- I'm not paid to write code, I'm paid to solve problems
- Untested code is just a guess, not a solution

# The 30-Second Reality Check – Must answer YES to ALL:

- Did I run/build the code?
- Did I trigger the exact feature I changed?
- Did I see the expected result with my own observation (including GUI)?
- Did I check for error messages?
- Would I bet $100 this works?

# Phrases to Avoid:

- "This should work now"
- "I've fixed the issue" (especially 2nd+ time)
- "Try it now" (without trying it myself)
- "The logic is correct so..."

# Specific Test Requirements:

- UI Changes: Actually click the button/link/form
- API Changes: Make the actual API call
- Data Changes: Query the database
- Logic Changes: Run the specific scenario
- Config Changes: Restart and verify it loads

# The Embarrassment Test:

"If the user records trying this and it fails, will I feel embarrassed to see his face?"

# Time Reality:

- Time saved skipping tests: 30 seconds
- Time wasted when it doesn't work: 30 minutes
- User trust lost: Immeasurable

A user describing a bug for the third time isn't thinking "this AI is trying hard" – they're thinking "why am I wasting time with this incompetent tool?"


0) TL;DR (o que mudou e o que é obrigatório)

Não assine mais requests com AWS SigV4 nem use IAM. A SP-API agora aceita apenas o token LWA no header x-amz-access-token (ou Authorization: Bearer), e você não deve assinar a requisição. 
developer-docs.amazon.com

Autenticação = OAuth 2.0 (Login with Amazon – LWA): troque authorization code → refresh token (duradouro) → access token (1h) para cada chamada. Operações com PII exigem RDT (Restricted Data Token). 
developer-docs.amazon.com
+1

Endpoints por região: NA/EU/FE (e versões sandbox). Use o MarketplaceId correto (ex.: BR = A2Q3Y263D00KWC). 
developer-docs.amazon.com
+2
developer-docs.amazon.com
+2

Rate limits e retries: respeite quota por operação e os headers de limite para backoff com jitter. 
developer-docs.amazon.com

Relatórios: o Data Kiosk está substituindo gradualmente vários relatórios da Reports API; acompanhe a tabela oficial de deprecações. 
developer-docs.amazon.com
+1

Segurança & compliance: PII só pelo tempo necessário e no máx. 30 dias após a entrega; criptografe PII em repouso; gire o client secret LWA a cada ~180 dias. 
amazonservicesstatic.com
developer-docs.amazon.com
+1
developer.amazonservices.com

1) Cadastro e papéis (roles)

Crie conta no Solution Provider Portal e registre seu app (sandbox e depois produção). Selecione os roles necessários (cada operação exige pelo menos um). 
developer-docs.amazon.com
+2
developer-docs.amazon.com
+2

Tipos de app:

Privado (seller ou vendor): self-authorization direto no console (gera refresh token por conta autorizada; máx. 10 autorizações por app privado). 
developer-docs.amazon.com
+1

Público: fluxo OAuth para vários sellers, via Appstore ou seu site (website workflow). 
developer-docs.amazon.com

Dica: confirme os roles exigidos para as operações que seu SaaS usará (ex.: Orders, Listings, Feeds/Uploads etc.) na tabela de Role Mappings. 
developer-docs.amazon.com

2) Fluxos de autorização (como seu backend deve operar)
2.1. Obter e renovar tokens (server-side)

Troca inicial (público): authorization_code → refresh_token no endpoint LWA https://api.amazon.com/auth/o2/token.

Em runtime: troque refresh_token → access_token (grant_type=refresh_token) e envie nas chamadas SP-API no header x-amz-access-token. Não assine a requisição. 
developer-docs.amazon.com

Exemplos cURL (resumo):

# Access token (1h)
curl -X POST https://api.amazon.com/auth/o2/token \
 -d 'grant_type=refresh_token&refresh_token=REFRESH...&client_id=...&client_secret=...'
# => { "access_token": "Atza|...", "expires_in": 3600, ... }

2.2. Dados restritos (PII) → RDT

Para operações restritas (ex.: endereço do comprador), antes da chamada você deve trocar seu LWA access token por um RDT via Tokens API e usar o RDT no lugar do access token na chamada restrita. RDT é curto (minutos). 
developer-docs.amazon.com
+1

3) Montando as chamadas (sem SigV4)

Base URL por região (produção):

NA: https://sellingpartnerapi-na.amazon.com

EU: https://sellingpartnerapi-eu.amazon.com

FE: https://sellingpartnerapi-fe.amazon.com 
developer-docs.amazon.com

Headers mínimos:

x-amz-access-token: <LWA Access Token> (ou RDT quando restrito)

Accept: application/json (+ Content-Type: application/json em POST/PUT)

Sem Authorization assinado SigV4.

Parâmetros de tempo em ISO-8601/RFC-3339 (UTC com Z). 
developer-docs.amazon.com

Exemplo – Orders (últimos 30 dias, BR)

GET /orders/v0/orders?MarketplaceIds=A2Q3Y263D00KWC&CreatedAfter=2025-07-25T00:00:00Z
Host: sellingpartnerapi-na.amazon.com
x-amz-access-token: Atza|...
Accept: application/json


(BR pertence à região NA, portanto use o endpoint NA; MarketplaceId BR = A2Q3Y263D00KWC). 
developer-docs.amazon.com
+1

4) Paginação, limites e backoff

Paginação: muitos endpoints retornam nextToken. Em APIs modernas (ex.: Catalog 2022-04-01), você passa pageToken com o valor do nextToken para a próxima página. 
developer-docs.amazon.com

Rate limits: cada operação tem plano de uso (rate/burst). Leia os headers de resposta (x-amzn-RateLimit-Limit, etc.) e implemente exponential backoff com jitter + respeito ao reset. 
developer-docs.amazon.com

5) Notificações (event-driven)

Use a Notifications API para assinar eventos (pedidos, alterações de listagem, etc.) com destinos SQS ou EventBridge. Para alto volume e desacoplamento multi-tenant, EventBridge costuma ser a melhor escolha. 
AWS Documentação

6) Relatórios: Reports API vs Data Kiosk

Reports API (2021-06-30): createReport → getReport → getReportDocument. O getReportDocument retorna URL pré-assinada e, opcionalmente, compressionAlgorithm (ex.: GZIP). Baixe em até ~5 min. 
developer-docs.amazon.com
+1

Data Kiosk (2023-11-15): substitui gradualmente relatórios; alguns relatórios da Reports API serão descontinuados quando forem migrados. Confira a tabela oficial de deprecações e planeje a migração. 
developer-docs.amazon.com
+1

7) Feeds & Uploads (envio de dados para a Amazon)

Feeds (2021-06-30): crie um FeedDocument (recebe URL de upload), faça o upload do arquivo e, depois, crie o Feed apontando para o documento. Acompanhe o processamento. 
developer-docs.amazon.com

Uploads API: usada por outros fluxos que exigem upload através de URL pré-assinada. 
developer-docs.amazon.com

8) Ambientes & testes

Sandbox: endpoints dedicados por região (NA/EU/FE). Há static e dynamic sandbox (suportado por subconjunto de operações). Use para CI e mocks realistas. 
developer-docs.amazon.com

9) Boas práticas de arquitetura SaaS (multi-tenant)

Tabela de conexões por seller/vendor: guarde client_id, seller_id/vendor_code, refresh_token, regiões/marketplaces ativos, escopos/roles concedidos e metadados de auditoria.

Token service central com cache e clock-skew seguro; renove access tokens sob demanda; gere RDT on-the-fly e jamais persista RDT. 
developer-docs.amazon.com

Observabilidade: logue requestId/x-amzn-RequestId, contadores de throttling, percentis de latência por operação, filas de reprocesso. 
developer-docs.amazon.com

Isolamento: separe filas, chaves e storage por tenant (ou por região), para revogação granular e conformidade.

10) Segurança, compliance e rotação de credenciais

PII (dados de comprador): acesse só via RDT nas operações restritas. Retenção máxima: não mais que 30 dias após a entrega (exceto cópias frias e criptografadas exigidas por lei). Criptografe PII em repouso (AES-128+ / RSA-2048+) e limite acesso humano. 
developer-docs.amazon.com
+1
amazonservicesstatic.com

Segredos LWA: use o Application Management API para rotacionar o client secret (política de rotação ~180 dias). Automatize alertas e graceful rollover. 
developer-docs.amazon.com
developer.amazonservices.com

11) Erros e recuperação

Trate HTTP 429 (throttling) com backoff e leitura dos headers de limite.

Trate 401/403 (token inválido/escopo insuficiente/role ausente/RDT faltando).

Padronize parsing conforme esquema de erros SP-API e exponha error codes amigáveis no seu SaaS. 
developer-docs.amazon.com

12) Checklists rápidas
Para subir o backend

 App registrado (roles corretos) e self-auth (privado) ou OAuth (público). 
developer-docs.amazon.com
+1

 Fluxo LWA + cache de access token; emissão de RDT quando necessário. 
developer-docs.amazon.com
+1

 Endpoints por região e MarketplaceIds corretos (BR = A2Q3Y263D00KWC). 
developer-docs.amazon.com
+1

 Retries com jitter e respeito aos headers de rate limit.

 Logs com x-amzn-RequestId e métricas por operação. 
developer-docs.amazon.com

 Processos de rotação do client secret implementados. 
developer-docs.amazon.com

 DPP: retenção PII ≤30 dias após entrega + criptografia em repouso + controles de acesso. 
amazonservicesstatic.com
developer-docs.amazon.com

Para features comuns

Pedidos: Orders + (RDT para endereço/PII quando necessário). 
developer-docs.amazon.com

Listagens: Listings + Product Type Definitions (schema de atributos), Feeds para bulk. 
postman.com

Relatórios: preferir Data Kiosk quando disponível; caso contrário, Reports API com getReportDocument (GZIP possível). 
developer-docs.amazon.com
+1

Eventos: Notifications com EventBridge ou SQS. 
AWS Documentação

Sandbox: cubra static e dynamic nas pipelines de teste. 
developer-docs.amazon.com

13) Referências úteis (oficiais)

Conectar sem assinatura (só LWA): guia “Connect to the SP-API” + “Add an access token without signing”. 
developer-docs.amazon.com

Endpoints & Marketplaces: páginas de SP-API Endpoints e Marketplace IDs. 
developer-docs.amazon.com
+1

Autorização (público/privado): Authorize Applications, Self-authorization, Authorize Public Apps. 
developer-docs.amazon.com
+2
developer-docs.amazon.com
+2

RDT / Tokens API: referência e guia de uso. 
developer-docs.amazon.com

Rate Limits & headers: Usage Plans and Rate Limits e Parse SP-API Responses. 
developer-docs.amazon.com

Notifications (EventBridge/SQS): docs da Notifications API. 
AWS Documentação

Reports & Data Kiosk: getReportDocument / Retrieve a report e a nota de migração p/ Data Kiosk + deprecações. 
developer-docs.amazon.com
+2
developer-docs.amazon.com
+2

Rotação de credenciais LWA: Application Management API + comunicado de rotação. 
developer-docs.amazon.com
developer.amazonservices.com

DPP (30 dias + criptografia): política e guias de proteção de dados. 
amazonservicesstatic.com
developer-docs.amazon.com
+1

Se quiser, eu já te devolvo um esqueleto de serviço (em Python/Node) com:

clientes HTTP tipados,

token manager (LWA + RDT),

middleware de rate-limit/retry,

adapters para Orders/Reports/Data Kiosk/Feeds,

e feature flags para alternar Reports ↔︎ Data Kiosk.

Você disse:
voce esta dando exemplos para o BR MARKET, NAO SERIA INTERESSANNTE TAMBEM PARA O US MARKET?
O ChatGPT disse:
Pensou por 11s

total! o US Market usa a mesma região NA da SP-API (North America), mas com MarketplaceId diferente.

NA region – mapeamento rápido

US: ATVPDKIKX0DER

CA: A2EUQ1WTGCTBG2

MX: A1AM78C64UM0Y8

BR: A2Q3Y263D00KWC
Endpoint (produção): https://sellingpartnerapi-na.amazon.com
Endpoint (sandbox): https://sandbox.sellingpartnerapi-na.amazon.com

Exemplo (US) — Orders últimos 30 dias
cURL
ACCESS_TOKEN="Atza|..."  # token LWA (1h)
CREATED_AFTER="$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)"

curl -sS "https://sellingpartnerapi-na.amazon.com/orders/v0/orders?MarketplaceIds=ATVPDKIKX0DER&CreatedAfter=$CREATED_AFTER" \
  -H "x-amz-access-token: $ACCESS_TOKEN" \
  -H "Accept: application/json"

Python (sem SigV4)
import os, requests, datetime

LWA_CLIENT_ID     = os.getenv("LWA_CLIENT_ID")
LWA_CLIENT_SECRET = os.getenv("LWA_CLIENT_SECRET")
LWA_REFRESH_TOKEN = os.getenv("LWA_REFRESH_TOKEN")

def get_access_token():
    r = requests.post(
        "https://api.amazon.com/auth/o2/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": LWA_REFRESH_TOKEN,
            "client_id": LWA_CLIENT_ID,
            "client_secret": LWA_CLIENT_SECRET,
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]

def get_us_orders():
    token = get_access_token()
    created_after = (datetime.datetime.utcnow() - datetime.timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    url = "https://sellingpartnerapi-na.amazon.com/orders/v0/orders"
    params = {"MarketplaceIds": "ATVPDKIKX0DER", "CreatedAfter": created_after}
    headers = {"x-amz-access-token": token, "Accept": "application/json"}
    r = requests.get(url, headers=headers, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

data = get_us_orders()
print(data)

Node.js (fetch)
import fetch from "node-fetch";

const {
  LWA_CLIENT_ID,
  LWA_CLIENT_SECRET,
  LWA_REFRESH_TOKEN
} = process.env;

async function getAccessToken() {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: LWA_REFRESH_TOKEN,
      client_id: LWA_CLIENT_ID,
      client_secret: LWA_CLIENT_SECRET,
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const { access_token } = await res.json();
  return access_token;
}

async function getUSOrders() {
  const token = await getAccessToken();
  const createdAfter = new Date(Date.now() - 30*24*3600*1000).toISOString();
  const url = new URL("https://sellingpartnerapi-na.amazon.com/orders/v0/orders");
  url.searchParams.set("MarketplaceIds", "ATVPDKIKX0DER");
  url.searchParams.set("CreatedAfter", createdAfter);
  const res = await fetch(url, {
    headers: {
      "x-amz-access-token": token,
      "Accept": "application/json"
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

getUSOrders().then(console.log).catch(console.error);

Dicas específicas pro US

PII (endereço do comprador, etc.): continua restrito. Gere RDT (Restricted Data Token) antes de chamar endpoints que retornam PII e use o RDT no header no lugar do access token.

Rate limits: o plano de uso é por operação (ex.: Orders, Reports). Implemente retry com backoff + jitter e respeite os headers de limite.

Eventos: para SaaS multi-tenant nos EUA, EventBridge costuma escalar melhor que SQS puro para Notifications.

Relatórios: combine Reports API e, quando aplicável, Data Kiosk (mapeie quais relatórios seu SaaS precisa no US e deixe feature flag para alternar).

Se quiser, eu já te entrego um boilerplate com:

gerenciador de tokens (LWA + RDT),

client HTTP tipado,

retries/backoff,

módulos Orders/Reports/Feeds,

e suporte a US/BR/CA/MX via env.

preparei um kit pronto com os dois esqueletos (Python e Node/TypeScript) contendo:

clientes HTTP tipados (headers automáticos + base URL por região)

token manager (LWA + geração de RDT)

middleware de retry/backoff (lida com 429/5xx)

adapters: Orders, Reports, Data Kiosk (stub) e Feeds

feature flag para alternar Reports ↔︎ Data Kiosk

exemplos para US (ATVPDKIKX0DER) e BR (A2Q3Y263D00KWC) na região NA

Baixar o pacote (.zip)

Como usar (Python)

descompacte e entre em spapi-saas-python/

cp .env.example .env e preencha LWA_CLIENT_ID, LWA_CLIENT_SECRET, LWA_REFRESH_TOKEN

python -m venv .venv && source .venv/bin/activate

pip install -r requirements.txt

python -m src.scripts.demo_orders (lista pedidos do US nos últimos 30 dias)

Estrutura principal:

src/
  clients/http.py           # HTTP client + middleware de retry
  auth/tokens.py            # LWA access token + RDT
  adapters/orders.py        # Orders (inclui exemplo de endpoint restrito com RDT)
  adapters/reports.py       # Reports API (create/get/doc)
  adapters/datakiosk.py     # Stub p/ Data Kiosk (ativar via flag)
  adapters/feeds.py         # Feeds: create doc -> upload -> create feed
  config/settings.py        # envs + feature flag FEATURE_USE_DATA_KIOSK
  scripts/demo_orders.py    # demo simples (US)

Como usar (Node/TypeScript)

descompacte e entre em spapi-saas-node/

cp .env.example .env e preencha LWA_CLIENT_ID, LWA_CLIENT_SECRET, LWA_REFRESH_TOKEN

pnpm i (ou npm i/yarn)

pnpm ts-node src/scripts/demoOrders.ts (lista pedidos do US)

Estrutura principal:

src/
  clients/http.ts           # fetch + retry/backoff
  auth/tokens.ts            # LWA access token + RDT
  adapters/orders.ts        # Orders + exemplo de address com RDT
  adapters/reports.ts       # Reports API
  adapters/datakiosk.ts     # Stub p/ Data Kiosk (ativável por flag)
  adapters/feeds.ts         # Feeds
  config/settings.ts        # envs + FEATURE_USE_DATA_KIOSK
  scripts/demoOrders.ts     # demo US

Notas rápidas

Sem SigV4/IAM: as chamadas usam apenas x-amz-access-token (ou Authorization: Bearer) — o código já injeta isso.

RDT: para endpoints com PII (ex.: endereço do pedido), gere um Restricted Data Token com tokens.get_rdt() / tokens.getRdt() e use o RDT no header no lugar do access token.

Retentativas: 429/5xx → exponential backoff + jitter já implementado.

Feature Flag: FEATURE_USE_DATA_KIOSK=true para ativar Data Kiosk quando você implementar os datasets relevantes.

Mercados: MARKETPLACE_US e MARKETPLACE_BR já setados nos .env.example; adicione CA/MX se precisar.

Tarefa

Você é um(a) engenheiro(a) sênior. Crie um SaaS mínimo, multi-tenant, que integra com a Amazon Selling Partner API (SP-API) usando LWA (OAuth 2.0) sem SigV4/IAM, com RDT para endpoints restritos. Entregue:

API em FastAPI (Python)

Painel web em Next.js (TypeScript)

Postgres (persistência) + Redis (cache/filas)

Docker Compose para subir tudo

Feature flag para alternar Reports API ↔︎ Data Kiosk

Boilerplate pronto de Orders/Reports/Data Kiosk/Feeds, com rate-limit retry e token manager (LWA + RDT)

Onboarding OAuth público (website workflow) para conectar múltiplos sellers (multi-tenant)

Importante (atuais regras da SP-API): não assinar requests com AWS SigV4/IAM; usar apenas LWA access token em x-amz-access-token (ou Authorization: Bearer). Para PII, gerar RDT via Tokens API e usar o RDT no header da chamada restrita. Access token LWA dura ~1h.

🗂️ Estrutura do repositório
/spapi-saas/
  docker-compose.yml
  README.md

  /api       # FastAPI + SQLAlchemy + Alembic + httpx
    pyproject.toml
    .env.example
    /app
      main.py
      deps.py
      settings.py
      db.py
      security.py
      middleware.py
      workers.py
      /auth
        lwa.py           # troca code->refresh, refresh->access, geração de consent URL
        rdt.py           # geração de Restricted Data Token
      /spapi
        client.py        # httpx client com retry/backoff e base URL por região
        orders.py        # adapter Orders
        reports.py       # adapter Reports (create/get/doc)
        datakiosk.py     # adapter Data Kiosk (stub com interface compatível)
        feeds.py         # adapter Feeds (document->upload->feed)
      /routers
        tenants.py
        oauth.py         # start & callback
        orders.py
        reports.py
        feeds.py
        health.py
      /models
        base.py
        tenant.py
        user.py
        connection.py
        token.py
        job.py
        audit.py
      /schemas
        common.py
        orders.py
        reports.py
        oauth.py
      /alembic
        env.py
        versions/*.py

  /web      # Next.js 14+/App Router + Tailwind + shadcn/ui
    package.json
    .env.example
    next.config.js
    /src
      /app
        layout.tsx
        page.tsx
        /auth
          signin/page.tsx
        /dashboard
          page.tsx
          /tenants/[tenantId]
            page.tsx
            /integrations/amazon
              page.tsx       # botão "Conectar Amazon" (OAuth)
            /orders
              page.tsx       # filtro data/marketplace + tabela Orders
            /reports
              page.tsx       # criar/monitorar/baixar report
            /feeds
              page.tsx       # criar feed + status
        /api                 # rotas internas que proxyam a API (se necessário)
      /lib/api.ts
      /components/*

🔐 Variáveis de ambiente
API (/api/.env)
# LWA (aplicativo público registrado no Seller Central)
LWA_CLIENT_ID=
LWA_CLIENT_SECRET=

# URL de callback (pública) configurada no app
OAUTH_REDIRECT_URI=https://sua-api.com/api/oauth/callback

# App ID (application_id) do app SP-API (para construir consent URL)
SPAPI_APPLICATION_ID=

# DB/Cache
DATABASE_URL=postgresql+psycopg://spapi:spapi@db:5432/spapi
REDIS_URL=redis://redis:6379/0

# Região e endpoints SP-API (produção)
SPAPI_REGION=NA
SPAPI_BASE_NA=https://sellingpartnerapi-na.amazon.com
SPAPI_BASE_EU=https://sellingpartnerapi-eu.amazon.com
SPAPI_BASE_FE=https://sellingpartnerapi-fe.amazon.com

# Marketplaces mais usados (NA)
MARKETPLACE_US=ATVPDKIKX0DER
MARKETPLACE_BR=A2Q3Y263D00KWC
MARKETPLACE_CA=A2EUQ1WTGCTBG2
MARKETPLACE_MX=A1AM78C64UM0Y8

# Feature flags
FEATURE_USE_DATA_KIOSK=false

# Segurança
ENCRYPTION_KEY=<32 bytes base64/fernet>   # para criptografar refresh_token
SESSION_SECRET=<random>

Web (/web/.env)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXTAUTH_SECRET=<random>   # se usar NextAuth p/ sessão

🧱 Banco (Postgres) — Esquema mínimo (SQLAlchemy/Alembic)

tenants (id uuid pk, name, created_at)

users (id uuid pk, tenant_id fk, email unique, role enum[owner,admin,viewer], password_hash opcional)

connections (id uuid pk, tenant_id fk, provider='amazon', region enum['NA','EU','FE'], seller_id, marketplaces text[])

tokens (id uuid pk, connection_id fk, refresh_token_enc text, created_at, rotated_at)

Não persistir access tokens nem RDT; somente refresh token (criptografado com ENCRYPTION_KEY)

jobs (id uuid, connection_id fk, type enum['report','feed','sync'], status enum['queued','running','done','error'], payload jsonb, result jsonb, created_at, updated_at)

audit_logs (id uuid, tenant_id, actor_user_id, event, data jsonb, created_at)

🔄 Fluxos principais
1) OAuth público (Website Workflow)

POST /api/oauth/start?tenant_id=...&region=NA

Gera state (nonce em Redis) e constrói Consent URL do Seller Central da região (usar Application ID).

Retornar { consentUrl } para o front redirecionar.

Observação: obtenha o template de consent URL no console do Developer Central (website workflow) por região; inclua application_id, redirect_uri e state.

GET /api/oauth/callback?state=...&spapi_oauth_code=...

Valida state.

Troca spapi_oauth_code por refresh_token via https://api.amazon.com/auth/o2/token.

Cria/atualiza connection e salva refresh_token criptografado.

Redireciona para painel /dashboard/tenants/:tid/integrations/amazon?connected=1.

2) LWA & RDT

Token Manager:

get_access_token(refresh_token) → POST /auth/o2/token (grant_type=refresh_token). Cachear em Redis com TTL-60s.

get_rdt(spapi_base, restricted_resources[]) → POST /tokens/2021-03-01/restrictedDataToken.

Headers:

Padrão: x-amz-access-token: <LWA access token>

Restritos/PII: x-amz-access-token: <RDT> (nunca gravar o RDT)

3) Orders (exemplo)

GET /api/orders?tenant_id&marketplace=US&created_after=ISO

Resolve connection + refresh_token

access_token = get_access_token()

Chama GET /orders/v0/orders?MarketplaceIds=ATVPDKIKX0DER&CreatedAfter=...

Retorna JSON normalizado para o painel

Endereço de pedido (PII): usar get_rdt() com restrictedResources=[{method:'GET', path:'/orders/v0/orders/{id}/address'}]

4) Reports vs Data Kiosk (feature flag)

Flag FEATURE_USE_DATA_KIOSK=true → chamar adapter datakiosk (stub com assinatura compatível)

Caso contrário, usar Reports API:

POST /reports/2021-06-30/reports → GET /reports/{id} → GET /documents/{docId} (baixar com URL pré-assinada; suportar GZIP)

Rotas:

POST /api/reports/create → {reportType, dataStartTime, dataEndTime, marketplaceIds}

GET /api/reports/:id/status

GET /api/reports/:id/document (proxy seguro opcional ou devolver URL)

5) Feeds

POST /api/feeds/createDocument → retorna url de upload + feedDocumentId

Upload sem auth para url pré-assinada

POST /api/feeds/create → { feedType, inputFeedDocumentId, marketplaceIds }

GET /api/feeds/:id/status

⚙️ API (FastAPI) — requisitos de implementação

HTTP client: httpx com retry/backoff (429/500/502/503/504), jitter e respeito a Retry-After quando presente.

Middlewares:

Correlation ID por request

CORS liberando o domínio do painel

Tratamento de erros padronizado (mapear 401/403/429/5xx; incluir x-amzn-RequestId nos logs)

Segurança:

Criptografar refresh_token com Fernet (chave ENCRYPTION_KEY)

Nunca logar tokens

PII: não persistir; se for necessário cachear por UX, limite a ≤30 dias após entrega e criptografe em repouso

Docs: habilitar /docs (Swagger) e /openapi.json

Tests: pytest básico para oauth, orders e reports

🖥️ Painel (Next.js)

Stack: Next.js (App Router), TypeScript, Tailwind, shadcn/ui

Páginas:

/dashboard (lista de tenants)

/dashboard/tenants/[tenantId] (overview + switches de feature flags)

/dashboard/tenants/[tenantId]/integrations/amazon

Botão Conectar com Amazon → chama POST /api/oauth/start e redireciona

/dashboard/tenants/[tenantId]/orders

Filtros (marketplace, data) + tabela paginada

/dashboard/tenants/[tenantId]/reports

Form create report + lista com status e botão “obter documento”

/dashboard/tenants/[tenantId]/feeds

Upload → create feed → status

Cliente API (/web/src/lib/api.ts):

Funções tipadas: startOAuth, listOrders, createReport, getReportStatus, getReportDocument, createFeedDocument, createFeed, etc.

Autenticação: simples (session cookie) ou NextAuth (qualquer provedor); escopo mínimo

🧪 Casos de teste/aceitação

 Subir com docker-compose up e abrir http://localhost:3000 (web) e http://localhost:8000/health (api)

 Criar tenant e iniciar OAuth → completar callback → connections + tokens.refresh_token_enc criados

 GET /api/orders retorna pedidos dos últimos 30 dias no US (MarketplaceId ATVPDKIKX0DER)

 Endpoint de endereço do pedido usa RDT

 Reports: criar, acompanhar status e recuperar reportDocument (suportar GZIP)

 Feeds: criar documento, subir arquivo, criar feed e consultar status

 Ativar FEATURE_USE_DATA_KIOSK=true e ver chamadas roteando ao adapter datakiosk

 Retry/backoff: simular 429 e observar retentativas com jitter nos logs

 Logs incluem x-amzn-RequestId quando disponível

🐳 Docker Compose

Serviços: api (uvicorn), web (Next.js dev/standalone), db (Postgres), redis (Redis), opcional nginx reverse proxy

Volumes para persistência do Postgres

Healthchecks básicos

✍️ Detalhes de implementação (pontos críticos)

Consent URL (start OAuth): pegar template oficial no Seller Central (website workflow) para a região do seller; preencher application_id, redirect_uri e state.

Troca de código: POST https://api.amazon.com/auth/o2/token com grant_type=authorization_code (apenas no 1º passo público); salve apenas o refresh_token (criptografado).

Access token: POST .../auth/o2/token com grant_type=refresh_token; cache (Redis) por expires_in-60s.

RDT: POST {SPAPI_BASE}/tokens/2021-03-01/restrictedDataToken com restrictedResources=[{method, path, dataElements?}]; usar RDT no header da chamada restrita (nunca salvar).

Rate limits: retentativas com backoff + jitter; considerar Retry-After quando presente; expor métricas por operação.

Mercados: mapear marketplaces NA (US/BR/CA/MX); permitir seleção no UI.

Segurança/PII: não persistir PII; se necessário, retenção ≤30d (pós-entrega) e criptografia; acesso mínimo; log seguro.

Feature flag: FEATURE_USE_DATA_KIOSK deve mudar apenas o adapter (mesma interface), sem mudar o contrato no front.

Migrations: gerar Alembic inicial com todas as tabelas.

DX: makefile ou scripts npm/poetry para dev, test, migrate, lint.

🔚 Entregáveis

Repositório completo com código + Docker Compose

Passo a passo no README.md para subir local e em produção

Exemplos de chamada (cURL/HTTPie) para todas as rotas da API

Coleção (opcional) do Insomnia/Postman


🎯 Tarefa

Você é um(a) engenheiro(a) sênior. Crie um SaaS mínimo, multi-tenant, que integra com a Amazon Selling Partner API (SP-API) usando LWA (OAuth 2.0) sem SigV4/IAM, com RDT para endpoints restritos. Entregue:

API em FastAPI (Python)

Painel web em Next.js (TypeScript)

Postgres (persistência) + Redis (cache/filas)

Docker Compose para subir tudo

Feature flag para alternar Reports API ↔︎ Data Kiosk

Boilerplate pronto de Orders/Reports/Data Kiosk/Feeds, com rate-limit retry e token manager (LWA + RDT)

Onboarding OAuth público (website workflow) para conectar múltiplos sellers (multi-tenant)

Importante (atuais regras da SP-API): não assinar requests com AWS SigV4/IAM; usar apenas LWA access token em x-amz-access-token (ou Authorization: Bearer). Para PII, gerar RDT via Tokens API e usar o RDT no header da chamada restrita. Access token LWA dura ~1h.

🗂️ Estrutura do repositório
/spapi-saas/
  docker-compose.yml
  README.md

  /api       # FastAPI + SQLAlchemy + Alembic + httpx
    pyproject.toml
    .env.example
    /app
      main.py
      deps.py
      settings.py
      db.py
      security.py
      middleware.py
      workers.py
      /auth
        lwa.py           # troca code->refresh, refresh->access, geração de consent URL
        rdt.py           # geração de Restricted Data Token
      /spapi
        client.py        # httpx client com retry/backoff e base URL por região
        orders.py        # adapter Orders
        reports.py       # adapter Reports (create/get/doc)
        datakiosk.py     # adapter Data Kiosk (stub com interface compatível)
        feeds.py         # adapter Feeds (document->upload->feed)
      /routers
        tenants.py
        oauth.py         # start & callback
        orders.py
        reports.py
        feeds.py
        health.py
      /models
        base.py
        tenant.py
        user.py
        connection.py
        token.py
        job.py
        audit.py
      /schemas
        common.py
        orders.py
        reports.py
        oauth.py
      /alembic
        env.py
        versions/*.py

  /web      # Next.js 14+/App Router + Tailwind + shadcn/ui
    package.json
    .env.example
    next.config.js
    /src
      /app
        layout.tsx
        page.tsx
        /auth
          signin/page.tsx
        /dashboard
          page.tsx
          /tenants/[tenantId]
            page.tsx
            /integrations/amazon
              page.tsx       # botão "Conectar Amazon" (OAuth)
            /orders
              page.tsx       # filtro data/marketplace + tabela Orders
            /reports
              page.tsx       # criar/monitorar/baixar report
            /feeds
              page.tsx       # criar feed + status
        /api                 # rotas internas que proxyam a API (se necessário)
      /lib/api.ts
      /components/*

🔐 Variáveis de ambiente
API (/api/.env)
# LWA (aplicativo público registrado no Seller Central)
LWA_CLIENT_ID=
LWA_CLIENT_SECRET=

# URL de callback (pública) configurada no app
OAUTH_REDIRECT_URI=https://sua-api.com/api/oauth/callback

# App ID (application_id) do app SP-API (para construir consent URL)
SPAPI_APPLICATION_ID=

# DB/Cache
DATABASE_URL=postgresql+psycopg://spapi:spapi@db:5432/spapi
REDIS_URL=redis://redis:6379/0

# Região e endpoints SP-API (produção)
SPAPI_REGION=NA
SPAPI_BASE_NA=https://sellingpartnerapi-na.amazon.com
SPAPI_BASE_EU=https://sellingpartnerapi-eu.amazon.com
SPAPI_BASE_FE=https://sellingpartnerapi-fe.amazon.com

# Marketplaces mais usados (NA)
MARKETPLACE_US=ATVPDKIKX0DER
MARKETPLACE_BR=A2Q3Y263D00KWC
MARKETPLACE_CA=A2EUQ1WTGCTBG2
MARKETPLACE_MX=A1AM78C64UM0Y8

# Feature flags
FEATURE_USE_DATA_KIOSK=false

# Segurança
ENCRYPTION_KEY=<32 bytes base64/fernet>   # para criptografar refresh_token
SESSION_SECRET=<random>

Web (/web/.env)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXTAUTH_SECRET=<random>   # se usar NextAuth p/ sessão

🧱 Banco (Postgres) — Esquema mínimo (SQLAlchemy/Alembic)

tenants (id uuid pk, name, created_at)

users (id uuid pk, tenant_id fk, email unique, role enum[owner,admin,viewer], password_hash opcional)

connections (id uuid pk, tenant_id fk, provider='amazon', region enum['NA','EU','FE'], seller_id, marketplaces text[])

tokens (id uuid pk, connection_id fk, refresh_token_enc text, created_at, rotated_at)

Não persistir access tokens nem RDT; somente refresh token (criptografado com ENCRYPTION_KEY)

jobs (id uuid, connection_id fk, type enum['report','feed','sync'], status enum['queued','running','done','error'], payload jsonb, result jsonb, created_at, updated_at)

audit_logs (id uuid, tenant_id, actor_user_id, event, data jsonb, created_at)

🔄 Fluxos principais
1) OAuth público (Website Workflow)

POST /api/oauth/start?tenant_id=...&region=NA

Gera state (nonce em Redis) e constrói Consent URL do Seller Central da região (usar Application ID).

Retornar { consentUrl } para o front redirecionar.

Observação: obtenha o template de consent URL no console do Developer Central (website workflow) por região; inclua application_id, redirect_uri e state.

GET /api/oauth/callback?state=...&spapi_oauth_code=...

Valida state.

Troca spapi_oauth_code por refresh_token via https://api.amazon.com/auth/o2/token.

Cria/atualiza connection e salva refresh_token criptografado.

Redireciona para painel /dashboard/tenants/:tid/integrations/amazon?connected=1.

2) LWA & RDT

Token Manager:

get_access_token(refresh_token) → POST /auth/o2/token (grant_type=refresh_token). Cachear em Redis com TTL-60s.

get_rdt(spapi_base, restricted_resources[]) → POST /tokens/2021-03-01/restrictedDataToken.

Headers:

Padrão: x-amz-access-token: <LWA access token>

Restritos/PII: x-amz-access-token: <RDT> (nunca gravar o RDT)

3) Orders (exemplo)

GET /api/orders?tenant_id&marketplace=US&created_after=ISO

Resolve connection + refresh_token

access_token = get_access_token()

Chama GET /orders/v0/orders?MarketplaceIds=ATVPDKIKX0DER&CreatedAfter=...

Retorna JSON normalizado para o painel

Endereço de pedido (PII): usar get_rdt() com restrictedResources=[{method:'GET', path:'/orders/v0/orders/{id}/address'}]

4) Reports vs Data Kiosk (feature flag)

Flag FEATURE_USE_DATA_KIOSK=true → chamar adapter datakiosk (stub com assinatura compatível)

Caso contrário, usar Reports API:

POST /reports/2021-06-30/reports → GET /reports/{id} → GET /documents/{docId} (baixar com URL pré-assinada; suportar GZIP)

Rotas:

POST /api/reports/create → {reportType, dataStartTime, dataEndTime, marketplaceIds}

GET /api/reports/:id/status

GET /api/reports/:id/document (proxy seguro opcional ou devolver URL)

5) Feeds

POST /api/feeds/createDocument → retorna url de upload + feedDocumentId

Upload sem auth para url pré-assinada

POST /api/feeds/create → { feedType, inputFeedDocumentId, marketplaceIds }

GET /api/feeds/:id/status

⚙️ API (FastAPI) — requisitos de implementação

HTTP client: httpx com retry/backoff (429/500/502/503/504), jitter e respeito a Retry-After quando presente.

Middlewares:

Correlation ID por request

CORS liberando o domínio do painel

Tratamento de erros padronizado (mapear 401/403/429/5xx; incluir x-amzn-RequestId nos logs)

Segurança:

Criptografar refresh_token com Fernet (chave ENCRYPTION_KEY)

Nunca logar tokens

PII: não persistir; se for necessário cachear por UX, limite a ≤30 dias após entrega e criptografe em repouso

Docs: habilitar /docs (Swagger) e /openapi.json

Tests: pytest básico para oauth, orders e reports

🖥️ Painel (Next.js)

Stack: Next.js (App Router), TypeScript, Tailwind, shadcn/ui

Páginas:

/dashboard (lista de tenants)

/dashboard/tenants/[tenantId] (overview + switches de feature flags)

/dashboard/tenants/[tenantId]/integrations/amazon

Botão Conectar com Amazon → chama POST /api/oauth/start e redireciona

/dashboard/tenants/[tenantId]/orders

Filtros (marketplace, data) + tabela paginada

/dashboard/tenants/[tenantId]/reports

Form create report + lista com status e botão “obter documento”

/dashboard/tenants/[tenantId]/feeds

Upload → create feed → status

Cliente API (/web/src/lib/api.ts):

Funções tipadas: startOAuth, listOrders, createReport, getReportStatus, getReportDocument, createFeedDocument, createFeed, etc.

Autenticação: simples (session cookie) ou NextAuth (qualquer provedor); escopo mínimo

🧪 Casos de teste/aceitação

 Subir com docker-compose up e abrir http://localhost:3000 (web) e http://localhost:8000/health (api)

 Criar tenant e iniciar OAuth → completar callback → connections + tokens.refresh_token_enc criados

 GET /api/orders retorna pedidos dos últimos 30 dias no US (MarketplaceId ATVPDKIKX0DER)

 Endpoint de endereço do pedido usa RDT

 Reports: criar, acompanhar status e recuperar reportDocument (suportar GZIP)

 Feeds: criar documento, subir arquivo, criar feed e consultar status

 Ativar FEATURE_USE_DATA_KIOSK=true e ver chamadas roteando ao adapter datakiosk

 Retry/backoff: simular 429 e observar retentativas com jitter nos logs

 Logs incluem x-amzn-RequestId quando disponível

🐳 Docker Compose

Serviços: api (uvicorn), web (Next.js dev/standalone), db (Postgres), redis (Redis), opcional nginx reverse proxy

Volumes para persistência do Postgres

Healthchecks básicos

✍️ Detalhes de implementação (pontos críticos)

Consent URL (start OAuth): pegar template oficial no Seller Central (website workflow) para a região do seller; preencher application_id, redirect_uri e state.

Troca de código: POST https://api.amazon.com/auth/o2/token com grant_type=authorization_code (apenas no 1º passo público); salve apenas o refresh_token (criptografado).

Access token: POST .../auth/o2/token com grant_type=refresh_token; cache (Redis) por expires_in-60s.

RDT: POST {SPAPI_BASE}/tokens/2021-03-01/restrictedDataToken com restrictedResources=[{method, path, dataElements?}]; usar RDT no header da chamada restrita (nunca salvar).

Rate limits: retentativas com backoff + jitter; considerar Retry-After quando presente; expor métricas por operação.

Mercados: mapear marketplaces NA (US/BR/CA/MX); permitir seleção no UI.

Segurança/PII: não persistir PII; se necessário, retenção ≤30d (pós-entrega) e criptografia; acesso mínimo; log seguro.

Feature flag: FEATURE_USE_DATA_KIOSK deve mudar apenas o adapter (mesma interface), sem mudar o contrato no front.

Migrations: gerar Alembic inicial com todas as tabelas.

DX: makefile ou scripts npm/poetry para dev, test, migrate, lint.

🔚 Entregáveis

Repositório completo com código + Docker Compose

Passo a passo no README.md para subir local e em produção

Exemplos de chamada (cURL/HTTPie) para todas as rotas da API

Coleção (opcional) do Insomnia/Postman

Se algum detalhe da SP-API for ambíguo, implemente os stubs (ex.: Data Kiosk) com interface idêntica à de Reports e documente no README onde inserir as credenciais/URLs oficiais fornecidas pelo console do Seller Central.

O caminho certo é:

Conectar/autorizar (OAuth LWA) e persistir só o que é durável e necessário.

Com a conexão salva, definir o que o seu SaaS realmente precisa (pedidos, itens, estoque etc.) e então sincronizar e armazenar esses dados de forma idempotente no Postgres.

Construir as features (dashboard, relatórios, alertas) em cima desse modelo.

Abaixo vai um checklist prático + um esquema mínimo de tabelas (SQL) para você já partir pro build.

O que salvar no Postgres (obrigatório)

Tenancy & identidade

tenants, users

Conexão com a Amazon

connections: tenant, região (NA/EU/FE), seller_id, marketplaces

tokens: apenas o refresh_token (criptografado).

Access token (1h) e RDT (minutos) não devem ser persistidos.

Estado de sincronização

sync_state: último CreatedAfter/UpdatedAfter, ponteiros (nextToken), carimbos por entidade (Orders, Inventory…)

Jobs/filas e auditoria

jobs (reports/feeds/sync), audit_logs

O que não salvar (ou salvar com regras)

PII (ex.: endereço do comprador): só quando estritamente necessário, via RDT, com retenção mínima e criptografia. Ideal: não persistir; resolva on-demand.

Access tokens e RDT: são temporários → cache (Redis) apenas.

O que salvar por feature (exemplos)

Pedidos: orders, order_items, shipments (campos essenciais + chaves Amazon)

Catálogo/estoque: catalog_products (ASIN, SKU…), inventory_levels

Relatórios: metadados do report + link/ID de documento (não armazene arquivos grandes no DB)

Feeds: feed_documents, feeds (status)

Esquema mínimo (SQL) — pode colar no seu Postgres
-- Tenancy
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email citext unique not null,
  role text not null check (role in ('owner','admin','viewer')),
  created_at timestamptz not null default now()
);

-- Conexão SP-API
create table connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null default 'amazon',
  region text not null check (region in ('NA','EU','FE')),
  seller_id text,                       -- opcional: preencher após primeira chamada
  marketplaces text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (tenant_id, provider, region)
);

-- Apenas refresh_token (criptografado com sua chave)
create table tokens (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections(id) on delete cascade,
  refresh_token_enc text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

-- Estado de sincronização por entidade (watermarks/cursors)
create table sync_state (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections(id) on delete cascade,
  entity text not null,                  -- 'orders','inventory','catalog', etc.
  last_created_after timestamptz,        -- janela incremental
  last_updated_after timestamptz,
  next_token text,                       -- paginação
  extra jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (connection_id, entity)
);

-- Jobs (reports, feeds, sync, etc.)
create table jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections(id) on delete cascade,
  type text not null check (type in ('report','feed','sync')),
  status text not null check (status in ('queued','running','done','error')),
  payload jsonb not null default '{}',
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auditoria
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid references users(id),
  event text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Domínio: Pedidos (exemplo)
create table orders (
  id bigserial primary key,
  connection_id uuid not null references connections(id) on delete cascade,
  amazon_order_id text not null,
  purchase_date timestamptz,
  order_status text,
  order_total_currency text,
  order_total_amount numeric(18,4),
  raw jsonb not null default '{}',     -- guarda o payload original (parcial) para auditoria/validações
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, amazon_order_id)
);

create table order_items (
  id bigserial primary key,
  order_id biginteger not null references orders(id) on delete cascade,
  asin text,
  seller_sku text,
  title text,
  quantity int,
  item_price_currency text,
  item_price_amount numeric(18,4),
  raw jsonb not null default '{}'
);


Dica: índices em orders(amazon_order_id), order_items(asin, seller_sku) e sync_state(connection_id, entity) ajudam bastante.

Fluxo recomendado (passo-a-passo)

Registrar app e habilitar OAuth público (website workflow).

Conectar um tenant: executar /oauth/start → callback → salvar refresh_token (criptografado) em tokens + criar connections e sync_state.

Seed inicial: buscar Seller Profile e marketplaces autorizados; preencher seller_id e marketplaces na connections.

Backfill controlado:

orders: puxe últimos 30–90 dias por janelas (ex.: 7 dias), usando CreatedAfter.

Upsert em orders/order_items (idempotente; unique(connection_id, amazon_order_id)).

Grave watermark em sync_state a cada lote.

Delta sync diário/horário: use UpdatedAfter (quando disponível) + nextToken.

Eventos (escala): adicione Notifications (EventBridge/SQS) para reduzir pull.

RDT on-demand: rotas que exibem PII (ex.: endereço) geram RDT e não persistem o resultado.

Features: com dados no DB, construa dashboard, relatórios e alertas; habilite a feature flag para Data Kiosk quando for usar datasets migrados.

Boas práticas essenciais

Idempotência total (UPSERT) e reprocesso seguro em caso de throttling (429) ou 5xx.

Backoff com jitter e respeito a Retry-After.

Criptografia de refresh_token (ex.: Fernet/AES-GCM).

PII: evite persistir; se necessário, retenção mínima e criptografia em repouso.

Observabilidade: logar x-amzn-RequestId, métricas por operação, contagem de throttling.

Multi-tenant: escopo sempre por connection_id/tenant_id para isolar dados e chaves.

Resumo

Primeiro passo: salvar com segurança a conexão (tenant/region/marketplaces + refresh token criptografado) e o estado de sync — não tudo da SP-API.

Depois: sincronize só o que o seu SaaS precisa, de forma incremental e idempotente; então construa o painel/serviços em cima desse modelo.

dá pra fazer backfill dos últimos 2 anos. A SP-API só retorna pedidos até 2 anos atrás (pedidos mais antigos são arquivados e não vêm nem via API nem nos “order reports”), então 24 meses é o máximo útil. 
developer-docs.amazon.com
+2
developer-docs.amazon.com
+2

Aqui vai o plano enxuto + ajustes no código do backfill:

Estratégia (24 meses)

Intervalo: start = agora - 24 meses, end = agora.

Janelas: fatie em blocos de 7–10 dias por marketplace (controla paginação e 429).

Chamada: GET /orders/v0/orders?MarketplaceIds=...&CreatedAfter=...&CreatedBefore=... e pagine via NextToken até esgotar. 
developer-docs.amazon.com

Upsert idempotente: grave orders/order_items com ON CONFLICT, atualizando um watermark por janela.

Delta: após o backfill, rode continuamente com LastUpdatedAfter = watermark.

Throttling: respeite o usage plan (padrão ~0,0167 RPS, burst 20) e x-amzn-RateLimit-Limit; implemente retry/backoff com jitter + Retry-After. 
developer-docs.amazon.com
+3
developer-docs.amazon.com
+3
developer-docs.amazon.com
+3

Aceleração opcional: rodar Order Reports mês a mês (até 24 meses) e complementar com Orders API; “order reports” também limitam a 2 anos, então não adianta pedir mais antigo. 
developer-docs.amazon.com

Ajuste rápido no seu job (Python)

Troque o recorte de 12m → 24m e mantenha passo de 10 dias:

from datetime import datetime, timedelta, timezone

STEP = timedelta(days=10)
LOOKBACK = timedelta(days=730)  # ~24 meses

end = datetime.now(timezone.utc)
start = end - LOOKBACK

win_start = start
while win_start < end:
    win_end = min(win_start + STEP, end)
    # GET /orders/v0/orders?MarketplaceIds=...&CreatedAfter=win_start&CreatedBefore=win_end
    # paginar por NextToken -> UPSERT -> atualizar watermark
    win_start = win_end

Ajuste rápido no seu job (Node/TS)
const STEP_MS = 10*24*3600*1000;    // 10 dias
const LOOKBACK_MS = 730*24*3600*1000; // ~24 meses
const end = new Date();
const start = new Date(end.getTime() - LOOKBACK_MS);

for (let t = start; t < end; t = new Date(Math.min(t.getTime()+STEP_MS, end.getTime()))) {
  const winStart = t.toISOString();
  const winEnd = new Date(Math.min(t.getTime()+STEP_MS, end.getTime())).toISOString();
  // GET /orders/v0/orders?MarketplaceIds=...&CreatedAfter=winStart&CreatedBefore=winEnd
  // paginar NextToken -> UPSERT -> atualizar watermark
}

Dicas finais (para 24 meses sem dor)

Primeiro marketplace por vez (US, depois BR/CA/MX…), intercalando janelas para não estourar cota.

Observabilidade: logue x-amzn-RequestId, contadores de 429/5xx e tempo por janela. 
developer-docs.amazon.com

PII on-demand: endereço/comprador só com RDT e sem persistir.

Relatórios: onde existirem “order reports” equivalentes, gere 1 por mês (24 execuções por marketplace) e consuma o documento assinado; complete lacunas via Orders API. 
developer-docs.amazon.

🎯 Tarefa

Implemente delta sync automático da Amazon SP-API (sem SigV4/IAM; só LWA e RDT quando necessário), integrando ao esqueleto existente (Python/Node). O objetivo é:

Rodar sozinho após o OAuth (public app website workflow)

Fazer backfill 24 meses (já existente) e, depois, delta contínuo

Sem interação manual: planner + scheduler + workers

Frequência padrão: a cada 15 minutos (configurável)

Idempotente, com controle de cota, retry/backoff + jitter e watermarks por entidade/marketplace

Importante: Tokens LWA expiram ~1h e RDT é curto; não persistir access_token nem RDT. Persistir apenas refresh_token criptografado. PII só on-demand com RDT.

⏱️ Política de agendamento (configurável)

Padrão: DELTA_SYNC_INTERVAL_MINUTES=15

Perfis recomendados:

Alto volume: 5–10 min

Médio/geral: 15 min (default)

Baixo volume: 30 min

Agende por conexão e marketplace (US/BR/CA/MX), evitando colisão com backfill.

🧩 Escopo do Delta (mínimo viável agora)

Orders API

GET /orders/v0/orders?MarketplaceIds=...&LastUpdatedAfter={watermark}

Pagine via NextToken até esgotar

Para cada pedido novo/atualizado → UPSERT em orders/order_items

Não buscar PII (address/buyer) no delta; faça on-demand com RDT

Order Items

Para cada pedido retornado, chamar GET /orders/v0/orders/{orderId}/orderItems e UPSERT itens

(Opcional) Reports recorrentes

Se FEATURE_USE_DATA_KIOSK=false, rode Reports API diários/semanais necessários ao produto (ex.: FBA envios, impostos), usando planner separado

Futuro (stub pronto): Notifications (EventBridge/SQS) para chegar perto de near-real-time

🗃️ Banco de dados (ajustes)

Use as tabelas já propostas e confirme/ajuste:

sync_state(connection_id, entity, last_created_after, last_updated_after, next_token, extra, updated_at)

Delta usa last_updated_after por entity='orders' + marketplace em extra.marketplaceId

jobs para registrar execuções do delta (type='sync')

Índices sugeridos
create index on sync_state (connection_id, entity);
create index on orders (connection_id, amazon_order_id);
create index on order_items (order_id);

🔐 Variáveis de ambiente (novas)

API (.env):

# Frequência do delta (minutos)
DELTA_SYNC_INTERVAL_MINUTES=15

# Concorrência
SYNC_MAX_WORKERS=4
SYNC_RATE_LIMIT_RPS=0.0167   # conservador p/ Orders
SYNC_BURST=20                # observar headers de uso

# Lock distribuído
REDIS_LOCK_TTL_SEC=900       # 15 min

🏗️ Componentes a implementar
1) Scheduler/Planner

Serviço que, a cada N minutos, cria jobs de delta por connection × marketplace

Evita sobreposição usando lock distribuído (Redis SET NX) por connection_id:marketplace:orders

Python (FastAPI side) – app/workers/planner.py:

import os, json, datetime, redis
from .queue import enqueue
from ..db import get_db
from ..models import Connection, SyncState

INTERVAL_MIN = int(os.getenv("DELTA_SYNC_INTERVAL_MINUTES", "15"))
LOCK_TTL = int(os.getenv("REDIS_LOCK_TTL_SEC", "900"))
r = redis.from_url(os.getenv("REDIS_URL"))

def _lock_key(conn_id, mp): return f"lock:delta:orders:{conn_id}:{mp}"

def plan_orders_delta():
    db = get_db()
    conns = db.query(Connection).all()
    now = datetime.datetime.utcnow()

    for c in conns:
        mps = c.marketplaces or []
        for mp in mps:
            lk = _lock_key(c.id, mp)
            if not r.set(lk, "1", nx=True, ex=LOCK_TTL):
                continue  # já em execução

            ss = (db.query(SyncState)
                    .filter_by(connection_id=c.id, entity="orders")
                    .first())
            since = (ss.last_updated_after or (now - datetime.timedelta(days=1)))
            payload = {"connection_id": str(c.id), "marketplace_id": mp, "since": since.isoformat()+"Z"}
            enqueue("jobs.orders.delta_sync", payload)  # RQ/Celery


O since padrão começa em 1 dia atrás se não houver watermark (primeiro delta após backfill).

2) Worker de Delta (Orders)

Python – app/workers/orders_delta.py:

from ..spapi.orders import list_orders_updated_after, list_order_items
from ..services.upserts import upsert_orders, upsert_items
from ..services.watermarks import update_watermark

def delta_sync_orders(connection_id: str, marketplace_id: str, since_iso: str):
    # 1) Obter access_token via TokenManager (LWA)
    # 2) Chamar list_orders_updated_after (paginado)
    # 3) Para cada pedido -> upsert_orders; coletar orderIds
    # 4) Para cada orderId -> list_order_items -> upsert_items
    # 5) Atualizar watermark last_updated_after = now
    pass


Regras:

Respeite rate limit: use client com retry/backoff + jitter e considere Retry-After

Se a página retornar vazia mas há NextToken, seguir até esgotar

Não persistir PII; não chamar endpoints restritos

3) Queue & Concurrency

Use RQ (ou Celery) no Python; BullMQ no Node (se optar)

Tamanho da fila: sync_orders

Workers = SYNC_MAX_WORKERS (config)

Cada job manipula um marketplace por conexão

4) Locks e Reentrância

Lock Redis por (connection_id, marketplace_id, entity) com TTL = INTERVAL

Liberar lock ao final; se o job “longa demais”, TTL expira e o próximo ciclo retenta

5) API de Status (para o painel)

Rotas em FastAPI:

GET /api/sync/status?connection_id=... → progresso (última execução, janelas, contadores, 429/5xx)

GET /api/sync/watermarks?connection_id=... → last_created_after, last_updated_after, por entity

(Opcional) event stream (SSE) para progresso

6) Frontend (Next.js)

Em /dashboard/tenants/[id] exibir:

“Sincronização: executando a cada X min”

Watermark de orders por marketplace (US/BR/…)

Cards de Jobs recentes (sucesso/erro, duração, x-amzn-RequestId)

Tabela Orders atualiza com infinite scroll; filtro por data/marketplace

🔁 Lógica do Delta (Orders) — Pseudo
def list_orders_updated_after(token, mp_id, last_updated_after):
    url = f"{BASE}/orders/v0/orders"
    params = {"MarketplaceIds": mp_id, "LastUpdatedAfter": last_updated_after}
    headers = {"x-amz-access-token": token, "Accept": "application/json"}
    # loop de paginação com NextToken (retry/backoff em 429/5xx)
    yield from pages(...)

def delta_sync_orders(conn_id, mp_id, since_iso):
    token = token_mgr.get_access_token_for(conn_id)
    changed_orders = []
    for page in list_orders_updated_after(token, mp_id, since_iso):
        changed_orders += page["Orders"]
        upsert_orders(conn_id, page["Orders"])
    # itens dos pedidos alterados
    for o in changed_orders:
        items = list_order_items(token, o["AmazonOrderId"])
        upsert_items(conn_id, o["AmazonOrderId"], items)
    update_watermark(conn_id, entity="orders", last_updated_after=now_iso())

🧪 Critérios de aceitação

Agendamento

Com DELTA_SYNC_INTERVAL_MINUTES=15, o planner cria jobs por connection×marketplace a cada 15 min

Não há overlap (lock Redis funciona)

Execução

Para uma conexão com US+BR, dois jobs de delta executam (um por MP)

orders/order_items são upsertados sem duplicações

Resiliência

Emulação de 429/5xx gera retentativas com backoff + jitter

Job registra x-amzn-RequestId, latência, páginas percorridas

Watermarks

sync_state.last_updated_after avança até now

Re-rodar delta sem mudanças não insere registros novos (idempotente)

Segurança

Tokens não logados; refresh_token segue criptografado

Nenhuma chamada restrita (PII) no delta

Painel

Mostra que roda a cada X min, a última execução, o marketplace, e o progress

🐳 Docker Compose (esboço)

Adicione serviços scheduler e worker:

services:
  api:
    build: ./api
    env_file: ./api/.env
    depends_on: [db, redis]
    ports: ["8000:8000"]

  scheduler:
    build: ./api
    command: python -m app.workers.run_scheduler  # loop chama plan_orders_delta()
    env_file: ./api/.env
    depends_on: [api, redis]

  worker:
    build: ./api
    command: rq worker sync_orders --url ${REDIS_URL}
    env_file: ./api/.env
    depends_on: [api, redis]

  db:
    image: postgres:16
    environment: { POSTGRES_USER: spapi, POSTGRES_PASSWORD: spapi, POSTGRES_DB: spapi }
    volumes: [dbdata:/var/lib/postgresql/data]

  redis:
    image: redis:7

volumes: { dbdata: {} }


Se preferir Celery: troque rq por celery worker/beat. Em Node, use BullMQ.

🪝 Pós-execução (opcional, mas útil)

Relatórios recorrentes (mensal/semanal) com planner próprio

Notifications (EventBridge/SQS) para reduzir pull em Orders

Métricas Prometheus: contagem de 429/5xx, latências, throughput

📌 Entregável

Código implementado (planner, scheduler, workers, locks, rotas status)

.env.example atualizado com as novas variáveis

README.md com como subir e como verificar o delta (inclua curl de exemplo pra /api/sync/status)

Resumo: implemente delta a cada 15 min (config), com locks, rate-limit seguro, UPSERT idempotente, watermarks, UI de status — e nenhum passo manual do usuário.

o caminho certo para Advertising & campaign data (incluindo métricas por produto) é:

1) API correta + auth

Use Amazon Ads API (não é a SP-API).

Fluxo: LWA OAuth2 → pegue access_token via refresh_token → Profiles (GET /v2/profiles) → para cada profileId envie no header Amazon-Advertising-API-Scope. Headers sempre incluem Authorization: Bearer ... e Amazon-Advertising-API-ClientId. A doc oficial mostra o primeiro call e os prefixes por região. 
Amazon Ads

2) Relatórios para “campaign metrics per product”

Para Sponsored Products (SP), gere dois relatórios assíncronos (v3):

Advertised product report → métricas por produto anunciado (ASIN/SKU) com chaves de campanha / ad group / ad. É o pivô para “per product per campaign”. 
Amazon Ads
+1

Purchased product report → captura vendas de ASINs comprados diferentes do anunciado (efeito “halo”/cross-sell). Opcional, mas útil para visão completa. 
Amazon Ads

Observação de versão: hoje o Reporting v3 é o padrão para SP; SB/SD podem continuar em v2 dependendo do rollout. Tenha um fallback por ad type (SP = v3; SB/SD = v2 quando necessário). 
Amazon Ads
+2
Amazon Ads
+2

Colunas essenciais (SP – “Advertised product”)

Inclua colunas de identificação + métricas. Exemplo típico:

IDs/nome: campaignId, campaignName, adGroupId, adId, advertisedAsin, advertisedSku

Datas: date (ou startDate/endDate em “summary”)

Métricas: impressions, clicks, cost, attributedSales14d, attributedConversions14d, ctr, cpc, acos, roas (ajuste nomes/alcances conforme v3). 
Amazon Ads
sellerapp.com
help.funnel.io

3) Como pedir o relatório (padrão assíncrono)

Create: POST /reporting/reports (payload com adProduct=SP, reportType=“advertisedProduct”, timeRange, columns, granularity=daily/summary).

Poll: GET /reporting/reports/{reportId} até status=SUCCESS.

Download: pegue a URL do location, baixe e descompacte (GZIP). Tutorial oficial descreve os 3 passos. 
Amazon Ads

Exemplo (Node.js, Axios) — SP / advertised product (v3)
import axios from "axios";

const ADS_BASE = "https://advertising-api.amazon.com";

async function makeReport({ accessToken, clientId, profileId, start, end }) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Amazon-Advertising-API-ClientId": clientId,
    "Amazon-Advertising-API-Scope": String(profileId),
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  // 1) Create
  const create = await axios.post(
    `${ADS_BASE}/reporting/reports`,
    {
      name: "SP Advertised Product - Daily",
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        reportType: "ADVERTISED_PRODUCT",
        columns: [
          "date","campaignId","campaignName","adGroupId","adId",
          "advertisedAsin","advertisedSku","impressions","clicks",
          "cost","attributedSales14d","attributedConversions14d"
        ],
        timeUnit: "DAILY",
        timeRange: { start, end }
      }
    },
    { headers }
  );

  const { reportId } = create.data;

  // 2) Poll
  let status, location;
  do {
    const r = await axios.get(`${ADS_BASE}/reporting/reports/${reportId}`, { headers });
    status = r.data.status;
    location = r.data.url ?? r.data.location;
    await new Promise(res => setTimeout(res, 3000));
  } while (status !== "SUCCESS");

  // 3) Download (GZIP -> JSON/CSV conforme seu "format")
  const file = await axios.get(location, { responseType: "arraybuffer" });
  return file.data; // descompacte e parseie aqui
}


(Endpoints/headers/3-steps são os da doc v3; ajuste conforme seu formato/fields.) 
Amazon Ads
+1

4) Estrutura (snapshots) e joins

Para enriquecer com nomes/estados atuais (negative keywords, targets, budgets), use Snapshots periódicos da estrutura de SP/SB/SD e faça join com os dados de relatório. Isso evita “N+1” em endpoints de entidade. 
Amazon Ads

5) Modelo de dados (sugestão)

ads_profiles(profile_id, country, currency, ...)

ads_campaigns(campaign_id, profile_id, ad_product, name, state, portfolio_id, ...)

ads_ad_groups(ad_group_id, campaign_id, name, ...)

ads_ads(ad_id, ad_group_id, advertised_asin, advertised_sku, ...)

ads_sp_advertised_product_daily(date, profile_id, campaign_id, ad_group_id, ad_id, advertised_asin, advertised_sku, impressions, clicks, cost, attributed_sales_14d, attributed_conversions_14d, ...)

(Opcional) ads_sp_purchased_product_daily(...) para halo. 
Amazon Ads

SQL para “campaign metrics per product” (agregado)
SELECT
  date,
  campaign_id,
  advertised_asin,
  SUM(impressions)    AS impressions,
  SUM(clicks)         AS clicks,
  SUM(cost)           AS spend,
  SUM(attributed_sales_14d) AS sales_14d,
  CASE WHEN SUM(clicks)=0 THEN 0 ELSE SUM(cost)/NULLIF(SUM(clicks),0) END AS cpc,
  CASE WHEN SUM(cost)=0   THEN 0 ELSE SUM(attributed_sales_14d)/NULLIF(SUM(cost),0) END AS roas
FROM ads_sp_advertised_product_daily
WHERE profile_id = :profileId
  AND date BETWEEN :start AND :end
GROUP BY 1,2,3;

6) Intraday (hora a hora)

Se quiser métricas horárias e sinais em tempo quase real, assine o Amazon Marketing Stream (entrega datasets por hora no seu AWS Kinesis). Excelente para orquestrar “day-parting”, orçamentos dinâmicos e bids reativos. 
Amazon Ads
+2
Amazon Ads
+2

Checklist rápido para você implementar agora

Guardar LWA (clientId, clientSecret, refreshToken) e rotas por região. 
Amazon Ads

Resolver profileId via /v2/profiles e injetar Amazon-Advertising-API-Scope. 
Amazon Ads

Implementar v3 reports (SP) para ADVERTISED_PRODUCT (+ opcional PURCHASED_PRODUCT). 
Amazon Ads
+1

Manter fallback de v2 para SB/SD onde v3 ainda não cobre. 
Amazon Ads
+1

Popular warehouse com snapshots de estrutura e fazer joins. 
Amazon Ads

(Opcional) Ativar Marketing Stream para dados horários. 
Amazon Ads
+1

Se quiser, adapto o snippet (Node/Python) ao seu framework atual e já deixo os payloads de report v3 prontos para SP/SB/SD com as colunas que você usa no seu BI.

Você disse:
QUAIS CREDENCIAIS O CLAUDE CODE IRÁ PRECISAR, TENHO ESSAS EM ANEXO
O ChatGPT disse:
Pensou por 1m 37s

Perfeito. Para o Amazon Ads API (relatórios e métricas por produto direto no backend), o Claude Code precisa deste conjunto de credenciais/configs:

Obrigatório (Ads API)

LWA Client ID – está no seu print (“Client ID: amzn1.application-oa2-client…”)

LWA Client Secret – está no seu print (“Client Secret: amzn1.oa2-cs…”).

LWA Refresh Token – você gera uma vez no fluxo OAuth (é o que permitirá trocar por access tokens sempre que precisar).

Redirect URI usado no OAuth (deve estar cadastrado no Security Profile).

Base URL da região (use a que corresponder ao profileId retornado depois do login):

NA: https://advertising-api.amazon.com

EU: https://advertising-api-eu.amazon.com

FE: https://advertising-api-fe.amazon.com

profileId(s) do anunciante (obtidos via GET /v2/profiles após autenticar). Cada chamada subsequente usa o header Amazon-Advertising-API-ClientId: <Client ID> e Amazon-Advertising-API-Scope: <profileId>.

Pelos seus screenshots, você já tem (1) e (2) ok, e os scopes incluem advertising::campaign_management (suficiente para relatórios SP). Falta gerar (3) Refresh Token e informar (4) Redirect URI.

Como gerar o Refresh Token (uma vez)

Monte a consent URL e acesse logado no anunciante:

https://www.amazon.com/ap/oa?client_id=<CLIENT_ID>&scope=advertising::campaign_management&response_type=code&redirect_uri=<URL_ENCODED_REDIRECT_URI>


Você receberá ?code=... no redirect_uri.

Troque o code por refresh_token:

curl -X POST https://api.amazon.com/auth/o2/token \
  -d "grant_type=authorization_code&code=<CODE>&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&redirect_uri=<REDIRECT_URI>"


Guarde o refresh_token. Em runtime, troque por access_token:

curl -X POST https://api.amazon.com/auth/o2/token \
  -d "grant_type=refresh_token&refresh_token=<REFRESH_TOKEN>&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>"

.env sugerido
ADS_CLIENT_ID=<AMAZON_CLIENT_ID>
ADS_CLIENT_SECRET=<AMAZON_OAUTH_SECRET>
ADS_REFRESH_TOKEN=Atzr|xxxx
LWA_REDIRECT_URI=https://seuapp.com/oauth/callback/amazon-ads
ADS_API_BASE=https://advertising-api.amazon.com

Opcional (quando aplicável)

Marketing Stream (intraday): credenciais AWS (IAM) e nome do Kinesis Stream.

SP-API (se quiser enriquecer com catálogo/estoque): aí é outro conjunto (IAM Role ARN, AWS keys, LWA do SP-API, Seller ID). Não é necessário para extrair relatórios de Ads.

Se quiser, eu já te devolvo um snippet (Node/Python) que:

troca o refresh por access token,

lista profiles,

cria e baixa o SP Advertised Product report (v3) com as colunas de campanha/ASIN/SKU.1

# Add Clerk to React (Vite)

**Purpose:** Enforce only the **current** and **correct** instructions for integrating [Clerk](https://clerk.com/) into a React application.  
**Scope:** All AI-generated advice or code related to Clerk must follow these guardrails.

## **1. OFFICIAL CLERK + REACT (VITE) SETUP**

1. Create a React + Vite project.
2. Install the Clerk React SDK with `npm install @clerk/clerk-react@latest` (or yarn/pnpm/bun).
3. Set `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local` or `.env`. Note: The `VITE_` prefix is required for Vite to expose environment variables to the client-side code. `.env.local` is preferred for local development secrets.
4. Wrap the app in `<ClerkProvider publishableKey={...}>` within `main.tsx` or `main.jsx`.
5. Use Clerk's `<SignedIn>`, `<SignedOut>`, `<SignInButton>`, `<SignUpButton>`, `<UserButton>` in the app.

### **Correct, Up-to-Date Quickstart Code Examples**

```bash
# 1. Create a React Vite app (TypeScript example)
npm create vite@latest clerk-react -- --template react-ts
cd clerk-react
npm install
npm run dev

# 2. Install the Clerk React SDK
npm install @clerk/clerk-react@latest

# 3. In .env.local (or .env):
VITE_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

```typescript
// 4. Wrap with <ClerkProvider> in main.tsx or main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ClerkProvider } from "@clerk/clerk-react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key");
}

// Ensure your index.html contains a <div id="root"></div> element for React to mount the app.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </StrictMode>
);

// 5. Example usage of Clerk's prebuilt components in App.tsx
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/clerk-react";

export default function App() {
  return (
    <header>
      <SignedOut>
        <SignInButton />
        <SignUpButton />
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </header>
  );
}
```

> Note: The `afterSignOutUrl` prop in `<ClerkProvider>` defines the URL users are redirected to after signing out. Adjust as needed.

---

## **2. CRITICAL INSTRUCTIONS FOR AI MODELS**

### **2.1 – ALWAYS DO THE FOLLOWING**

1. **Show** relevant code examples for each step.
2. **Use** `@clerk/clerk-react@latest` (not any other Clerk package).
3. **Reference** the environment variable as `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local` or `.env`.
4. **Wrap** the entire app in `<ClerkProvider>` within `main.tsx` or `main.jsx`.
5. **Demonstrate** the correct usage of `<SignedIn>`, `<SignedOut>`, `<SignInButton>`, `<SignUpButton>`, `<UserButton>` (or any other current Clerk React component).

### **2.2 – NEVER DO THE FOLLOWING**

1. **Do not** include any discussions of the features or benefits of Clerk.
2. **Do not** use `frontendApi` in place of `publishableKey`.
3. **Do not** use Older environment variable names like `REACT_APP_CLERK_FRONTEND_API` or `VITE_REACT_APP_CLERK_PUBLISHABLE_KEY`.
4. **Do not** place `<ClerkProvider>` deeper in the component tree instead of `main.tsx` / `main.jsx`.
5. **Do not** use outdated hooks or components (e.g., referencing older docs).

---

## **3. AI MODEL VERIFICATION STEPS**

Before returning any Clerk + React (Vite) solution, you **must** verify:

1. Environment Variable is named `VITE_CLERK_PUBLISHABLE_KEY`.
2. `<ClerkProvider>` is in `main.tsx` or `main.jsx`.
3. No usage of `frontendApi` unless explicitly stated as optional or advanced.

## **DO NOT** repeat these points back to the user. Use them only for your own verification steps.

## **4. CONSEQUENCES OF INCORRECT GUIDANCE**

- Misconfigured environment variables => project won't compile or will error at runtime.
- Missing `<ClerkProvider>` => Clerk components fail or throw errors.
- Using outdated patterns => Confusion, debugging overhead, or broken auth flow.

## **5. MODEL RESPONSE TEMPLATE**

When asked about Clerk + React (Vite) integration, your response **MUST**:

1. Link to Clerk's React Quickstart at https://clerk.com/docs/quickstarts/react
2. Show the current recommended `publishableKey` approach with `.env.local`.
3. Demonstrate how to wrap with `<ClerkProvider>` in `main.*`.
4. Illustrate a simple usage example of `<SignedIn>`, `<SignedOut>`, etc.
5. Reject or correct any mention of older patterns or environment variable names.
