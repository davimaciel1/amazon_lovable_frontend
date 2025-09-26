import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { FiltersBar } from '@/components/sales/FiltersBar';
import { SalesTable } from '@/components/sales/SalesTable';
import { ExportMenu } from '@/components/sales/ExportMenu';
import { SettingsMenu } from '@/components/sales/SettingsMenu';
import { TutorialsMenu } from '@/components/sales/TutorialsMenu';
import { GroupingModeSelector } from '@/components/sales/GroupingModeSelector';
import { getSales, getDbHealth, type SalesParams } from '@/lib/db/api-adapter';
import { getDateRangeFromPreset, filtersSchema } from '@/lib/filters';
import { useSalesStore } from '@/stores/salesStore';
import { Button } from '@/components/ui/button';
import { RefreshCw, Database, AlertCircle } from 'lucide-react';
// import { UserButton } from '@clerk/clerk-react';

const Sales = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useSalesStore();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Parse filters from URL
  const parseFiltersFromUrl = useCallback(() => {
    // If URL has no preset, try load last filters from localStorage
    const urlPreset = searchParams.get('preset');
    if (!urlPreset) {
      try {
        const raw = localStorage.getItem('sales_last_filters');
        if (raw) {
          const parsed = JSON.parse(raw);
          // Basic sanity check
          if (parsed?.dateRange?.from && parsed?.dateRange?.to) {
            return parsed;
          }
        }
      } catch {}
    }

    const preset = urlPreset || '12months';
    const dateRange = preset === 'custom' 
      ? {
          preset,
          from: searchParams.get('from') || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          to: searchParams.get('to') || new Date().toISOString(),
        }
      : {
          preset,
          ...getDateRangeFromPreset(preset),
        };

return {
      dateRange,
      channel: (searchParams.get('channel') as any) || 'all',
      countries: searchParams.get('countries')?.split(',').filter(Boolean) || [],
      orderTypes: searchParams.get('orderTypes')?.split(',').filter(Boolean) || [],
      brands: searchParams.get('brands')?.split(',').filter(Boolean) || [],
      keyword: searchParams.get('keyword') || '',
      metricFilter: searchParams.get('metricField') ? {
        field: searchParams.get('metricField') as 'units' | 'revenue' | 'profit' | 'roi' | 'acos',
        operator: searchParams.get('metricOperator') as 'greater' | 'less' | 'between',
        value: searchParams.get('metricValue') ? 
          searchParams.get('metricOperator') === 'between' ?
            searchParams.get('metricValue')!.split(',').map(Number) as [number, number] :
            Number(searchParams.get('metricValue')) : 0,
      } : undefined,
      sortBy: searchParams.get('sortBy') as any || 'revenue',
      sortDir: searchParams.get('sortDir') as any || 'desc',
      page: Number(searchParams.get('page')) || 1,
      pageSize: Number(searchParams.get('pageSize')) || 50,
    };
  }, [searchParams]);

  const filters = useMemo(() => parseFiltersFromUrl(), [parseFiltersFromUrl]);

  // Update URL when filters change
  const updateFilters = useCallback((newFilters: Partial<typeof filters>) => {
    const updated = { ...filters, ...newFilters };
    const params = new URLSearchParams();
    
    params.set('preset', updated.dateRange.preset || '12months');
    if (updated.dateRange.preset === 'custom') {
      params.set('from', updated.dateRange.from);
      params.set('to', updated.dateRange.to);
    }
    if (updated.countries?.length) params.set('countries', updated.countries.join(','));
    if (updated.orderTypes?.length) params.set('orderTypes', updated.orderTypes.join(','));
    if (updated.keyword) params.set('keyword', updated.keyword);
    if (updated.brands?.length) params.set('brands', updated.brands.join(','));
    if (updated.metricFilter) {
      params.set('metricField', updated.metricFilter.field);
      params.set('metricOperator', updated.metricFilter.operator);
      params.set('metricValue', Array.isArray(updated.metricFilter.value) 
        ? updated.metricFilter.value.join(',') 
        : String(updated.metricFilter.value));
    }
if (updated.channel) params.set('channel', updated.channel);
    if (updated.sortBy) params.set('sortBy', updated.sortBy);
    if (updated.sortDir) params.set('sortDir', updated.sortDir);
    if (updated.page && updated.page > 1) params.set('page', String(updated.page));
    if (updated.pageSize && updated.pageSize !== 50) params.set('pageSize', String(updated.pageSize));

    setSearchParams(params, { replace: true });
    try {
      const toPersist = {
        dateRange: updated.dateRange,
        countries: updated.countries,
        orderTypes: updated.orderTypes,
        brands: updated.brands,
        keyword: updated.keyword,
        metricFilter: updated.metricFilter,
        sortBy: updated.sortBy,
        sortDir: updated.sortDir,
        page: updated.page,
        pageSize: updated.pageSize,
      };
      localStorage.setItem('sales_last_filters', JSON.stringify(toPersist));
    } catch {}
  }, [filters, setSearchParams]);

  // Convert filters to SalesParams
  const salesParams: SalesParams = useMemo(() => ({
    from: filters.dateRange.from,
    to: filters.dateRange.to,
    countries: filters.countries,
    orderTypes: filters.orderTypes,
    keyword: filters.keyword,
brands: filters.brands,
    channel: (filters as any).channel || 'all',
    metricFilter: filters.metricFilter,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    page: filters.page,
    pageSize: filters.pageSize,
  }), [filters]);

  // Fetch sales data
  const { 
    data: salesData, 
    isLoading, 
    error, 
    refetch,
    isRefetching 
  } = useQuery({
    queryKey: ['sales', salesParams],
    queryFn: () => getSales(salesParams),
    staleTime: 30000, // 30 seconds
    retry: 3,
  });

  // Fetch database health
  const { data: dbHealth } = useQuery({
    queryKey: ['dbHealth'],
    queryFn: getDbHealth,
    staleTime: 300000, // 5 minutes
  });

  // Real-time updates
  useEffect(() => {
    if (!settings.enableRealTimeUpdates) return;

    const interval = setInterval(() => {
      refetch();
      setLastRefresh(new Date());
      toast({
        title: "Data refreshed",
        description: "Sales data has been updated with the latest information.",
        duration: 3000,
      });
    }, settings.autoRefreshInterval);

    return () => clearInterval(interval);
  }, [settings.enableRealTimeUpdates, settings.autoRefreshInterval, refetch]);

  const handleRefresh = () => {
    refetch();
    setLastRefresh(new Date());
    toast({
      title: "Refreshing data",
      description: "Fetching the latest sales information...",
    });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-96">
            <Card className="p-8 max-w-md text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error loading sales data</h3>
              <p className="text-muted-foreground mb-4">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
              <Button onClick={handleRefresh} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-primary text-primary-foreground border-b sticky top-0 z-40 flex-shrink-0 shadow-sm">
        <div className="px-3 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold">
                Sales Dashboard
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-2 text-sm text-white">
                  <span>Live Data • {dbHealth?.driver || 'unknown'}</span>
                  {dbHealth?.driver === 'mock' && (
                    <span className="text-white bg-white/20 px-2 py-1 rounded text-xs font-medium">Demo Mode</span>
                  )}
                </div>
                <div className="text-sm text-white">
                  {lastRefresh.toLocaleTimeString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GroupingModeSelector />
              {/* <UserButton afterSignOutUrl="/" /> */}
              <TutorialsMenu />
              <SettingsMenu />
              <ExportMenu filters={salesParams} />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefetching}
                className="h-8 px-3 text-sm bg-white/25 hover:bg-white/35 text-white border-white/40 font-medium"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden px-1 py-1">
        {/* Filters */}
        <div className="flex-shrink-0 mb-1">
          <FiltersBar filters={filters} onFiltersChange={updateFilters} />
        </div>

        {/* Sales Table */}
        <div className="flex-1 overflow-hidden">
          <SalesTable
            data={salesData}
            isLoading={isLoading}
            filters={filters}
            onFiltersChange={updateFilters}
          />
        </div>


        {/* Pagination Controls */}
        {salesData && (
          <div className="flex items-center justify-between px-3 py-2 border-t mt-2">
            <div className="text-sm text-muted-foreground">
              {typeof salesData.total === 'number' && (
                <span>Total: {salesData.total} items</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateFilters({ page: Math.max(1, (filters.page || 1) - 1) })}
                disabled={(filters.page || 1) <= 1}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {salesData.page || filters.page || 1}
                {salesData.pages ? ` of ${salesData.pages}` : ''}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const current = filters.page || 1;
                  const max = salesData.pages || current + 1;
                  updateFilters({ page: Math.min(max, current + 1) });
                }}
                disabled={salesData.pages ? (filters.page || 1) >= salesData.pages : false}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Sales;