import { z } from 'zod';

// Field normalization schemas
const salesRowSchema = z.object({
  // ID fields - multiple possible names
  id: z.union([z.string(), z.number()]).optional(),
  order_id: z.union([z.string(), z.number()]).optional(),
  amazon_order_id: z.string().optional(),
  
  // Product identifiers
  sku: z.string().optional(),
  seller_sku: z.string().optional(),
  sellersku: z.string().optional(),
  
  asin: z.string().optional(),
  advertised_asin: z.string().optional(),
  
  // Product details
  title: z.string().optional(),
  product_title: z.string().optional(),
  name: z.string().optional(),
  
  // Images - multiple possible field names
  image_url: z.string().optional(),
  imageUrl: z.string().optional(),
  image: z.string().optional(),
  product_image: z.string().optional(),
  
// Quantities - multiple possible names
  units: z.union([z.number(), z.string()]).optional(),
  units_sold: z.union([z.number(), z.string()]).optional(),
  quantity: z.union([z.number(), z.string()]).optional(),
  quantity_ordered: z.union([z.number(), z.string()]).optional(),
  quantityordered: z.union([z.number(), z.string()]).optional(),
  
  // Revenue fields
  revenue: z.union([z.number(), z.string()]).optional(),
  gross_revenue: z.union([z.number(), z.string()]).optional(),
  total_revenue: z.union([z.number(), z.string()]).optional(),
  sales: z.union([z.number(), z.string()]).optional(),
  item_price_amount: z.union([z.number(), z.string()]).optional(),
  itempriceamount: z.union([z.number(), z.string()]).optional(),
  
  // Profit fields (nullable allowed)
  profit: z.union([z.number(), z.string()]).nullable().optional(),
  net_profit: z.union([z.number(), z.string()]).nullable().optional(),
  gross_profit: z.union([z.number(), z.string()]).nullable().optional(),
  
  // ROI - can be decimal (2.5) or percentage (250) (nullable)
  roi: z.union([z.number(), z.string()]).nullable().optional(),
  return_on_investment: z.union([z.number(), z.string()]).nullable().optional(),
  
  // ACOS - can be fraction (0.15) or percentage (15) (nullable)
  acos: z.union([z.number(), z.string()]).nullable().optional(),
  advertising_cost_of_sale: z.union([z.number(), z.string()]).nullable().optional(),
  
  // Health status (nullable allowed)
  health: z.enum(['good', 'warning', 'bad']).nullable().optional(),
  status: z.enum(['good', 'warning', 'bad']).nullable().optional(),
  
  // Additional fields
  marketplace_id: z.string().optional(),
  marketplaceId: z.string().optional(),
  stock: z.union([z.number(), z.string()]).nullable().optional(),
  buy_box_winner: z.union([z.string(), z.boolean()]).nullable().optional(),
  sellers: z.union([z.number(), z.string()]).nullable().optional(),
}).passthrough(); // Allow additional fields to pass through

export type SalesParams = {
  from: string;
  to: string;
  channel?: 'all' | 'amazon' | 'ml';
  sortBy?: 'units' | 'revenue' | 'profit' | 'roi' | 'acos';
  sortDir?: 'asc' | 'desc';
  countries?: string[];
  orderTypes?: string[];
  brands?: string[];
  keyword?: string;
  metricFilter?: {
    field: 'units' | 'revenue' | 'profit' | 'roi' | 'acos';
    operator: 'greater' | 'less' | 'between';
    value: number | [number, number];
  };
  page?: number;
  pageSize?: number;
};

export type SalesCosts = {
  compra?: number | null;
  armazenagem?: number | null;
  frete_amazon?: number | null;
  custos_percentuais?: number | null;
  imposto_percent?: number | null;
  custo_variavel_percent?: number | null;
  margem_contribuicao_percent?: number | null;
  custos_manuais?: boolean | null;
};

export type SalesRow = {
  id: string;
  sku: string;
  asin: string;
  health: 'good' | 'warning' | 'bad' | null;
  units: number;
  revenue: number;
  profit: number | null;
  roi: number | null;
  acos: number | null;
  title?: string;
  image_url?: string | null;
  imageUrl?: string | null; // Support both conventions
  stock?: number | null;
  buy_box_winner?: string | null;
  sellers?: number | null;
  marketplace_id?: string;
  costs?: SalesCosts;
};

export type SalesResponse = {
  rows: SalesRow[];
  totalRow: {
    units: number;
    revenue: number;
    profit: number;
    roi: number;
    acos: number;
  };
  lastOrderLoadedISO: string;
  nextPage?: number | null;
  page?: number;
  pages?: number;
  total?: number;
  limit?: number;
};

export type ExportType = 'basic' | 'detailed' | 'summary' | 'orders';

export type DbHealth = {
  driver: 'pg' | 'postgrest' | 'mock' | 'api' | 'offline';
  ok: boolean;
  details?: string;
};

/**
 * Normalize a single sales row from various backend formats
 */
function normalizeSalesRow(raw: any): SalesRow {
  const parsed = salesRowSchema.parse(raw);
  
  // Extract ID - prioritize in order
  const id = String(
    parsed.id || 
    parsed.order_id || 
    parsed.amazon_order_id || 
    `${parsed.asin || 'unknown'}_${Date.now()}_${Math.random()}`
  );
  
  // Extract SKU - try multiple field names
  const sku = parsed.sku || 
    parsed.seller_sku || 
    parsed.sellersku || 
    'N/A';
  
  // Extract ASIN
  const asin = parsed.asin || 
    parsed.advertised_asin || 
    'N/A';
  
  // Extract title
  const title = parsed.title || 
    parsed.product ||  // Backend returns 'product' field
    parsed.product_title || 
    parsed.name || 
    undefined;
  
  // Extract image URL - normalize to both conventions
  const imageUrl = parsed.image_url || 
    parsed.imageUrl || 
    parsed.image || 
    parsed.product_image || 
    null;
  
  // Extract units - try multiple field names
  const units = parsed.units ?? 
    parsed.units_sold ?? 
    parsed.quantity ?? 
    parsed.quantity_ordered ?? 
    parsed.quantityordered ?? 
    0;
  
  // Extract revenue
  const revenue = parsed.revenue ?? 
    parsed.gross_revenue ?? 
    parsed.total_revenue ?? 
    parsed.sales ?? 
    parsed.item_price_amount ?? 
    parsed.itempriceamount ?? 
    0;
  
  // Extract profit - keep null if not provided (do not simulate)
  let profit = parsed.profit ?? 
    parsed.net_profit ?? 
    parsed.gross_profit ?? 
    null;
  
  // Normalize ROI - convert to percentage if needed
  let roi = parsed.roi ?? parsed.return_on_investment ?? null;
  
  // Calculate ROI if not provided but we have profit and revenue
  if (roi === null && profit !== null && revenue > profit) {
    roi = (profit / (revenue - profit)) * 100;
  } else if (roi !== null && roi < 10) {
    // Likely a decimal (e.g., 2.5 means 250%)
    roi = roi * 100;
  }
  
  // Normalize ACOS - convert to percentage if needed  
  let acos = parsed.acos ?? parsed.advertising_cost_of_sale ?? null;
  
  // Keep ACOS as null if not provided; do not simulate
  if (acos !== null && acos < 1) {
    // Likely a fraction (e.g., 0.15 means 15%)
    acos = acos * 100;
  }
  
  // Extract health
  const health = parsed.health || parsed.status || null;
  
  // Extract marketplace
  const marketplace_id = parsed.marketplace_id || parsed.marketplaceId || undefined;
  
  const costs: SalesCosts | undefined = (
    parsed.compra !== undefined || parsed.custos_manuais !== undefined || parsed.costs
  ) ? {
    compra: parsed.compra ?? parsed.costs?.compra ?? null,
    armazenagem: parsed.armazenagem ?? parsed.costs?.armazenagem ?? null,
    frete_amazon: parsed.frete_amazon ?? parsed.costs?.frete_amazon ?? null,
    custos_percentuais: parsed.custos_percentuais ?? parsed.costs?.custos_percentuais ?? null,
    imposto_percent: parsed.imposto_percent ?? parsed.costs?.imposto_percent ?? null,
    custo_variavel_percent: parsed.custo_variavel_percent ?? parsed.costs?.custo_variavel_percent ?? null,
    margem_contribuicao_percent: parsed.margem_contribuicao_percent ?? parsed.costs?.margem_contribuicao_percent ?? null,
    custos_manuais: (parsed.custos_manuais ?? parsed.costs?.custos_manuais) ?? null,
  } : undefined;

  return {
    id,
    sku,
    asin,
    health,
    units: Number(units) || 0,
    revenue: Number(revenue) || 0,
    profit: profit !== null ? Number(profit) : null,
    roi: roi !== null ? Number(roi) : null,
    acos: acos !== null ? Number(acos) : null,
    title,
    image_url: imageUrl,
    imageUrl, // Include both for compatibility
    stock: parsed.stock !== undefined ? Number(parsed.stock) : null,
    buy_box_winner: parsed.buy_box_winner || null,
    sellers: parsed.sellers !== undefined ? Number(parsed.sellers) : null,
    marketplace_id,
    costs,
  };
}

/**
 * Calculate totals from normalized rows
 */
function calculateTotalRow(rows: SalesRow[]): SalesResponse['totalRow'] {
  if (rows.length === 0) {
    return {
      units: 0,
      revenue: 0,
      profit: 0,
      roi: 0,
      acos: 0,
    };
  }
  
  const totals = rows.reduce((acc, row) => {
    acc.units += row.units || 0;
    acc.revenue += row.revenue || 0;
    acc.profit += row.profit || 0;
    
    // For weighted ACOS: accumulate cost and revenue
    if (row.acos !== null && row.revenue > 0) {
      const cost = (row.acos / 100) * row.revenue;
      acc.totalCost += cost;
      acc.totalRevenue += row.revenue;
    }
    
    // For average ROI: accumulate valid ROI values
    if (row.roi !== null) {
      acc.roiSum += row.roi;
      acc.roiCount++;
    }
    
    return acc;
  }, {
    units: 0,
    revenue: 0,
    profit: 0,
    totalCost: 0,
    totalRevenue: 0,
    roiSum: 0,
    roiCount: 0,
  });
  
  // Calculate weighted ACOS
  const acos = totals.totalRevenue > 0 
    ? (totals.totalCost / totals.totalRevenue) * 100 
    : 0;
  
  // Calculate average ROI
  const roi = totals.roiCount > 0 
    ? totals.roiSum / totals.roiCount 
    : 0;
  
  return {
    units: Math.round(totals.units),
    revenue: Math.round(totals.revenue * 100) / 100,
    profit: Math.round(totals.profit * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    acos: Math.round(acos * 100) / 100,
  };
}

/**
 * Main parsing function that normalizes any sales response
 */
export function parseSalesResponse(data: any): SalesResponse {
  // Handle different response structures
  let rawRows: any[] = [];
  let rawTotalRow: any = null;
  let nextPage: number | null = null;
  let lastOrderLoadedISO: string = new Date().toISOString();
  let page: number | undefined;
  let pages: number | undefined;
  let total: number | undefined;
  let limit: number | undefined;
  
  // Extract rows from various possible structures
  if (Array.isArray(data)) {
    // Direct array of rows
    rawRows = data;
  } else if (data && typeof data === 'object') {
    // Check for backend API structure: { success: true, data: [...], pagination: {...} }
    if (data.success && Array.isArray(data.data)) {
      rawRows = data.data;
    }
    // Check if data.data has numeric keys (object with "0", "1", "2", etc.)
    else if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      const dataKeys = Object.keys(data.data);
      const hasNumericKeys = dataKeys.length > 0 && dataKeys.every(key => !isNaN(Number(key)));
      
      if (hasNumericKeys) {
        // Convert object with numeric keys to array
        rawRows = dataKeys
          .sort((a, b) => Number(a) - Number(b))
          .map(key => data.data[key]);
      } else {
        // Try other nested structures
        rawRows = data.data.rows || data.data.sales || [];
      }
    } else {
      // Nested structure - try multiple possible field names
      rawRows = data.rows || 
        data.data?.rows || 
        data.data?.sales || 
        data.sales || 
        data.items || 
        data.results || 
        (Array.isArray(data.data) ? data.data : []) ||
        [];
    }
    
    // Extract totalRow if provided
    rawTotalRow = data.totalRow || 
      data.data?.totalRow || 
      data.summary || 
      data.totals || 
      null;
    
    // Extract pagination
    nextPage = data.nextPage ?? 
      data.data?.nextPage ?? 
      data.next_page ?? 
      null;

    // Extract page info
    const p = data.pagination || data.data?.pagination;
    if (p) {
      page = Number(p.page) || undefined;
      pages = Number(p.pages) || undefined;
      total = Number(p.total) || undefined;
      limit = Number(p.limit) || undefined;
    }
    
    // Extract timestamp
    lastOrderLoadedISO = data.lastOrderLoadedISO || 
      data.data?.lastOrderLoadedISO || 
      data.timestamp || 
      new Date().toISOString();
  }
  
  // Normalize all rows
  const normalizedRows = rawRows.map(row => {
    try {
      return normalizeSalesRow(row);
    } catch (error) {
      console.warn('Failed to normalize row:', row, error);
      // Return a minimal valid row on error
      return {
        id: String(Math.random()),
        sku: 'ERROR',
        asin: 'ERROR',
        health: null,
        units: 0,
        revenue: 0,
        profit: null,
        roi: null,
        acos: null,
      };
    }
  });
  
  // Calculate or normalize totalRow
  const totalRow = rawTotalRow 
    ? {
        units: Number(rawTotalRow.units || rawTotalRow.total_units || 0),
        revenue: Number(rawTotalRow.revenue || rawTotalRow.total_revenue || 0),
        profit: Number(rawTotalRow.profit || rawTotalRow.total_profit || 0),
        roi: Number(rawTotalRow.roi || rawTotalRow.average_roi || 0),
        acos: Number(rawTotalRow.acos || rawTotalRow.average_acos || 0),
      }
    : calculateTotalRow(normalizedRows);
  
  return {
    rows: normalizedRows,
    totalRow,
    lastOrderLoadedISO,
    nextPage,
    page,
    pages,
    total,
    limit,
  };
}

/**
 * Debug function to log parsed data
 */
export function debugSalesData(data: any, label: string = 'Sales Data') {
  console.group(`🔍 ${label}`);
  
  // Log raw data structure
  console.log('Raw data type:', typeof data);
  console.log('Raw data keys:', data ? Object.keys(data) : 'null');
  
  if (data && typeof data === 'object') {
    // Check for nested data structures
    if (data.data) {
      console.log('data.data keys:', Object.keys(data.data));
      
      // If data.data has numeric keys, show the first item
      const dataKeys = Object.keys(data.data);
      const hasNumericKeys = dataKeys.length > 0 && dataKeys.every(key => !isNaN(Number(key)));
      if (hasNumericKeys && data.data['0']) {
        console.log('data.data[0] sample:', data.data['0']);
      }
    }
    
    // Sample first row if available
    const firstRow = data.rows?.[0] || 
      data.data?.rows?.[0] || 
      data.data?.sales?.[0] || 
      data.data?.['0'] ||
      data[0];
    
    if (firstRow) {
      console.log('First row keys:', Object.keys(firstRow));
      console.log('First row sample:', firstRow);
    }
  }
  
  // Parse and log normalized data
  try {
    const parsed = parseSalesResponse(data);
    console.log('Parsed rows count:', parsed.rows.length);
    console.log('Parsed totalRow:', parsed.totalRow);
    if (parsed.rows.length > 0) {
      console.log('First parsed row:', parsed.rows[0]);
    }
  } catch (error) {
    console.error('Failed to parse:', error);
  }
  
  console.groupEnd();
}

// Export all types and functions
export type { SalesParams, SalesRow, SalesResponse, ExportType, DbHealth };