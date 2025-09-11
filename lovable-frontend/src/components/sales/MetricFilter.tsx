import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Filter, X } from 'lucide-react';
import { metricFields, metricOperators } from '@/lib/filters';

type MetricFilterProps = {
  value?: {
    field: 'units' | 'revenue' | 'profit' | 'roi' | 'acos';
    operator: 'greater' | 'less' | 'between';
    value: number | [number, number];
  };
  onChange: (value?: {
    field: 'units' | 'revenue' | 'profit' | 'roi' | 'acos';
    operator: 'greater' | 'less' | 'between';
    value: number | [number, number];
  }) => void;
};

export function MetricFilter({ value, onChange }: MetricFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFilter, setLocalFilter] = useState({
    field: value?.field || 'revenue',
    operator: value?.operator || 'greater',
    value: value?.value || 0,
  });

  const handleApply = () => {
    onChange(localFilter);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(undefined);
    setIsOpen(false);
    setLocalFilter({
      field: 'revenue',
      operator: 'greater',
      value: 0,
    });
  };

  const handleValueChange = (newValue: string, index?: number) => {
    const numValue = Number(newValue) || 0;
    
    if (localFilter.operator === 'between') {
      const currentValue = Array.isArray(localFilter.value) ? localFilter.value : [0, 0];
      if (index === 0) {
        setLocalFilter({ ...localFilter, value: [numValue, currentValue[1]] });
      } else {
        setLocalFilter({ ...localFilter, value: [currentValue[0], numValue] });
      }
    } else {
      setLocalFilter({ ...localFilter, value: numValue });
    }
  };

  const selectedField = metricFields.find(f => f.value === localFilter.field);
  const selectedOperator = metricOperators.find(o => o.value === localFilter.operator);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant={value ? "secondary" : "outline"} className="gap-2">
          <Filter className="h-4 w-4" />
          {value ? (
            <>
              Metric Filter
              <Badge variant="outline" className="ml-1">
                {selectedField?.label}
              </Badge>
            </>
          ) : (
            'Metric Filter'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Metric Filter</h4>
            {value && (
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <div className="space-y-3">
            <div>
              <Label htmlFor="metric-field">Metric</Label>
              <Select
                value={localFilter.field}
                onValueChange={(value) => setLocalFilter({ ...localFilter, field: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metricFields.map((field) => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="metric-operator">Condition</Label>
              <Select
                value={localFilter.operator}
                onValueChange={(value) => setLocalFilter({ ...localFilter, operator: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metricOperators.map((operator) => (
                    <SelectItem key={operator.value} value={operator.value}>
                      {operator.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="metric-value">Value</Label>
              {localFilter.operator === 'between' ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={Array.isArray(localFilter.value) ? localFilter.value[0] : 0}
                    onChange={(e) => handleValueChange(e.target.value, 0)}
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={Array.isArray(localFilter.value) ? localFilter.value[1] : 0}
                    onChange={(e) => handleValueChange(e.target.value, 1)}
                  />
                </div>
              ) : (
                <Input
                  type="number"
                  placeholder="Enter value"
                  value={Array.isArray(localFilter.value) ? localFilter.value[0] : localFilter.value}
                  onChange={(e) => handleValueChange(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApply}>
              Apply Filter
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}