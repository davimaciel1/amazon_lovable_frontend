import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { callCopilot } from '@/lib/copilot';
import { DateRangePicker } from '@/components/sales/DateRangePicker';
import { getDateRangeFromPreset } from '@/lib/filters';

function isoToYMD(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CopilotQuickPrompts() {
  // No auth in dev: provide a no-op token getter
  const getToken = async () => null;
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Filtro de período (7/30/90 dias + custom)
  const [dateRange, setDateRange] = useState<{ preset?: string; from: string; to: string}>(() => {
    const r = getDateRangeFromPreset('30days');
    return { preset: '30days', ...r };
  });
  // Canal (Amazon, Mercado Livre, Todos)
  const [channel, setChannel] = useState<'all' | 'amazon' | 'ml'>('all');

  const setPreset = (preset: '7days' | '30days' | '3months') => {
    const r = getDateRangeFromPreset(preset);
    setDateRange({ preset, ...r });
  };

  function channelHint() {
    if (channel === 'amazon') return " Considere apenas o canal Amazon (channel='amazon').";
    if (channel === 'ml') return " Considere apenas o canal Mercado Livre (channel='ml').";
    return " Considere Amazon e Mercado Livre (channel='all').";
  }

  async function run(promptBuilder: (from: string, to: string) => string) {
    const fromYMD = isoToYMD(dateRange.from);
    const toYMD = isoToYMD(dateRange.to);
    const prompt = promptBuilder(fromYMD, toYMD) + channelHint();

    setOutput('');
    setStreaming(true);
    try {
      const resp = await callCopilot([{ role: 'user', content: prompt }], getToken);
      if (resp?.content) {
        setOutput(resp.content);
      } else {
        setOutput(JSON.stringify(resp, null, 2));
      }
    } catch (e: any) {
      setOutput(`Erro: ${e?.message || 'falha na chamada do copilot'}`);
    } finally {
      setStreaming(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-semibold">Consultas Rápidas (Copilot)</div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Presets 7/30/90 */}
          <Button size="sm" variant={dateRange.preset === '7days' ? 'default' : 'outline'} onClick={() => setPreset('7days')}>7d</Button>
          <Button size="sm" variant={dateRange.preset === '30days' ? 'default' : 'outline'} onClick={() => setPreset('30days')}>30d</Button>
          <Button size="sm" variant={dateRange.preset === '3months' ? 'default' : 'outline'} onClick={() => setPreset('3months')}>90d</Button>
          {/* Custom range picker */}
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          {/* Canal */}
          <select
            className="h-9 px-2 border rounded text-sm"
            value={channel}
            onChange={(e) => setChannel(e.target.value as any)}
            title="Canal"
          >
            <option value="all">Todos canais</option>
            <option value="amazon">Amazon</option>
            <option value="ml">Mercado Livre</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Período: {isoToYMD(dateRange.from)} → {isoToYMD(dateRange.to)}</div>
        <div className="flex gap-2 flex-wrap">
          {!streaming ? (
            <>
              {/* KPIs */}
              <Button size="sm" onClick={() => run((from, to) => `Mostre pedidos, unidades, receita e ticket médio no período de ${from} a ${to}. Seja objetivo e traga números agregados. Se necessário, use getSalesReport(start:${from}, end:${to}${channel !== 'all' ? `, channel:'${channel}'` : ''}).`)}>KPIs</Button>

              {/* Top Produtos */}
              <Button size="sm" variant="outline" onClick={() => run((from, to) => `Liste os 10 produtos com maior receita no período de ${from} a ${to}. Retorne produto (ASIN ou SKU), sku, título, receita total e unidades. Se necessário, use getTopProducts(start:${from}, end:${to}${channel !== 'all' ? `, channel:'${channel}'` : ''}).`)}>Top Produtos</Button>

              {/* Baixo Estoque */}
              <Button size="sm" variant="outline" onClick={() => run((_from, _to) => `Liste produtos com estoque abaixo ou igual a 10. Retorne asin, título e quantidade em estoque ordenados do menor para o maior. Use getInventoryStatus(threshold:10).`)}>Baixo Estoque</Button>

              {/* ACOS alto */}
              <Button size="sm" variant="destructive" onClick={() => run((from, to) => `Mostre as campanhas com maior ACOS no período de ${from} a ${to}. Inclua campaign_id, impressões, cliques, custo, vendas atribuídas e ACOS. Se necessário, use getCampaignPerformance(start:${from}, end:${to}).`)}>ACOS alto</Button>

              {/* Piores margens */}
              <Button size="sm" variant="secondary" onClick={() => run((from, to) => `Encontre os produtos com piores margens no período de ${from} a ${to}. Se necessário, use getWorstMargins(start:${from}, end:${to}${channel !== 'all' ? `, channel:'${channel}'` : ''}). Atenção: margem só é estimada quando houver custos manuais por ASIN.`)}>Piores margens</Button>

              {/* Tendência semanal de receita */}
              <Button size="sm" onClick={() => run((from, to) => `Calcule a tendência semanal de receita no período de ${from} a ${to}. Para cada semana (segunda a domingo), retorne a receita total e destaque crescimento/queda. Se necessário, use getWeeklyRevenueTrend(start:${from}, end:${to}${channel !== 'all' ? `, channel:'${channel}'` : ''}).`)}>Tendência semanal</Button>

              {/* ASIN com queda vs semana anterior */}
              <Button size="sm" variant="outline" onClick={() => run((from, to) => `Identifique produtos com queda de vendas versus a semana anterior no período de ${from} a ${to}. Se necessário, use getAsinsWithWeeklyDrop(start:${from}, end:${to}${channel !== 'all' ? `, channel:'${channel}'` : ''}).`)}>Quedas semanais</Button>
            </>
          ) : (
            <Button size="sm" variant="destructive" onClick={stop}>Parar</Button>
          )}
        </div>
      </div>

      <Textarea value={output} onChange={() => {}} rows={8} placeholder="A resposta do Copilot aparecerá aqui..." />
    </Card>
  );
}

