import { toast } from "sonner";
// import { useAuth } from "@clerk/clerk-react";

// Use proxy for Replit environment, direct connection for other environments
const RAW_BASE: string | undefined = (import.meta.env as any).VITE_API_URL?.trim();
const API_URL = RAW_BASE
  ? (RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE.replace(/\/$/, '')}/api`)
  : '/api'; // Use proxy path for Replit
const API_KEY: string | undefined = (import.meta.env as any).VITE_API_KEY?.trim() || undefined;

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

class ApiService {
  private getToken: (() => Promise<string | null>) | null = null;

  setTokenGetter(tokenGetter: () => Promise<string | null>) {
    this.getToken = tokenGetter;
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
      };

      // Get Clerk session token if available
      if (this.getToken) {
        const token = await this.getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      // Attach API key automatically for ALL requests if provided (backend enforces auth)
      if (API_KEY) {
        (headers as any)['X-API-Key'] = API_KEY;
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include', // Important for cookies
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { data };
    } catch (error: any) {
      console.error('API Error:', error);
      return { error: error.message || 'An error occurred' };
    }
  }

  // Dashboard methods
  async getDashboard(): Promise<ApiResponse> {
    return this.request('/dashboard');
  }

  async getDashboardStats(): Promise<ApiResponse> {
    return this.request('/dashboard/stats');
  }

  // Products methods
  async getProducts(params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
  }): Promise<ApiResponse> {
    const queryString = new URLSearchParams(params as any).toString();
    return this.request(`/products${queryString ? `?${queryString}` : ''}`);
  }

  async getTopProducts(): Promise<ApiResponse> {
    return this.request('/products/top');
  }

  async getProduct(asin: string): Promise<ApiResponse> {
    return this.request(`/products/${asin}`);
  }

  async updateProduct(asin: string, data: any): Promise<ApiResponse> {
    return this.request(`/products/${asin}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Orders methods
  async getOrders(params?: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<ApiResponse> {
    const queryString = new URLSearchParams(params as any).toString();
    return this.request(`/orders${queryString ? `?${queryString}` : ''}`);
  }

  async getOrder(orderId: string): Promise<ApiResponse> {
    return this.request(`/orders/${orderId}`);
  }

  async getOrderSummary(): Promise<ApiResponse> {
    return this.request('/orders/summary');
  }

  // Mercado Livre - Orders
  async getMlOrders(params?: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    search?: string;
  }): Promise<ApiResponse> {
    const qs = new URLSearchParams(params as any).toString();
    return this.request(`/ml/orders${qs ? `?${qs}` : ''}`);
  }

  async getMlOrder(orderId: string): Promise<ApiResponse> {
    return this.request(`/ml/orders/${orderId}`);
  }

  async getMlOrdersSummary(period: '7d' | '30d' | '90d' | 'all' = '30d'): Promise<ApiResponse> {
    const qs = period ? `?period=${period}` : '';
    return this.request(`/ml/orders/summary${qs}`);
  }

  // Metrics methods
  async getRealtimeMetrics(): Promise<ApiResponse> {
    return this.request('/metrics/realtime');
  }

  async getSalesMetrics(period?: string): Promise<ApiResponse> {
    const queryString = period ? `?period=${period}` : '';
    return this.request(`/metrics/sales${queryString}`);
  }

  async getProductMetrics(): Promise<ApiResponse> {
    return this.request('/metrics/products');
  }

  // Sales methods
  async getSales(params?: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    countries?: string[];
    orderTypes?: string[];
    brands?: string[];
    keyword?: string;
    channel?: 'all' | 'amazon' | 'ml';
  }): Promise<ApiResponse> {
    // Always call real backend; no mock AI test endpoint here
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    if (params?.sortDir) qs.set('sortDir', params.sortDir);
if (params?.keyword) qs.set('keyword', params.keyword);
    if (params?.channel) qs.set('channel', params.channel);
    if (params?.countries?.length) qs.set('countries', params.countries.join(','));
    if (params?.orderTypes?.length) qs.set('orderTypes', params.orderTypes.join(','));
    if (params?.brands?.length) qs.set('brands', params.brands.join(','));
    if (params?.keyword) qs.set('keyword', params.keyword);
const endpoint = params?.channel && params.channel !== 'amazon' ? '/sales-unified' : '/sales-simple';
    return this.request(`${endpoint}${qs.toString() ? `?${qs.toString()}` : ''}`);
  }

// AI Query endpoints
  async vannaHealth(): Promise<ApiResponse> {
    // Mock health check since we're using AI Query instead
    return { data: { ok: true } };
  }

  async vannaGetSchema(): Promise<ApiResponse> {
    return this.request('/ai-query/schema');
  }

  async vannaGenerateSQL(question: string, schema?: any): Promise<ApiResponse> {
    return this.request('/ai-query/generate', {
      method: 'POST',
      body: JSON.stringify({ query: question, useAI: false }),
    });
  }

  async vannaExecuteSQL(sql: string, limit?: number): Promise<ApiResponse> {
    return this.request('/ai-query/execute', {
      method: 'POST',
      body: JSON.stringify({ sql, limit }),
    });
  }

  // List distinct brands (for filters)
  async getBrands(): Promise<ApiResponse<{ value: string; label: string; count: number }[]>> {
    return this.request('/products/brands');
  }
}

export const api = new ApiService();
