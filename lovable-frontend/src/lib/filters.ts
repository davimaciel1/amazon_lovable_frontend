import { z } from 'zod';

export const datePresets = [
  { label: 'Today', value: 'today' },
  { label: 'Last 24h', value: '24h' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 days', value: '7days' },
  { label: 'Last 14 days', value: '14days' },
  { label: 'Last 30 days', value: '30days' },
  { label: 'This month', value: 'thisMonth' },
  { label: 'Last month', value: 'lastMonth' },
  { label: 'Last 3 months', value: '3months' },
  { label: 'Last 6 months', value: '6months' },
  { label: 'Last 12 months', value: '12months' },
  { label: 'Year to date', value: 'ytd' },
  { label: 'Last year', value: 'lastYear' },
  { label: 'All time', value: 'allTime' },
  { label: 'Custom', value: 'custom' },
] as const;

export const marketplaces = [
  { value: 'US', label: 'United States', group: 'North America' },
  { value: 'CA', label: 'Canada', group: 'North America' },
  { value: 'MX', label: 'Mexico', group: 'North America' },
  { value: 'UK', label: 'United Kingdom', group: 'Europe' },
  { value: 'DE', label: 'Germany', group: 'Europe' },
  { value: 'FR', label: 'France', group: 'Europe' },
  { value: 'IT', label: 'Italy', group: 'Europe' },
  { value: 'ES', label: 'Spain', group: 'Europe' },
  { value: 'JP', label: 'Japan', group: 'Asia Pacific' },
  { value: 'AU', label: 'Australia', group: 'Asia Pacific' },
  { value: 'IN', label: 'India', group: 'Asia Pacific' },
  { value: 'BR', label: 'Brazil', group: 'Latin America' },
] as const;

export const orderTypes = [
  { value: 'FBA', label: 'Fulfilled by Amazon' },
  { value: 'FBM', label: 'Fulfilled by Merchant' },
  { value: 'Business', label: 'Amazon Business' },
  { value: 'Retail', label: 'Amazon Retail' },
  { value: 'Subscribe', label: 'Subscribe & Save' },
  { value: 'Promotional', label: 'Promotional Orders' },
] as const;

export const sortOptions = [
  { value: 'units', label: 'Units Sold' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'profit', label: 'Profit' },
  { value: 'roi', label: 'ROI' },
  { value: 'acos', label: 'ACOS' },
] as const;

export const metricFields = [
  { value: 'units', label: 'Units' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'profit', label: 'Profit' },
  { value: 'roi', label: 'ROI' },
  { value: 'acos', label: 'ACOS' },
] as const;

export const metricOperators = [
  { value: 'greater', label: 'Greater than' },
  { value: 'less', label: 'Less than' },
  { value: 'between', label: 'Between' },
] as const;

export const filtersSchema = z.object({
  dateRange: z.object({
    preset: z.string().optional(),
    from: z.string(),
    to: z.string(),
  }),
  countries: z.array(z.string()).optional(),
  orderTypes: z.array(z.string()).optional(),
  keyword: z.string().optional(),
  metricFilter: z.object({
    field: z.enum(['units', 'revenue', 'profit', 'roi', 'acos']),
    operator: z.enum(['greater', 'less', 'between']),
    value: z.union([z.number(), z.array(z.number())]),
  }).optional(),
  sortBy: z.enum(['units', 'revenue', 'profit', 'roi', 'acos']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
});

export type Filters = z.infer<typeof filtersSchema>;

export function getDateRangeFromPreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (preset) {
    case 'today':
      // Use full day in UTC from 00:00:00 to 23:59:59
      const startUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const endUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
      return {
        from: startUTC.toISOString(),
        to: endUTC.toISOString(),
      };
    
    case '24h':
      return {
        from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      };
    
    case 'yesterday':
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return {
        from: yesterday.toISOString(),
        to: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
      };
    
    case '7days':
      return {
        from: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      };
    
    case '14days':
      return {
        from: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      };
    
    case '30days':
      return {
        from: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      };
    
    case 'thisMonth':
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        from: thisMonthStart.toISOString(),
        to: now.toISOString(),
      };
    
    case 'lastMonth':
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        from: lastMonthStart.toISOString(),
        to: lastMonthEnd.toISOString(),
      };
    
    case '3months':
      return {
        from: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      };
    
    case '6months':
      return {
        from: new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      };
    
    case '12months':
      return {
        from: new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      };
    
    case 'ytd':
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return {
        from: yearStart.toISOString(),
        to: now.toISOString(),
      };
    
    case 'lastYear':
      const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
      const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
      return {
        from: lastYearStart.toISOString(),
        to: lastYearEnd.toISOString(),
      };
    
    case 'allTime':
      return {
        from: new Date('2020-01-01').toISOString(),
        to: now.toISOString(),
      };
    
    default:
      // Default to last 12 months
      return {
        from: new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      };
  }
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  // If value is already in percentage points (e.g., 15 for 15%), divide by 100
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}