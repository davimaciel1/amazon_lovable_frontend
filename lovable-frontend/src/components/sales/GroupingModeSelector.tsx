import React from 'react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useSalesStore, type GroupByMode } from '@/stores/salesStore';
import { Package, Layers, Tag } from 'lucide-react';

export function GroupingModeSelector() {
  const { settings, setSettings } = useSalesStore();
  const groupByMode = settings.groupByMode || 'asin';

  const handleChange = (value: GroupByMode) => {
    setSettings({ groupByMode: value });
  };

  return (
    <Select value={groupByMode} onValueChange={handleChange}>
      <SelectTrigger className="w-[200px] bg-white text-primary">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="asin">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span>Group by ASIN</span>
          </div>
        </SelectItem>
        <SelectItem value="asin_marketplace">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span>ASIN + Marketplace</span>
          </div>
        </SelectItem>
        <SelectItem value="sku">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            <span>Group by SKU</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}