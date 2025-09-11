import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/services/api';

type Schema = Record<string, { columns: { name: string; type: string }[] }>;

type Preset = { title: string; question: string };

const PRESET_SECTIONS: Record<string, Preset[]> = {
  Sales: [
    { title: 'Top 10 revenue (30d)', question: 'Which are the top 10 products by total revenue in the last 30 days? Return asin, sku, product title, total revenue and units.' },
    { title: 'Daily revenue (30d)', question: 'Show daily revenue for the last 30 days with date and total revenue columns.' },
    { title: 'Orders per marketplace', question: 'How many orders per marketplace in the last 30 days? Return marketplace_id and orders count ordered by orders desc.' },
    { title: 'Avg order value (30d)', question: 'What is the average order value for the last 30 days?' },
  ],
  Products: [
    { title: 'Low stock', question: 'List products with low stock (inventory_quantity < 20), with asin, title, inventory_quantity sorted ascending.' },
    { title: 'Top selling by units', question: 'Which products sold the most units in the last 30 days? Return asin, sku, title, total units.' },
  ],
  Customers: [
    { title: 'Repeat buyers (90d)', question: 'Which buyers placed more than one order in the last 90 days? Return buyer_email and orders count.' },
    { title: 'Top customers by spend', question: 'Who are the top customers by total spend in the last 90 days? Return buyer_email and total spend.' },
  ],
  Ads: [
    { title: 'Campaign ACOS (yesterday)', question: 'List campaign_id, date, impressions, clicks, cost, sales and ACOS for yesterday, ordered by ACOS asc.' },
  ],
};

export default function AIQuery() {
  const [health, setHealth] = useState<'unknown' | 'ok' | 'down'>('unknown');
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [question, setQuestion] = useState('List top 10 products by revenue in the last 30 days');
  const [schema, setSchema] = useState<Schema | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [sql, setSql] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [execLoading, setExecLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [fields, setFields] = useState<{ name: string }[]>([]);
  const [limit, setLimit] = useState<number>(1000);
  const [selectedSection, setSelectedSection] = useState<string>('Sales');
  const [selectedPresetIdx, setSelectedPresetIdx] = useState<number | null>(0);

  useEffect(() => {
    (async () => {
      try {
        setLoadingHealth(true);
        const r = await api.vannaHealth();
        if (r.data?.ok) setHealth('ok');
        else setHealth('down');
      } catch {
        setHealth('down');
      } finally {
        setLoadingHealth(false);
      }
    })();
  }, []);

  const fetchSchema = async () => {
    try {
      setLoadingSchema(true);
      const r = await api.vannaGetSchema();
      if (r.data?.schema) setSchema(r.data.schema);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch schema');
    } finally {
      setLoadingSchema(false);
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setGenLoading(true);
    try {
      const r = await api.vannaGenerateSQL(question, schema || undefined);
      const s = r.data?.sql || r.data?.meta?.sql || '';
if (!s) throw new Error('No SQL returned by the AI query service');
      setSql(s);
    } catch (e: any) {
      setError(e.message || 'Failed to generate SQL');
    } finally {
      setGenLoading(false);
    }
  };

  const handleExecute = async () => {
    setError(null);
    setExecLoading(true);
    setRows([]);
    setFields([]);
    try {
      const r = await api.vannaExecuteSQL(sql, limit);
      console.log('API Response:', r); // Debug log
      if (r.error) throw new Error(r.error);
      
      // Handle the response data structure from our backend
      // The backend returns { data: [...], fields: [...], rowCount: number }
      const rowsData = Array.isArray(r.data) ? r.data : (r.data ? [r.data] : []);
      
      // If fields are not provided, derive them from the first row
      let fieldsData = r.fields || [];
      if ((!fieldsData || fieldsData.length === 0) && rowsData.length > 0) {
        fieldsData = Object.keys(rowsData[0]).map(name => ({ name }));
      }
      
      console.log('Rows data:', rowsData); // Debug log
      console.log('Fields data:', fieldsData); // Debug log
      console.log('First row:', rowsData[0]); // Debug first row
      console.log('Columns will be:', fieldsData.map(f => f.name)); // Debug columns
      setRows(rowsData);
      setFields(fieldsData);
    } catch (e: any) {
      console.error('Execute error:', e);
      setError(e.message || 'Failed to execute SQL');
    } finally {
      setExecLoading(false);
    }
  };

  const columns = useMemo(() => fields.map(f => f.name), [fields]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
<h1 className="text-2xl font-bold">AI Query</h1>
          <div className="text-sm">
            <span className={`px-2 py-1 rounded ${health === 'ok' ? 'bg-green-100 text-green-700' : health === 'down' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
AI Query: {loadingHealth ? 'checking…' : health}
            </span>
          </div>
        </div>

        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {Object.keys(PRESET_SECTIONS).map((sec) => (
              <Button
                key={sec}
                size="sm"
                variant={selectedSection === sec ? 'default' : 'outline'}
                onClick={() => { setSelectedSection(sec); setSelectedPresetIdx(null); }}
              >
                {sec}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => { setSelectedSection('Sales'); setSelectedPresetIdx(null); setQuestion(''); setSql(''); setRows([]); setFields([]); }}>Clear</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(PRESET_SECTIONS[selectedSection] || []).map((p, idx) => (
              <Button
                key={`${selectedSection}-${idx}`}
                size="sm"
                variant={selectedPresetIdx === idx ? 'default' : 'outline'}
                onClick={() => { setSelectedPresetIdx(idx); setQuestion(p.question); }}
              >
                {p.title}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask a data question…" />
            <Button onClick={handleGenerate} disabled={genLoading || health !== 'ok'}>
              {genLoading ? 'Generating…' : 'Generate SQL'}
            </Button>
            <Button variant="outline" onClick={fetchSchema} disabled={loadingSchema}>
              {loadingSchema ? 'Loading schema…' : 'Load Schema'}
            </Button>
          </div>
          {!!schema && (
            <div className="max-h-48 overflow-auto border rounded p-2 text-sm">
              {Object.entries(schema).map(([t, info]) => (
                <div key={t} className="mb-2">
                  <div className="font-mono font-semibold">{t}</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 pl-2">
                    {info.columns.map(c => (
                      <div key={c.name} className="text-muted-foreground">
                        {c.name} <span className="font-mono text-xs">({c.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Generated SQL</div>
            <div className="flex items-center gap-2">
              <Input type="number" className="w-28" value={limit} onChange={e => setLimit(Number(e.target.value) || 1000)} />
              <Button onClick={handleExecute} disabled={execLoading || !sql}> {execLoading ? 'Executing…' : 'Execute SQL'} </Button>
            </div>
          </div>
          <Textarea value={sql} onChange={e => setSql(e.target.value)} rows={6} placeholder="SQL will appear here" />
        </Card>

        {error && (
          <Card className="p-3 border-destructive text-destructive bg-destructive/10">
            <div className="text-sm">{error}</div>
          </Card>
        )}

        <Card className="p-0 overflow-hidden">
          <div className="p-3 border-b text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          </div>
          <div className="overflow-auto">
            {rows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map(col => (
                      <TableHead key={col} className="whitespace-nowrap">{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                  <TableRow key={idx}>
                    {columns.map(c => {
                      let value = r[c];
                      // Format numbers with decimal places
                      if (typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)) && value.includes('.'))) {
                        const num = Number(value);
                        if (!isNaN(num) && value.toString().includes('.')) {
                          value = num.toFixed(2);
                        }
                      }
                      return (
                        <TableCell key={c} className="whitespace-nowrap">
                          {String(value ?? '')}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No data to display
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
