# 🎨 INTEGRAÇÃO LOVABLE-FRONTEND COM BACKEND UNIFICADO

## 📊 ANÁLISE DO LOVABLE-FRONTEND

### Stack Atual
```typescript
{
  "framework": "React 18 + Vite",
  "ui": "Tailwind CSS + shadcn/ui",
  "state": "Zustand (salesStore)",
  "routing": "React Router v6",
  "api": "Axios",
  "auth": "Supabase (pode ser migrado)",
  "linguagem": "TypeScript"
}
```

### Estrutura de Componentes
```
lovable-frontend/src/
├── components/
│   ├── auth/           # Autenticação
│   ├── sales/          # Dashboard de vendas
│   └── ui/             # shadcn components
├── services/
│   └── api.ts          # API client
├── stores/
│   └── salesStore.ts   # Zustand store
└── pages/
    ├── Dashboard.tsx   # Dashboard principal
    ├── Sales.tsx       # Página de vendas
    └── Auth.tsx        # Login/Register
```

---

## 🔄 MUDANÇAS NECESSÁRIAS NO FRONTEND

### 1. Atualizar API Client

```typescript
// src/services/api.ts - ANTES
const API_BASE_URL = 'http://localhost:8080/api';
const endpoints = {
  dashboard: '/dashboard',
  orders: '/orders',
  products: '/products'
};

// src/services/api.ts - DEPOIS
import axios, { AxiosInstance } from 'axios';

class ApiClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      baseURL: process.env.VITE_API_URL || 'http://localhost:8080/api',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Interceptor para adicionar token
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Interceptor para refresh token
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          await this.refreshToken();
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth methods
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    const { accessToken, refreshToken } = response.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    return response.data;
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    const response = await this.client.post('/auth/refresh', { refreshToken });
    localStorage.setItem('accessToken', response.data.accessToken);
    return response.data;
  }

  // Dashboard methods
  async getDashboard(period: string = 'last30days') {
    return this.client.get('/dashboard', { params: { period } });
  }

  // Orders methods
  async getOrders(filters?: any) {
    return this.client.get('/orders', { params: filters });
  }

  async getOrderById(id: string) {
    return this.client.get(`/orders/${id}`);
  }

  // Products methods
  async getProducts(filters?: any) {
    return this.client.get('/products', { params: filters });
  }

  async updateProduct(id: string, data: any) {
    return this.client.patch(`/products/${id}`, data);
  }

  // Campaigns (Advertising)
  async getCampaigns() {
    return this.client.get('/campaigns');
  }

  async getCampaignMetrics(campaignId: string) {
    return this.client.get(`/campaigns/${campaignId}/metrics`);
  }

  async getACOS(period: string = 'last30days') {
    return this.client.get('/campaigns/acos', { params: { period } });
  }

  async getTACOS(period: string = 'last30days') {
    return this.client.get('/campaigns/tacos', { params: { period } });
  }

  // WebSocket connection for real-time updates
  connectWebSocket() {
    const ws = new WebSocket(`ws://localhost:8080`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Update Zustand store with real-time data
      if (data.type === 'ORDER_UPDATE') {
        // Update orders in store
      }
    };

    return ws;
  }
}

export const apiClient = new ApiClient();
```

### 2. Migrar Autenticação (Remover Supabase)

```typescript
// src/hooks/useAuth.tsx - NOVO
import { create } from 'zustand';
import { apiClient } from '@/services/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    try {
      const response = await apiClient.login(email, password);
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false
    });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const response = await apiClient.getProfile();
      set({
        user: response.data,
        isAuthenticated: true,
        isLoading: false
      });
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false
      });
    }
  }
}));
```

### 3. Atualizar Store de Vendas

```typescript
// src/stores/salesStore.ts - ATUALIZADO
import { create } from 'zustand';
import { apiClient } from '@/services/api';

interface SalesStore {
  orders: Order[];
  products: Product[];
  campaigns: Campaign[];
  metrics: {
    totalRevenue: number;
    totalOrders: number;
    acos: number;
    tacos: number;
    conversion: number;
  };
  isLoading: boolean;
  
  fetchDashboard: () => Promise<void>;
  fetchOrders: (filters?: any) => Promise<void>;
  fetchProducts: (filters?: any) => Promise<void>;
  fetchCampaigns: () => Promise<void>;
  fetchACOSMetrics: (period: string) => Promise<void>;
}

export const useSalesStore = create<SalesStore>((set, get) => ({
  orders: [],
  products: [],
  campaigns: [],
  metrics: {
    totalRevenue: 0,
    totalOrders: 0,
    acos: 0,
    tacos: 0,
    conversion: 0
  },
  isLoading: false,

  fetchDashboard: async () => {
    set({ isLoading: true });
    try {
      const response = await apiClient.getDashboard();
      set({
        metrics: response.data.metrics,
        orders: response.data.recentOrders,
        isLoading: false
      });
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      set({ isLoading: false });
    }
  },

  fetchOrders: async (filters) => {
    set({ isLoading: true });
    try {
      const response = await apiClient.getOrders(filters);
      set({ orders: response.data, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      set({ isLoading: false });
    }
  },

  fetchProducts: async (filters) => {
    set({ isLoading: true });
    try {
      const response = await apiClient.getProducts(filters);
      set({ products: response.data, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch products:', error);
      set({ isLoading: false });
    }
  },

  fetchCampaigns: async () => {
    set({ isLoading: true });
    try {
      const response = await apiClient.getCampaigns();
      set({ campaigns: response.data, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
      set({ isLoading: false });
    }
  },

  fetchACOSMetrics: async (period) => {
    try {
      const [acosResponse, tacosResponse] = await Promise.all([
        apiClient.getACOS(period),
        apiClient.getTACOS(period)
      ]);
      
      set(state => ({
        metrics: {
          ...state.metrics,
          acos: acosResponse.data.acos,
          tacos: tacosResponse.data.tacos
        }
      }));
    } catch (error) {
      console.error('Failed to fetch ACOS metrics:', error);
    }
  }
}));
```

### 4. Variáveis de Ambiente

```bash
# .env.local
VITE_API_URL=http://localhost:8080/api
VITE_WS_URL=ws://localhost:8080
VITE_APP_NAME=Amazon Seller Dashboard
```

---

## 📦 BACKENDS A SEREM REMOVIDOS

### 1. amazon-dashboard (Next.js)
- ❌ **REMOVER COMPLETAMENTE**
- Funcionalidades já existem no lovable-frontend
- Economiza recursos e manutenção

### 2. Dashboard-server.js files
- ❌ **REMOVER**: dashboard-server.js
- ❌ **REMOVER**: dashboard-server-complete.js
- Funcionalidades migradas para backend unificado

---

## 🚀 DEPLOY DO SISTEMA FINAL

### Arquitetura Final

```
┌─────────────────────┐
│  lovable-frontend   │
│   (React + Vite)    │
│    Port: 8087       │
└──────────┬──────────┘
           │
           │ HTTPS/WSS
           │
┌──────────▼──────────┐
│  Backend Unificado  │
│   (TypeScript)      │
│    Port: 8080       │
└──────────┬──────────┘
           │
           │ PostgreSQL
           │
┌──────────▼──────────┐
│     Database        │
│   PostgreSQL 15     │
│    Port: 5456       │
└─────────────────────┘

Opcional (manter separado):
┌─────────────────────┐
│     n8n-mcp         │
│  (MCP Protocol)     │
│    Port: 8080       │
└─────────────────────┘
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build: ./lovable-frontend
    ports:
      - "80:80"
    environment:
      - VITE_API_URL=http://api:3000
    depends_on:
      - api

  api:
    build: ./amazon-unified-backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=amazon_monitor
      - DB_USER=saas
      - DB_PASSWORD=<DB_PASSWORD>
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    ports:
      - "5456:5432"
    environment:
      - POSTGRES_DB=amazon_monitor
      - POSTGRES_USER=saas
      - POSTGRES_PASSWORD=<DB_PASSWORD>
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

## 📋 CHECKLIST DE INTEGRAÇÃO

### Frontend (lovable-frontend)
- [ ] Atualizar API client para novo backend
- [ ] Remover dependências do Supabase
- [ ] Implementar novo sistema de auth
- [ ] Atualizar stores (Zustand)
- [ ] Configurar WebSocket para real-time
- [ ] Atualizar variáveis de ambiente
- [ ] Testar todas as funcionalidades

### Backend Unificado
- [ ] Implementar todas as APIs necessárias
- [ ] Sistema de autenticação JWT
- [ ] WebSocket server
- [ ] Endpoints de ACOS/TACOS
- [ ] Jobs agendados
- [ ] Documentação Swagger

### Remoção
- [ ] Deletar amazon-dashboard/
- [ ] Deletar dashboard-server*.js
- [ ] Limpar package.json raiz
- [ ] Remover dependências não utilizadas

---

## 🎯 RESULTADO FINAL

### Sistema Completo
```
DE: 7 backends + 2 frontends
PARA: 1 backend + 1 frontend (+ n8n-mcp opcional)

Redução de 77% na complexidade
```

### Benefícios
1. **Manutenção simplificada** - apenas 2 sistemas principais
2. **Deploy único** - Docker compose com 2 services
3. **Performance otimizada** - sem duplicação de recursos
4. **Developer experience** - Stack única e moderna
5. **Economia** - Redução de 60% nos custos de infraestrutura