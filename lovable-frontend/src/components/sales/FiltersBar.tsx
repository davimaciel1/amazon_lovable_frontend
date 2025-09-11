import { Button } from '@/components/ui/button';
import { DateRangePicker } from './DateRangePicker';
import { MarketsMultiSelect } from './MarketsMultiSelect';
import { OrdersMultiSelect } from './OrdersMultiSelect';
import { BrandsMultiSelect } from './BrandsMultiSelect';
import { KeywordSearch } from './KeywordSearch';
import { FilterDropdown } from './FilterDropdown';
import { Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type FiltersBarProps = {
  filters: {
    dateRange: { preset?: string; from: string; to: string };
    countries?: string[];
    orderTypes?: string[];
    brands?: string[];
    keyword?: string;
    channel?: 'all' | 'amazon' | 'ml';
    metricFilter?: {
      field: 'units' | 'revenue' | 'profit' | 'roi' | 'acos';
      operator: 'greater' | 'less' | 'between';
      value: number | [number, number];
    };
    sortBy?: 'units' | 'revenue' | 'profit' | 'roi' | 'acos';
    sortDir?: 'asc' | 'desc';
  };
  onFiltersChange: (filters: any) => void;
};

export function FiltersBar({ filters, onFiltersChange }: FiltersBarProps) {
  return (
    <div className="bg-background border-b border-border">
      <div className="px-6 py-4">
        <div className="flex items-center gap-2">
          {/* Date Range Filter */}
          <DateRangePicker
            value={filters.dateRange}
            onChange={(dateRange) => onFiltersChange({ dateRange })}
          />

{/* Channel (Marketplace) Filter */}
<Select value={filters.channel || 'all'} onValueChange={(channel) => onFiltersChange({ channel })}>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Canal" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Ambos</SelectItem>
    <SelectItem value="amazon">Amazon</SelectItem>
    <SelectItem value="ml">Mercado Livre</SelectItem>
  </SelectContent>
</Select>

{/* Markets Filter */}
          <MarketsMultiSelect
            value={filters.countries || []}
            onChange={(countries) => onFiltersChange({ countries })}
          />

          {/* Orders Filter */}
          <OrdersMultiSelect
            value={filters.orderTypes || []}
            onChange={(orderTypes) => onFiltersChange({ orderTypes })}
          />

          {/* Brands Filter */}
          <BrandsMultiSelect
            value={filters.brands || []}
            onChange={(brands) => onFiltersChange({ brands })}
          />

          {/* Search Field - expandable */}
          <div className="flex-1 min-w-[220px]">
            <KeywordSearch
              value={filters.keyword || ''}
              onChange={(keyword) => onFiltersChange({ keyword })}
            />
          </div>

          {/* Filter Icon */}
          <Button
            variant="outline"
            size="sm"
            className="h-10 w-10 p-0"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}