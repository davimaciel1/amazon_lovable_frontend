import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

type TrendingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  asin: string;
  sku?: string;
  productTitle: string;
};

type MetricType = 'units' | 'revenue' | 'profit' | 'acos' | 'roi';
type PeriodType = 'day' | 'week' | 'month' | 'year';

// Mock data generator for trends - showing daily orders for last 30 days
const generateTrendData = (metric: MetricType, period: PeriodType) => {
  const now = new Date();
  const data = [];
  
  // Always show 30 days as default, like the reference
  const range = 30;

  const getDateLabel = (index: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (range - index - 1));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  for (let i = 0; i < range; i++) {
    // Generate realistic order quantities (0-12 orders per day)
    const baseValue = 2;
    const variation = Math.random() * 8; // 0-8 variation
    const value = Math.round(baseValue + variation);
    
    data.push({
      date: getDateLabel(i),
      value: value,
    });
  }
  
  return data;
};

const getMetricLabel = (metric: MetricType) => {
  switch (metric) {
    case 'units': return 'Units sold';
    case 'revenue': return 'Revenue';
    case 'profit': return 'Profit';
    case 'acos': return 'ACOS';
    case 'roi': return 'ROI';
    default: return 'Units sold';
  }
};

const formatValue = (value: number, metric: MetricType) => {
  // For the trends view, we're showing order quantities (units sold)
  return value.toString();
};

export function TrendingModal({ isOpen, onClose, asin, sku, productTitle }: TrendingModalProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('units');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('month');

  const trendData = generateTrendData(selectedMetric, selectedPeriod);
  const totalOrders = trendData.reduce((sum, item) => sum + item.value, 0);
  const currentValue = trendData[trendData.length - 1]?.value || 0;
  const previousValue = trendData[trendData.length - 2]?.value || 0;
  const percentChange = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Trends
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            {asin}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Product Info */}
          <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
            <div>
              <div className="font-semibold text-foreground">ASIN: {asin}</div>
              {sku && <div className="text-sm text-muted-foreground">SKU: {sku}</div>}
            </div>
          </div>

          {/* Controls - Simplified to match reference */}
          <div className="flex items-center gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Metric</label>
              <Select value={selectedMetric} onValueChange={(value: MetricType) => setSelectedMetric(value)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="units">Units sold</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="profit">Profit</SelectItem>
                  <SelectItem value="acos">ACOS</SelectItem>
                  <SelectItem value="roi">ROI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Comparison</label>
              <Select defaultValue="none">
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="previous">Previous period</SelectItem>
                  <SelectItem value="year">Year over year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Period</label>
              <div className="flex gap-1">
                {(['day', 'week', 'month', 'year'] as PeriodType[]).map((period) => (
                  <Button
                    key={period}
                    variant={selectedPeriod === period ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedPeriod(period)}
                    className="capitalize"
                  >
                    {period}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Current Value Display */}
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold">
              {formatValue(currentValue, selectedMetric)}
            </div>
            <Badge variant={percentChange >= 0 ? "secondary" : "destructive"} className="gap-1">
              {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
            </Badge>
          </div>

          {/* Chart */}
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="date" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatValue(value, selectedMetric)}
                />
                <Tooltip 
                  labelFormatter={(label) => `Date: ${label}`}
                  formatter={(value: number) => [formatValue(value, selectedMetric), getMetricLabel(selectedMetric)]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Summary */}
          <div className="text-sm text-muted-foreground text-center">
            Units sold: {totalOrders}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}