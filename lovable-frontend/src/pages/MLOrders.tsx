import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const formatDate = (d?: string) => d ? new Date(d).toLocaleString('pt-BR') : '-';
const formatMoney = (v?: number, c?: string) => typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: c || 'BRL' }) : '-';

export default function MLOrders() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  const params = useMemo(() => ({ page, limit, status, search: search || undefined }), [page, limit, status, search]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ml-orders', params],
    queryFn: async () => (await api.getMlOrders(params)).data,
    staleTime: 30_000,
  });

  const orders = data?.orders || [];
  const pagination = data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };

  useEffect(() => { refetch(); }, [refetch, page, limit, status, search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pedidos - Mercado Livre</h1>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle>Filtros</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input placeholder="Buscar por Order ID / Seller / Buyer" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            <Select onValueChange={(v) => { setStatus(v === 'all' ? undefined : v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending_cancel">Pending Cancel</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(parseInt(v, 10)); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Itens por página" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setSearch(''); setStatus(undefined); setPage(1); }}>Limpar</Button>
              <Button onClick={() => refetch()}>Aplicar</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Qtde</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8}>Carregando...</TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>Nenhum pedido encontrado</TableCell>
                  </TableRow>
                ) : (
                  orders.map((o: any) => (
                    <TableRow key={o.orderId}>
                      <TableCell className="font-mono">{o.orderId}</TableCell>
                      <TableCell>{formatDate(o.purchaseDate)}</TableCell>
                      <TableCell>{o.orderStatus}</TableCell>
                      <TableCell>{o.channel || '-'}</TableCell>
                      <TableCell>{o.siteId || '-'}</TableCell>
                      <TableCell className="text-right">{o.totalItems}</TableCell>
                      <TableCell className="text-right">{o.totalQuantity}</TableCell>
                      <TableCell className="text-right">{formatMoney(o.orderTotal, o.currency)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Página {pagination.page} de {pagination.totalPages} • {pagination.total} pedidos
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={pagination.page <= 1} onClick={() => setPage(p => Math.max(p - 1, 1))}>Anterior</Button>
              <Button variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

