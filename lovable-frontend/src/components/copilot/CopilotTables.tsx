import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DateRangePicker } from '@/components/sales/DateRangePicker';
import { getDateRangeFromPreset, marketplaces } from '@/lib/filters';
import { callCopilotToolDebug } from '@/lib/copilotStream';

// Datasets: topProducts, lowStock, worstMargins, weeklyDrops

type Dataset = 'topProducts' | 'lowStock' | 'worstMargins' | 'weeklyDrops';

type Sort = { key: string; dir: 'asc' | 'desc' };

export function CopilotTables() {
  // No auth in dev: provide a no-op token getter
  const getToken = async () => null;
  const [dataset, setDataset] = useState<Dataset>('topProducts');
  const [dateRange, setDateRange] = useState<{ preset?: string; from: string; to: string}>(() => ({ preset: '30days', ...getDateRangeFromPreset('30days') }));
  const [marketplace, setMarketplace] = useState<string | 'all'>('all');
  const [channel, setChannel] = useState<'all' | 'amazon' | 'ml'>('all');
  const [limit, setLimit] = useState<number>(10);
  const [sort, setSort] = useState<Sort>({ key: 'revenue', dir: 'desc' });
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSort(key: string) {
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }

  async function runQuery() {
    setError(null);
    setLoading(true);
    setRows([]);
    try {
      let tool = '';
      let args: any = {};
      const start = dateRange.from?.slice(0,10);
      const end = dateRange.to?.slice(0,10);
      const mkt = marketplace === 'all' ? undefined : marketplace;

      switch (dataset) {
        case 'topProducts':
          tool = 'getTopProducts';
          args = { start, end, limit, marketplace: mkt, ...(channel ? { channel } : {}) };
          break;
        case 'lowStock':
          tool = 'getInventoryStatus';
          args = { threshold: 10, limit };
          break;
        case 'worstMargins':
          tool = 'getWorstMargins';
          args = { start, end, marketplace: mkt, limit, ...(channel ? { channel } : {}) };
          break;
        case 'weeklyDrops':
          tool = 'getAsinsWithWeeklyDrop';
          args = { start, end, marketplace: mkt, limit, ...(channel ? { channel } : {}) };
          break;
      }

      const resp = await callCopilotToolDebug(tool, args, getToken);

      // Normalize data into rows depending on dataset
      let data: any[] = [];
      if (dataset === 'topProducts') data = resp?.result?.items || [];
      if (dataset === 'lowStock') data = resp?.result?.lowStock || [];
      if (dataset === 'worstMargins') data = resp?.result?.items || [];
      if (dataset === 'weeklyDrops') data = resp?.result?.items || [];

      setRows(data);
    } catch (e: any) {
      setError(e?.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  }

  const columns = useMemo(() => {
    switch (dataset) {
      case 'topProducts':
        return [
          { key: 'asin', label: 'Produto' },
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
          { key: 'asin', label: 'Produto' },
          { key: 'title', label: 'Título' },
          { key: 'units', label: 'Unidades' },
          { key: 'revenue', label: 'Receita' },
          { key: 'est_margin', label: 'Margem Est.' },
          { key: 'est_margin_percent', label: '% Margem Est.' },
        ];
      case 'weeklyDrops':
        return [
          { key: 'asin', label: 'Produto' },
          { key: 'title', label: 'Título' },
          { key: 'week_start', label: 'Semana' },
          { key: 'revenue', label: 'Receita' },
          { key: 'prev_revenue', label: 'Receita semana ant.' },
          { key: 'revenue_diff', label: 'Δ Receita' },
          { key: 'revenue_diff_percent', label: '% Δ Receita' },
        ];
    }
  }, [dataset]);

  const sortedRows = useMemo(() => {
    const k = sort.key;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a?.[k] ?? 0;
      const bv = b?.[k] ?? 0;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sort]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="font-semibold">Tabelas (Copilot Debug Tools)</div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dataset} onValueChange={(v) => setDataset(v as Dataset)}>
            <SelectTrigger data-testid="dataset-select" className="w-[170px]"><SelectValue placeholder="Dataset" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="topProducts">Top Produtos</SelectItem>
              <SelectItem value="lowStock">Baixo Estoque</SelectItem>
              <SelectItem value="worstMargins">Piores Margens</SelectItem>
              <SelectItem value="weeklyDrops">Quedas semanais</SelectItem>
            </SelectContent>
          </Select>

          {/* Export CSV */}
          <Button size="sm" variant="outline" onClick={() => {
            const cols = columns.map(c => c.key);
            const header = columns.map(c => c.label).join(',');
            const lines = sortedRows.map(r => cols.map(k => {
              const v = r?.[k];
              if (v === null || v === undefined) return '';
              const s = typeof v === 'string' ? v.replace(/"/g,'""') : String(v);
              return `"${s}"`;
            }).join(','));
            const csv = [header, ...lines].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${dataset}-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}>Exportar CSV</Button>

          {/* Marketplace filter */}
          <Select value={marketplace} onValueChange={setMarketplace}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Marketplace" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(marketplaces || []).map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.value}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range */}
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          {/* Channel (Canal) */}
          <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Canal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos canais</SelectItem>
              <SelectItem value="amazon">Amazon</SelectItem>
              <SelectItem value="ml">Mercado Livre</SelectItem>
            </SelectContent>
          </Select>

          {/* Limit */}
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue placeholder="Limite" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">Top 10</SelectItem>
              <SelectItem value="20">Top 20</SelectItem>
              <SelectItem value="50">Top 50</SelectItem>
            </SelectContent>
          </Select>

          <Button size="sm" onClick={runQuery} disabled={loading}>{loading ? 'Carregando…' : 'Buscar'}</Button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

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
            {sortedRows.map((r, idx) => (
              <TableRow key={idx}>
                {columns.map((c) => {
                  const val = r?.[c.key];
                  let text: string = '';
                  if (val === null || val === undefined) text = '—';
                  else if (c.key.endsWith('_percent') || c.key === 'delta_percent' || c.key === 'revenue_diff_percent') {
                    const num = Number(val);
                    text = Number.isFinite(num) ? `${(num * 100).toFixed(1)}%` : String(val);
                  } else if (c.key.includes('revenue') || c.key.includes('margin') || c.key === 'est_margin') {
                    const num = Number(val);
                    text = Number.isFinite(num) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num) : String(val);
                  } else if (typeof val === 'boolean') {
                    text = val ? 'Sim' : 'Não';
                  } else {
                    text = String(val);
                  }
                  return (
                    <TableCell key={c.key}>{text}</TableCell>
                  );
                })}
              </TableRow>
            ))}
            {sortedRows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">Sem dados</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

