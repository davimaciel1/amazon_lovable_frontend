# PRD_FRONTEND - Frontend UI/UX Requirements
# Para Lovable criar APENAS a interface (sem backend)

## 1. Arquitetura Frontend

### 1.1 Stack Técnica
```yaml
Framework: Next.js 14+ (App Router)
UI Library: shadcn/ui
Styling: Tailwind CSS
State Management: Zustand
Data Fetching: TanStack Query (React Query)
Forms: React Hook Form + Zod
Charts: Recharts ou Tremor
Tables: TanStack Table
Icons: Lucide React
```

### 1.2 Estrutura de Pastas
```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Páginas públicas
│   │   ├── login/
│   │   ├── register/
│   │   └── forgot-password/
│   ├── (dashboard)/       # Páginas autenticadas
│   │   ├── layout.tsx     # Layout com sidebar
│   │   ├── page.tsx       # Dashboard principal
│   │   ├── products/
│   │   ├── orders/
│   │   ├── finance/
│   │   ├── advertising/
│   │   ├── alerts/
│   │   └── settings/
│   └── api/              # API routes (mock para desenvolvimento)
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── dashboard/        # Dashboard widgets
│   ├── charts/           # Chart components
│   ├── tables/           # Table components
│   ├── forms/            # Form components
│   └── layout/           # Layout components
├── hooks/                # Custom hooks
├── lib/                  # Utilities
├── services/             # API service layer (mock)
├── stores/               # Zustand stores
└── types/                # TypeScript types
```

## 2. Páginas e Componentes

### 2.1 Autenticação

#### Login Page (`/login`)
```tsx
// Campos do formulário
- Email (input type="email")
- Password (input type="password") 
- Remember me (checkbox)
- Forgot password? (link)

// Botões
- Sign In (primary)
- Sign Up (link)
- Continue with Amazon (OAuth button)

// Validações (client-side)
- Email: formato válido
- Password: mínimo 8 caracteres

// Estados
- Loading (durante login)
- Error (credenciais inválidas)
- Success (redirecionar)
```

#### Register Page (`/register`)
```tsx
// Step 1: Account Info
- Full Name
- Email
- Password
- Confirm Password
- Phone (opcional)

// Step 2: Company Info
- Company Name
- Website (opcional)
- Timezone (select)
- Language (select: pt-BR, en-US)

// Step 3: Plan Selection
- Cards com planos (FREE, STARTER, PRO)
- Comparação de features
- Botão "Select Plan"

// Step 4: Amazon Connection (opcional)
- Skip for now (link)
- Connect Amazon Account (OAuth)
```

#### Forgot Password (`/forgot-password`)
```tsx
// Formulário
- Email input
- Send Reset Link button

// Estados
- Email sent confirmation
- Error handling
```

### 2.2 Dashboard Principal

#### Layout Component
```tsx
// Sidebar (collapsible)
- Logo/Brand
- Navigation Menu:
  - Dashboard (home icon)
  - Products (package icon)
  - Orders (shopping-cart icon)
  - Finance (dollar-sign icon)
  - Advertising (megaphone icon)
  - Alerts (bell icon com badge)
  - Settings (settings icon)
- User Menu (bottom):
  - Profile
  - Logout

// Top Bar
- Search bar (global search)
- Notifications icon (com dropdown)
- User avatar (com dropdown menu)
- Theme toggle (light/dark)
```

#### Dashboard Page (`/`)
```tsx
// KPI Cards (grid de 6)
1. Today's Sales
   - Valor principal (R$ 15,234.56)
   - Comparação (↑ 12% vs yesterday)
   - Mini sparkline

2. Orders
   - Quantidade (142)
   - Comparação (↓ 5% vs yesterday)
   - Status breakdown

3. Net Profit
   - Valor (R$ 3,456.78)
   - Margin percentage (22.7%)
   - Trend indicator

4. ACOS
   - Percentage (18.5%)
   - Target line (20%)
   - Status (good/warning/bad)

5. Low Stock
   - Count (8 products)
   - Critical (2)
   - Link to products

6. Active Alerts
   - Count (5)
   - By severity (2 critical, 3 warning)
   - Link to alerts

// Charts Section
1. Sales & Profit Chart (Line chart - 30 days)
   - Dual axis (sales left, profit right)
   - Date range selector
   - Export button

2. Top Products (Bar chart horizontal)
   - Top 10 by revenue
   - Show: name, sales, units

3. Sales by Category (Pie/Donut chart)
   - Interactive legend
   - Percentages

4. Hourly Performance (Area chart - today)
   - Sales by hour
   - Orders overlay

// Recent Activity Table
- Last 10 orders
- Columns: Time, Order ID, Customer, Products, Total, Status
- View All link
```

### 2.3 Products Page

#### Products List (`/products`)
```tsx
// Filters Bar
- Search input (ASIN, SKU, Title)
- Category select
- Status filter (Active, Inactive)
- Stock level (All, Low, Normal, High)
- Buy Box (Winner, Lost)

// Actions Bar
- Bulk select checkbox
- Export button
- Import button
- Columns visibility

// Data Table
Columns:
- [ ] Checkbox
- Image (thumbnail)
- Title (link to detail)
- ASIN/SKU
- Price (current)
- Competition (count)
- Stock (FBA/FBM bars)
- Sales 30d
- Revenue 30d
- Margin %
- Buy Box (badge)
- Actions (menu)

// Pagination
- Items per page select
- Page numbers
- Total count
```

#### Product Detail (`/products/[asin]`)
```tsx
// Header Section
- Product image gallery
- Title
- ASIN, SKU, Brand
- Category breadcrumb
- Status badges

// Metrics Tabs
Tab 1: Overview
- Current price vs competitors
- Stock levels (visual bars)
- Sales velocity
- Profit margins
- Ranking

Tab 2: Sales History
- Sales chart (90 days)
- Units sold chart
- Revenue chart
- Seasonality analysis

Tab 3: Inventory
- Stock history chart
- Restock recommendations
- Days of stock remaining
- Inbound shipments

Tab 4: Competition
- Competitor price history
- Buy Box win rate
- Price position chart
- Competitor list table

Tab 5: Profitability
- Fee breakdown
- Margin analysis
- Cost structure
- P&L by period
```

### 2.4 Orders Page

#### Orders List (`/orders`)
```tsx
// Filters
- Date range picker
- Status select
- Fulfillment (FBA/FBM)
- Search (Order ID, Customer)

// Orders Table
Columns:
- Order ID (link)
- Date/Time
- Customer (anonymized)
- Products (count + preview)
- Total
- Profit
- Status (badge)
- Channel
- Actions

// Summary Cards (top)
- Total Orders
- Revenue
- Avg Order Value
- Return Rate
```

#### Order Detail (`/orders/[id]`)
```tsx
// Order Header
- Order ID, Date, Status
- Customer info (anonymized)
- Shipping address (partial)

// Order Items
- Product image
- Title, ASIN
- Quantity
- Unit price
- Total

// Financial Summary
- Subtotal
- Fees breakdown
- Shipping
- Tax
- Total
- Profit/Loss

// Timeline
- Order placed
- Payment confirmed
- Shipped
- Delivered
```

### 2.5 Finance Page

#### Finance Dashboard (`/finance`)
```tsx
// Period Selector
- Today, Week, Month, Year, Custom

// Financial KPIs
1. Gross Revenue
2. Net Revenue  
3. Total Costs
4. Net Profit
5. Profit Margin
6. ROI

// P&L Statement (table)
- Revenue lines
- Cost lines
- Gross profit
- Operating expenses
- Net profit

// Charts
1. Revenue vs Costs (stacked area)
2. Profit Trend (line)
3. Fee Breakdown (donut)
4. Cash Flow (waterfall)

// Export Options
- PDF Report
- Excel
- CSV
```

### 2.6 Advertising Page

#### Campaigns List (`/advertising`)
```tsx
// Campaign Cards/Table
- Campaign name
- Status (toggle)
- Budget (editable)
- Spend
- Sales
- ACOS (with target)
- Impressions
- Clicks
- Actions menu

// Performance Dashboard
- Total spend
- Total sales
- Overall ACOS
- ROAS
- Click rate

// Optimization Suggestions
- Cards with recommendations
- Expected impact
- Apply button
```

### 2.7 Alerts Page

#### Alerts Center (`/alerts`)
```tsx
// Filter Tabs
- All
- Critical
- Warning
- Info
- Resolved

// Alert Cards
- Icon (by type)
- Title
- Description
- Time ago
- Affected product/campaign
- Actions: Acknowledge, Resolve, Dismiss

// Alert Settings (modal)
- Toggle alerts by type
- Set thresholds
- Notification channels
```

### 2.8 Settings Page

#### Settings (`/settings`)
```tsx
// Tabs Layout
Tab 1: Profile
- Avatar upload
- Name, email
- Phone
- Timezone
- Language

Tab 2: Company
- Company name
- Logo upload
- Website
- Tax info

Tab 3: Team
- User list table
- Invite user button
- Role management

Tab 4: Billing
- Current plan card
- Usage metrics
- Upgrade button
- Payment method
- Invoice history

Tab 5: Integrations
- Amazon connection status
- Reconnect button
- Marketplace selection
- API keys (hidden)

Tab 6: Notifications
- Email notifications toggles
- SMS settings
- In-app preferences
- Alert rules
```

## 3. Componentes Reutilizáveis

### 3.1 Charts Components
```tsx
// MetricCard
interface MetricCardProps {
  title: string
  value: string | number
  change?: number
  changeType?: 'increase' | 'decrease'
  icon?: LucideIcon
  sparkline?: number[]
}

// LineChart
interface LineChartProps {
  data: Array<{date: string, value: number}>
  height?: number
  showGrid?: boolean
  showTooltip?: boolean
}

// BarChart
interface BarChartProps {
  data: Array<{label: string, value: number}>
  orientation?: 'horizontal' | 'vertical'
  color?: string
}

// DonutChart
interface DonutChartProps {
  data: Array<{name: string, value: number}>
  centerLabel?: string
  showLegend?: boolean
}
```

### 3.2 Table Components
```tsx
// DataTable (usando TanStack Table)
interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  pagination?: boolean
  sorting?: boolean
  filtering?: boolean
  selection?: boolean
  onRowClick?: (row: T) => void
}

// Features incluídas:
- Column sorting
- Column filtering
- Column visibility
- Row selection
- Pagination
- Global search
- Export
```

### 3.3 Form Components
```tsx
// FormField wrapper
interface FormFieldProps {
  label: string
  error?: string
  required?: boolean
  tooltip?: string
  children: React.ReactNode
}

// SearchInput
interface SearchInputProps {
  placeholder?: string
  onSearch: (value: string) => void
  debounce?: number
}

// DateRangePicker
interface DateRangePickerProps {
  value: {start: Date, end: Date}
  onChange: (range: {start: Date, end: Date}) => void
  presets?: Array<{label: string, days: number}>
}
```

### 3.4 Feedback Components
```tsx
// Alert/Notification
interface AlertProps {
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  action?: {label: string, onClick: () => void}
  dismissible?: boolean
}

// EmptyState
interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {label: string, onClick: () => void}
}

// LoadingState
interface LoadingStateProps {
  text?: string
  fullScreen?: boolean
}

// ErrorBoundary
- Captura erros
- Mostra fallback UI
- Opção de retry
```

## 4. Design System

### 4.1 Cores (Tailwind)
```css
/* Light Theme */
--background: white
--foreground: slate-900
--primary: blue-600
--secondary: slate-600
--success: green-600
--warning: amber-600
--danger: red-600
--muted: slate-100

/* Dark Theme */
--background: slate-900
--foreground: slate-100
--primary: blue-500
--secondary: slate-400
--success: green-500
--warning: amber-500
--danger: red-500
--muted: slate-800
```

### 4.2 Tipografia
```css
/* Headings */
h1: text-4xl font-bold
h2: text-3xl font-semibold
h3: text-2xl font-semibold
h4: text-xl font-medium

/* Body */
body: text-base
small: text-sm
tiny: text-xs

/* Font Family */
font-sans: Inter, system-ui, sans-serif
font-mono: 'Fira Code', monospace
```

### 4.3 Spacing
```css
/* Padrão de 4px */
spacing-1: 0.25rem (4px)
spacing-2: 0.5rem (8px)
spacing-3: 0.75rem (12px)
spacing-4: 1rem (16px)
spacing-6: 1.5rem (24px)
spacing-8: 2rem (32px)
```

### 4.4 Componentes Base (shadcn/ui)
```bash
# Instalar todos necessários
npx shadcn-ui@latest add alert
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add button
npx shadcn-ui@latest add calendar
npx shadcn-ui@latest add card
npx shadcn-ui@latest add checkbox
npx shadcn-ui@latest add command
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add form
npx shadcn-ui@latest add input
npx shadcn-ui@latest add label
npx shadcn-ui@latest add navigation-menu
npx shadcn-ui@latest add popover
npx shadcn-ui@latest add progress
npx shadcn-ui@latest add radio-group
npx shadcn-ui@latest add select
npx shadcn-ui@latest add separator
npx shadcn-ui@latest add sheet
npx shadcn-ui@latest add skeleton
npx shadcn-ui@latest add slider
npx shadcn-ui@latest add switch
npx shadcn-ui@latest add table
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add toggle
npx shadcn-ui@latest add tooltip
```

## 5. Estados e Interações

### 5.1 Loading States
```tsx
// Skeleton loading para:
- Cards: Shimmer effect
- Tables: Row skeletons
- Charts: Placeholder com animação
- Forms: Disabled state

// Padrões:
1. Initial load: Full skeleton
2. Refresh: Overlay com opacity
3. Pagination: Só table body
4. Infinite scroll: Bottom loader
```

### 5.2 Error States
```tsx
// Tipos de erro:
1. Network error: Retry button
2. Permission denied: Contact admin
3. Not found: Go back
4. Validation: Inline messages
5. Server error: Error boundary

// Componentes:
- Toast notifications
- Inline alerts
- Modal dialogs
- Full page errors
```

### 5.3 Empty States
```tsx
// Cenários:
1. No data yet: Call to action
2. Filtered empty: Clear filters
3. Search empty: Try different terms
4. First time: Onboarding guide

// Elementos:
- Illustration/Icon
- Title
- Description
- Action button
```

### 5.4 Success Feedback
```tsx
// Tipos:
1. Toast: Ação rápida
2. Confetti: Milestone
3. Modal: Importante
4. Inline: Contextual

// Durações:
- Toast: 3-5 segundos
- Inline: Until dismissed
- Modal: User action required
```

## 6. Responsividade

### 6.1 Breakpoints
```css
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

### 6.2 Mobile Adaptations
```tsx
// Navigation
- Hamburguer menu
- Bottom navigation
- Swipe gestures

// Tables
- Horizontal scroll
- Card view alternative
- Essential columns only

// Charts
- Touch interactions
- Simplified views
- Rotate prompt for landscape

// Forms
- Full width inputs
- Stacked layout
- Native pickers
```

### 6.3 Tablet Optimizations
```tsx
// Layout
- Collapsible sidebar
- 2-column grids
- Floating action buttons

// Interactions
- Touch-friendly buttons (min 44px)
- Swipe actions
- Long press menus
```

## 7. Animações e Transições

### 7.1 Micro-interactions
```css
/* Padrões Framer Motion */
- Button hover: scale(1.02)
- Card hover: translateY(-2px)
- Tab switch: slide
- Accordion: height auto
- Modal: fade + scale
- Toast: slide + fade
- Skeleton: pulse
```

### 7.2 Page Transitions
```tsx
// Next.js App Router
- Fade between pages
- Preserve scroll position
- Loading.tsx for suspense
- Progressive enhancement
```

### 7.3 Data Updates
```tsx
// Optimistic updates
1. Update UI immediately
2. Send request
3. Rollback on error

// Real-time updates
- WebSocket for live data
- Polling fallback
- Visual indicators for new data
```

## 8. Acessibilidade

### 8.1 WCAG 2.1 AA Compliance
```tsx
// Requisitos:
- Color contrast 4.5:1 (text)
- Color contrast 3:1 (large text)
- Keyboard navigation
- Screen reader support
- Focus indicators
- Alt text for images
- ARIA labels
- Semantic HTML
```

### 8.2 Keyboard Navigation
```tsx
// Padrões:
- Tab: Navigate forwards
- Shift+Tab: Navigate backwards  
- Enter: Activate buttons/links
- Space: Toggle checkboxes
- Arrow keys: Navigate menus
- Escape: Close modals
- /: Focus search
```

### 8.3 Screen Reader Support
```tsx
// Implementar:
- aria-label
- aria-describedby
- role attributes
- Live regions for updates
- Skip navigation links
- Heading hierarchy
```

## 9. Performance

### 9.1 Otimizações
```tsx
// Code splitting
- Route-based splitting
- Component lazy loading
- Dynamic imports

// Image optimization
- Next/Image component
- WebP format
- Lazy loading
- Blur placeholders

// Bundle size
- Tree shaking
- Minification
- Compression
- CDN delivery
```

### 9.2 Métricas Alvo
```yaml
FCP: < 1.8s   # First Contentful Paint
LCP: < 2.5s   # Largest Contentful Paint  
FID: < 100ms  # First Input Delay
CLS: < 0.1    # Cumulative Layout Shift
TTI: < 3.8s   # Time to Interactive
```

## 10. Dados Mock para Desenvolvimento

### 10.1 API Mock
```tsx
// services/mock/api.ts
export const mockAPI = {
  auth: {
    login: async (email: string, password: string) => {
      await delay(500)
      return {
        user: mockUser,
        tokens: mockTokens
      }
    }
  },
  
  dashboard: {
    getMetrics: async () => {
      await delay(300)
      return mockDashboardData
    }
  },
  
  products: {
    list: async (params: any) => {
      await delay(400)
      return mockProducts
    }
  }
}

// Usar MSW para interceptar requests
```

### 10.2 Dados de Exemplo
```tsx
const mockDashboardData = {
  kpis: {
    todaySales: 15234.56,
    todayOrders: 142,
    netProfit: 3456.78,
    profitMargin: 22.7,
    acos: 18.5,
    lowStockCount: 8
  },
  charts: {
    salesTrend: [
      {date: '2024-01-01', sales: 12000, profit: 2400},
      {date: '2024-01-02', sales: 13500, profit: 2700},
      // ... 30 days
    ]
  }
}
```

## 11. Configuração Inicial

### 11.1 Estrutura Next.js
```bash
npx create-next-app@latest amazon-dashboard \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

cd amazon-dashboard

# Instalar dependências
npm install @tanstack/react-query
npm install @tanstack/react-table  
npm install zustand
npm install react-hook-form
npm install zod
npm install recharts
npm install lucide-react
npm install date-fns
npm install clsx
npm install tailwind-merge
```

### 11.2 Configuração shadcn/ui
```bash
npx shadcn-ui@latest init

# Responder:
# - Would you like to use TypeScript? Yes
# - Which style? Default
# - Which color? Blue
# - CSS variables? Yes
```

### 11.3 Environment Variables
```env
# .env.local
NEXT_PUBLIC_APP_NAME="Amazon SP-API Monitor"
NEXT_PUBLIC_APP_URL="http://localhost:8087"

# API (será conectado depois pelo Claude Code)
NEXT_PUBLIC_API_URL="http://localhost:8080/api"

# Mock mode (true durante desenvolvimento no Lovable)
NEXT_PUBLIC_USE_MOCK_API="true"
```

## 12. Entregáveis Esperados

### 12.1 Do Lovable
1. **Projeto Next.js completo** com todas as páginas
2. **Componentes UI** totalmente estilizados
3. **Navegação** funcionando entre páginas
4. **Forms** com validação client-side
5. **Estados visuais** (loading, error, empty, success)
6. **Responsividade** mobile/tablet/desktop
7. **Theme** light/dark mode
8. **Mock data** para visualização

### 12.2 NÃO incluir (Claude Code fará)
- ❌ Conexão real com API
- ❌ Autenticação real (JWT)
- ❌ Lógica de backend
- ❌ Integração com banco de dados
- ❌ Amazon SP-API
- ❌ WebSockets reais
- ❌ Processamento de pagamentos
- ❌ Envio de emails

## 13. Handoff para Claude Code

Após o Lovable entregar o frontend, o Claude Code irá:

1. **Importar o projeto** para a estrutura local
2. **Remover mock API** e conectar com backend real
3. **Implementar autenticação** JWT real
4. **Configurar proxy** para API backend
5. **Adicionar interceptors** para tokens
6. **Implementar WebSocket** real
7. **Conectar com banco** PostgreSQL
8. **Deploy** no Vercel/Railway

---
*Documento para Lovable - Frontend Only*
*Última atualização: Dezembro 2024*
*Versão: 1.0*