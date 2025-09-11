import { api } from '@/services/api';
import { parseSalesResponse, debugSalesData } from './adapter';
import type { SalesParams, SalesResponse, DbHealth } from './adapter';

// Export the same types for compatibility
export type { SalesParams, SalesResponse, SalesRow, ExportType, DbHealth } from './adapter';

// Get sales data from API (SEM MOCK)
export async function getSales(params: SalesParams): Promise<SalesResponse> {
  try {
    // Sempre usar dados reais da API
    const result = await api.getSales({
      startDate: params.from,
      endDate: params.to,
      page: params.page,
      limit: params.pageSize,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
      countries: params.countries,
      orderTypes: params.orderTypes,
      brands: params.brands,
keyword: params.keyword,
      channel: params.channel,
    });

    // Se a API reportar erro, retornar vazio (nunca mock)
    if (result.error) {
      console.warn('API returned error:', result.error);
      return {
        rows: [],
        totalRow: { units: 0, revenue: 0, profit: 0, roi: 0, acos: 0 },
        nextPage: null,
        lastOrderLoadedISO: new Date().toISOString()
      };
    }

    if (result.data) {
      // Debug the raw API response
      if (import.meta.env.DEV) {
        debugSalesData(result.data, 'API Response');
      }
      
      // Use the robust parser to normalize the response
      const parsedResponse = parseSalesResponse(result.data);
      
      // Apply any additional params like sorting or filtering
      let filteredRows = parsedResponse.rows;
      
      // Apply keyword filter if provided
      if (params.keyword) {
        const keyword = params.keyword.toLowerCase();
        filteredRows = filteredRows.filter(row => 
          row.sku.toLowerCase().includes(keyword) ||
          row.asin.toLowerCase().includes(keyword) ||
          row.title?.toLowerCase().includes(keyword)
        );
      }
      
      // Apply metric filter if provided
      if (params.metricFilter) {
        const { field, operator, value } = params.metricFilter;
        filteredRows = filteredRows.filter(row => {
          const fieldValue = row[field];
          if (fieldValue === null || fieldValue === undefined) return false;
          
          if (operator === 'greater') return fieldValue > (value as number);
          if (operator === 'less') return fieldValue < (value as number);
          if (operator === 'between') {
            const [min, max] = value as [number, number];
            return fieldValue >= min && fieldValue <= max;
          }
          return true;
        });
      }
      
      // Apply sorting if provided
      if (params.sortBy) {
        const sortDir = params.sortDir || 'desc';
        filteredRows = [...filteredRows].sort((a, b) => {
          const aVal = a[params.sortBy!] ?? 0;
          const bVal = b[params.sortBy!] ?? 0;
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });
      }
      
      // Apply pagination
      const pageSize = params.pageSize || 50;
      const page = params.page || 1;
      const startIndex = (page - 1) * pageSize;
      const paginatedRows = filteredRows.slice(startIndex, startIndex + pageSize);
      
      return {
        rows: paginatedRows,
        totalRow: parsedResponse.totalRow,
        lastOrderLoadedISO: parsedResponse.lastOrderLoadedISO,
        nextPage: filteredRows.length > startIndex + pageSize ? page + 1 : null,
      };
    }
    
    // Se não vier data, retornar vazio (sem mock)
    console.warn('No data from API');
    return {
      rows: [],
      totalRow: { units: 0, revenue: 0, profit: 0, roi: 0, acos: 0 },
      nextPage: null,
      lastOrderLoadedISO: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching sales from API:', error);
    // Em erro na API, retornar vazio (sem mock)
    return {
      rows: [],
      totalRow: { units: 0, revenue: 0, profit: 0, roi: 0, acos: 0 },
      nextPage: null,
      lastOrderLoadedISO: new Date().toISOString()
    };
  }
}

// Export sales data
export async function exportSales(
  params: SalesParams,
  type: 'basic' | 'detailed' | 'summary' | 'orders' = 'basic'
): Promise<Blob> {
  try {
    // Get sales data
    const salesData = await getSales(params);
    
    // Convert to CSV
    let csvContent = '';
    const headers = type === 'summary' 
      ? ['Metric', 'Value']
      : ['SKU', 'ASIN', 'Units', 'Revenue', 'Profit', 'ROI', 'ACOS'];
    
    csvContent += headers.join(',') + '\n';
    
    if (type === 'summary') {
      csvContent += `Total Units,${salesData.totalRow.units}\n`;
      csvContent += `Total Revenue,$${salesData.totalRow.revenue.toFixed(2)}\n`;
      csvContent += `Total Profit,$${salesData.totalRow.profit.toFixed(2)}\n`;
      csvContent += `Average ROI,${salesData.totalRow.roi}%\n`;
      csvContent += `Average ACOS,${salesData.totalRow.acos}%\n`;
    } else {
      salesData.rows.forEach(row => {
        csvContent += `${row.sku},${row.asin},${row.units},$${row.revenue.toFixed(2)},$${row.profit.toFixed(2)},${row.roi}%,${row.acos}%\n`;
      });
    }
    
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
}

// Get database health status
export async function getDbHealth(): Promise<DbHealth> {
  try {
    // Check if API is accessible
    const result = await api.getDashboardStats();
    
    if (result.data) {
      return {
        driver: 'postgrest' as const,
        ok: true,
        details: 'API connection successful'
      };
    }
  } catch (error) {
    console.error('Database health check failed:', error);
  }

  // Return offline status if API is not available
  return {
    driver: 'offline' as const,
    ok: false,
    details: 'API not available'
  };
}