import { useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { marketplaces } from '@/lib/filters';

type MarketsMultiSelectProps = {
  value: string[];
  onChange: (value: string[]) => void;
};

export function MarketsMultiSelect({ value, onChange }: MarketsMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggleMarket = (marketValue: string) => {
    const newValue = value.includes(marketValue)
      ? value.filter(v => v !== marketValue)
      : [...value, marketValue];
    onChange(newValue);
  };

  const selectedMarkets = marketplaces.filter(market => value.includes(market.value));
  
  // Group markets by region
  const groupedMarkets = marketplaces.reduce((acc, market) => {
    if (!acc[market.group]) {
      acc[market.group] = [];
    }
    acc[market.group].push(market);
    return acc;
  }, {} as Record<string, Array<typeof marketplaces[number]>>);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between px-4"
        >
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4" />
            {value.length === 0 ? (
              <span className="text-muted-foreground">All markets</span>
            ) : value.length === 1 ? (
              <span>{selectedMarkets[0].label}</span>
            ) : (
              <span>{value.length} markets</span>
            )}
          </div>
          <ChevronDown className="ml-3 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search markets..." />
          <CommandList>
            <CommandEmpty>No markets found.</CommandEmpty>
            {Object.entries(groupedMarkets).map(([group, markets]) => (
              <CommandGroup key={group} heading={group}>
                {markets.map((market) => (
                  <CommandItem
                    key={market.value}
                    value={market.value}
                    onSelect={() => toggleMarket(market.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(market.value) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex-1">{market.label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {market.value}
                    </Badge>
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