🎯 Prompt Completo para Claude Code Gerar Dashboard SaaS
markdown# Criar Dashboard SaaS com Next.js + Tremor + Prisma

## Contexto
Preciso criar um dashboard SaaS multi-tenant para monitoramento de vendas na Amazon e Mercado Livre. O sistema deve suportar múltiplos clientes, cada um visualizando apenas seus próprios dados.

## Stack Tecnológica
- Next.js 14 (App Router)
- Tremor para componentes de dashboard
- Prisma ORM
- PostgreSQL
- Tailwind CSS
- NextAuth ou Clerk para autenticação

## Configuração do Banco de Dados

### Conexão PostgreSQL
Host: <DB_HOST>
Port: <DB_PORT>
Database: <DB_NAME>
User: <DB_USER>
Password: <DB_PASSWORD>

### Schema Prisma Necessário
Crie um schema que inclua:
- User (id, email, name, customerId, role)
- Customer (id, name, plan, createdAt)
- Product (id, customerId, name, sku, amazonAsin, mercadoLivreId)
- Sale (id, customerId, productId, platform, date, quantity, price, status)
- Metric (id, customerId, date, revenue, orders, averageTicket)
- Alert (id, customerId, type, message, isRead, createdAt)

## Estrutura de Pastas
/app
/(auth)
/login/page.tsx
/register/page.tsx
/(dashboard)
/dashboard/page.tsx
/dashboard/products/page.tsx
/dashboard/analytics/page.tsx
/dashboard/settings/page.tsx
/api
/auth/[...nextauth]/route.ts
/dashboard/metrics/route.ts
/dashboard/sales/route.ts
/products/route.ts
/components
/dashboard
/MetricsCards.tsx
/SalesChart.tsx
/ProductsTable.tsx
/RevenueChart.tsx
/PlatformComparison.tsx
/layout
/Sidebar.tsx
/Header.tsx
/lib
/prisma.ts
/auth.ts
/prisma
/schema.prisma

## Funcionalidades Necessárias

### 1. Dashboard Principal (/dashboard)
Crie uma página com:
- Cards de métricas (KPIs):
  - Receita Total (mês atual vs anterior)
  - Número de Pedidos
  - Ticket Médio
  - Taxa de Crescimento
- Gráfico de linha: Vendas últimos 30 dias (usando AreaChart do Tremor)
- Gráfico de barras: Comparação Amazon vs Mercado Livre (usando BarChart)
- Tabela: Últimas 10 vendas (usando Table do Tremor)
- Filtros: Data range picker e seletor de plataforma

### 2. Página de Produtos (/dashboard/products)
- Tabela com todos os produtos (usando Table do Tremor)
- Métricas por produto: vendas, receita, estoque
- Busca e filtros
- Modal para adicionar/editar produto
- Badge indicando plataforma (Amazon/ML)

### 3. Analytics (/dashboard/analytics)
- Gráfico de evolução de receita (LineChart)
- Top 10 produtos mais vendidos (BarList)
- Distribuição de vendas por plataforma (DonutChart)
- Heatmap de vendas por dia/hora
- Métricas de performance com Spark charts

### 4. API Routes com Isolamento de Dados
Todas as rotas devem:
- Verificar autenticação
- Filtrar dados por customerId
- Usar Prisma com where: { customerId }
- Retornar apenas dados do cliente autenticado

Exemplo:
```typescript
// app/api/dashboard/metrics/route.ts
export async function GET(request: Request) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const metrics = await prisma.metric.findMany({
    where: { 
      customerId: session.user.customerId,
      date: { gte: startOfMonth(new Date()) }
    }
  })
  
  return NextResponse.json(metrics)
}
Componentes Tremor Necessários
Use estes componentes do Tremor:

Card, Metric, Text, Title para KPIs
AreaChart, BarChart, LineChart para gráficos temporais
DonutChart para distribuição
BarList para rankings
Table para listagens
DateRangePicker para filtros de data
Select, MultiSelect para outros filtros
Badge para status
Button, Dialog para ações

Exemplo de Componente
typescript// components/dashboard/MetricsCards.tsx
import { Card, Metric, Text, Flex, ProgressBar } from '@tremor/react'

export function MetricsCards({ metrics }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <Text>Receita Total</Text>
        <Metric>R$ {metrics.revenue.toLocaleString('pt-BR')}</Metric>
        <Flex className="mt-4">
          <Text>32% do objetivo</Text>
          <Text>R$ 100.000</Text>
        </Flex>
        <ProgressBar value={32} className="mt-2" />
      </Card>
      {/* Mais cards... */}
    </div>
  )
}
Requisitos de Segurança

Multi-tenancy: Implemente Row Level Security (RLS)
Autenticação: Use NextAuth com providers (Google, Email)
Middleware: Proteja todas rotas /dashboard/*
Rate Limiting: Adicione rate limit nas APIs
Validação: Use Zod para validar inputs

Responsividade

Mobile-first design
Sidebar colapsável em mobile
Gráficos adaptáveis
Tabelas com scroll horizontal

Performance

Use React.Suspense com loading states
Implemente cache com unstable_cache do Next.js
Use parallel data fetching
Otimize queries do Prisma com select e include

Estilização
Use Tailwind CSS com as cores do Tremor:

tremor-background
tremor-border
tremor-content
Modo dark/light com next-themes

Deploy
Configure para deploy no Vercel com:

Variáveis de ambiente para DATABASE_URL
Build command: prisma generate && next build
Configuração de CORS se necessário

Instruções Adicionais

Crie seeds para dados de teste
Adicione tratamento de erros com try/catch
Use TypeScript com types fortes
Implemente loading e error states
Adicione animações suaves com Framer Motion (opcional)
Crie um README com instruções de instalação

Começar Por

Inicialize o projeto Next.js com TypeScript
Configure Prisma e conecte ao PostgreSQL
Crie o schema e rode as migrations
Implemente autenticação básica
Crie o layout do dashboard
Adicione os componentes de métricas
Implemente as API routes
Adicione gráficos e tabelas
Teste o isolamento de dados
Otimize performance

Por favor, gere o código completo começando pela configuração inicial e o dashboard principal com todos os componentes mencionados.

### 💡 **Dicas para usar este prompt:**

1. **Cole no Claude Code** e peça para gerar arquivo por arquivo
2. **Comece com**: "Crie o projeto inicial com package.json e configuração"
3. **Depois peça**: "Agora crie o schema.prisma e a configuração do banco"
4. **Continue com**: "Crie o dashboard principal com os componentes de métricas"

### 🚀 **Comandos para executar após o código ser gerado:**

```bash
# Instalar dependências
npm install

# Configurar Prisma
npx prisma generate
npx prisma db push

# Rodar em desenvolvimento
npm run dev
