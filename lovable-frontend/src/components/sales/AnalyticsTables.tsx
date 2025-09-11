import React, { useMemo, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/sales/DateRangePicker';
import { getDateRangeFromPreset, marketplaces } from '@/lib/filters';

// Server-side analytics tables for the Sales page
// Calls /api/analytics endpoints with pagination and sorting

type Dataset = 'topProducts' | 'lowStock' | 'worstMargins' | 'weeklyDrops';

type Sort = { key: string; dir: 'asc' | 'desc' };

export function AnalyticsTables() {
  const [dataset, setDataset] = useState<Dataset>('topProducts');
  const [dateRange, setDateRange] = useState<{ preset?: string; from: string; to: string}>(() => ({ preset: '30days', ...getDateRangeFromPreset('30days') }));
  const [marketplace, setMarketplace] = useState<string | 'all'>('all');
  const [channel, setChannel] = useState<'all' | 'amazon' | 'ml'>('all');
  const [limit, setLimit] = useState<number>(20);
  const [page, setPage] = useState<number>(1);
  const [sort, setSort] = useState<Sort>({ key: 'revenue', dir: 'desc' });
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useUnified, setUseUnified] = useState<boolean>(false);

  const columns = useMemo(() => {
    const productLabel = channel !== 'amazon' ? 'Produto' : 'ASIN';
    switch (dataset) {
      case 'topProducts':
        return [
          { key: 'asin', label: productLabel },
          { key: 'sku', label: 'SKU' },
          { key: 'title', label: 'Título' },
          { key: 'units', label: 'Unidades' },
          { key: 'revenue', label: 'Receita' },
        ];
      case 'lowStock':
        return [
          { key: 'asin', label: 'ASIN' },
          { key: 'title', label: 'Título' },
          { key: 'inventory_quantity', label: 'Estoque' },
          { key: 'in_stock', label: 'Em estoque' },
        ];
      case 'worstMargins':
        return [
          { key: 'asin', label: productLabel },
          { key: 'title', label: 'Título' },
          { key: 'units', label: 'Unidades' },
          { key: 'revenue', label: 'Receita' },
          { key: 'est_margin', label: 'Margem Est.' },
          { key: 'est_margin_percent', label: '% Margem Est.' },
        ];
      case 'weeklyDrops':
        return [
          { key: 'asin', label: productLabel },
          { key: 'title', label: 'Título' },
          { key: 'week_start', label: 'Semana' },
          { key: 'revenue', label: 'Receita' },
          { key: 'prev_revenue', label: 'Receita ant.' },
          { key: 'revenue_diff', label: 'Δ Receita' },
          { key: 'revenue_diff_percent', label: '% Δ Receita' },
        ];
    }
  }, [dataset, channel]);

  function toggleSort(key: string) {
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
    setPage(1);
  }

  async function runQuery() {
    setError(null);
    setLoading(true);
    setRows([]);

    try {
      const start = dateRange.from?.slice(0,10);
      const end = dateRange.to?.slice(0,10);
      const mkt = marketplace === 'all' ? undefined : marketplace;
      const offset = (page - 1) * limit;
      const params = new URLSearchParams();
      if (dataset !== 'lowStock') {
        if (start) params.set('start', start);
        if (end) params.set('end', end);
      }
      if (mkt) params.set('marketplace', mkt);
      if (channel) params.set('channel', channel);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('sortBy', sort.key);
      params.set('sortDir', sort.dir);

      // Determine API base. Use absolute VITE_API_URL when provided, fallback to '/api' (dev proxy)
      const RAW_BASE: string | undefined = (import.meta.env as any).VITE_API_URL?.trim();
      const API_BASE = RAW_BASE
        ? (RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE.replace(/\/$/, '')}/api`)
        : '/api';

      let endpoint = '';
      switch (dataset) {
        case 'topProducts': endpoint = useUnified ? '/analytics/unified/top-products' : '/analytics/top-products'; break;
        case 'lowStock': endpoint = '/analytics/low-stock'; break;
        case 'worstMargins': endpoint = '/analytics/worst-margins'; break;
        case 'weeklyDrops': endpoint = useUnified ? '/analytics/unified/weekly-drops' : '/analytics/weekly-drops'; break;
      }

      const headers: Record<string, string> = {};
      const apiKey = (import.meta.env as any).VITE_API_KEY as string | undefined;
      if (apiKey) headers['X-API-Key'] = apiKey;

      const url = `${API_BASE}${endpoint}?${params.toString()}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setRows(json?.items || []);
    } catch (e: any) {
      setError(e?.message || 'query failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runQuery(); /* eslint-disable-next-line */ }, [dataset, dateRange.from, dateRange.to, marketplace, channel, limit, page, sort.key, sort.dir]);

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="font-semibold">Analytics (Server-side)</div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dataset} onValueChange={(v) => { setDataset(v as Dataset); setPage(1); }}>
            <SelectTrigger data-testid="dataset-select" className="w-[170px]"><SelectValue placeholder="Dataset" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="topProducts">Top Produtos</SelectItem>
              <SelectItem value="lowStock">Baixo Estoque</SelectItem>
              <SelectItem value="worstMargins">Piores Margens</SelectItem>
              <SelectItem value="weeklyDrops">Quedas semanais</SelectItem>
            </SelectContent>
          </Select>

          {/* Marketplace filter */}
          <Select value={marketplace} onValueChange={(v) => { setMarketplace(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Marketplace" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(marketplaces || []).map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.value}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Channel (Canal) filter */}
          <Select value={channel} onValueChange={(v) => { setChannel(v as any); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Canal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos canais</SelectItem>
              <SelectItem value="amazon">Amazon</SelectItem>
              <SelectItem value="ml">Mercado Livre</SelectItem>
            </SelectContent>
          </Select>

          {/* Date range picker (not used for low-stock) */}
          {dataset !== 'lowStock' && (
            <DateRangePicker value={dateRange} onChange={(v) => { setDateRange(v); setPage(1); }} />
          )}

          {/* Page size */}
          <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-[100px]"><SelectValue placeholder="Limite" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>

          {/* Unified toggle */}
          <label className="flex items-center gap-1 text-sm px-2 select-none">
            <input type="checkbox" checked={useUnified} onChange={(e) => { setUseUnified(e.target.checked); setPage(1); }} />
            Usar camada unificada
          </label>

          <Button size="sm" onClick={() => { setPage(1); runQuery(); }} disabled={loading}>{loading ? 'Carregando…' : 'Buscar'}</Button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">Erro: {error}</div>}
      {!loading && rows.length === 0 && (
        <div className="text-sm text-muted-foreground">Sem dados no período selecionado.</div>
      )}

      <div className="overflow-auto border rounded">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className="cursor-pointer" onClick={() => toggleSort(c.key)}>
                  {c.label} {sort.key === c.key ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={idx}>
                {columns.map((c) => {
                  const val = r?.[c.key];
                  let text: string = '';
                  if (val === null || val === undefined) text = '—';
                  else if (c.key.endsWith('_percent') || c.key === 'delta_percent' || c.key === 'revenue_diff_percent') {
                    const num = Number(val);
                    text = Number.isFinite(num) ? `${(num * (num <= 1 ? 100 : 1)).toFixed(1)}%` : String(val);
                  } else if (c.key.includes('revenue') || c.key.includes('margin') || c.key === 'est_margin') {
                    const num = Number(val);
                    text = Number.isFinite(num) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num) : String(val);
                  } else if (typeof val === 'boolean') {
                    text = val ? 'Sim' : 'Não';
                  } else {
                    text = String(val);
                  }
                  return (<TableCell key={c.key}>{text}</TableCell>);
                })}
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">Sem dados</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Página {page}</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>Anterior</Button>
          <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      </div>
    </Card>
  );
}

