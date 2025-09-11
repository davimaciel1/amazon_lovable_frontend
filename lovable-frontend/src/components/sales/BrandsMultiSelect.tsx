import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Package2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { api } from '@/services/api';

type BrandOption = { value: string; label: string; count?: number };

type BrandsMultiSelectProps = {
  value: string[];
  onChange: (value: string[]) => void;
};

export function BrandsMultiSelect({ value, onChange }: BrandsMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Load brands from API (distinct brands from DB)
  useEffect(() => {
    let ignore = false;
    const fetchBrands = async () => {
      try {
        setLoading(true);
        const resp = await api.getBrands();
        if (!ignore && resp?.data?.brands) {
          const list = (resp.data.brands as any[]).map((b: any) => ({
            value: String(b.value || b.label || '').toLowerCase(),
            label: String(b.label || b.value || ''),
            count: typeof b.count === 'number' ? b.count : undefined,
          })) as BrandOption[];
          setOptions(list);
        }
      } catch (e) {
        // swallow
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    // Load on popover open the first time
    if (open && options.length === 0 && !loading) {
      fetchBrands();
    }
    return () => { ignore = true };
  }, [open, options.length, loading]);

  const toggleBrand = (brandValue: string) => {
    const newValue = value.includes(brandValue)
      ? value.filter(v => v !== brandValue)
      : [...value, brandValue];
    onChange(newValue);
  };

  const selectedBrands = useMemo(() => (
    options.filter(brand => value.includes(brand.value))
  ), [options, value]);

  // Group by first letter for better navigation
  const grouped = useMemo(() => {
    const map: Record<string, BrandOption[]> = {};
    for (const b of options) {
      const key = (b.label?.[0]?.toUpperCase() || '#');
      if (!map[key]) map[key] = [];
      map[key].push(b);
    }
    // Sort groups and options
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.label.localeCompare(b.label));
    }
    return Object.keys(map).sort().reduce((acc, k) => { acc[k] = map[k]; return acc; }, {} as Record<string, BrandOption[]>);
  }, [options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="min-w-[200px] justify-between h-10"
        >
          <div className="flex items-center gap-2">
            <Package2 className="h-4 w-4" />
            {value.length === 0 ? (
              <span className="text-muted-foreground">All Brands</span>
            ) : value.length === 1 ? (
              <span>{selectedBrands[0]?.label || selectedBrands[0]?.value}</span>
            ) : (
              <span>{value.length} brands</span>
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0">
        <Command>
          <div className="flex items-center gap-2 px-2 pt-2">
            <CommandInput placeholder="Search brands..." />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOptions([])} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
            </Button>
          </div>
          <CommandList>
            <CommandEmpty>{loading ? 'Loading brands...' : 'No brands found.'}</CommandEmpty>
            {Object.entries(grouped).map(([letter, items]) => (
              <CommandGroup key={letter} heading={letter}>
                {items.map((brand) => (
                  <CommandItem
                    key={brand.value}
                    value={brand.label}
                    onSelect={() => toggleBrand(brand.value)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value.includes(brand.value) ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="flex-1">{brand.label}</span>
                    {typeof brand.count === 'number' && (
                      <Badge variant="secondary" className="text-xs">
                        {brand.count}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
