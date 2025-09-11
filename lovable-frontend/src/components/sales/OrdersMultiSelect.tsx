import { useState } from 'react';
import { Check, ChevronDown, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { orderTypes } from '@/lib/filters';

type OrdersMultiSelectProps = {
  value: string[];
  onChange: (value: string[]) => void;
};

export function OrdersMultiSelect({ value, onChange }: OrdersMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggleOrderType = (orderType: string) => {
    const newValue = value.includes(orderType)
      ? value.filter(v => v !== orderType)
      : [...value, orderType];
    onChange(newValue);
  };

  const selectedTypes = orderTypes.filter(type => value.includes(type.value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[180px] justify-between"
        >
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            {value.length === 0 ? (
              <span className="text-muted-foreground">All orders</span>
            ) : value.length === 1 ? (
              <span>{selectedTypes[0].label}</span>
            ) : (
              <span>{value.length} types</span>
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput placeholder="Search order types..." />
          <CommandList>
            <CommandEmpty>No order types found.</CommandEmpty>
            <CommandGroup>
              {orderTypes.map((type) => (
                <CommandItem
                  key={type.value}
                  value={type.value}
                  onSelect={() => toggleOrderType(type.value)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value.includes(type.value) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{type.value}</div>
                    <div className="text-sm text-muted-foreground">{type.label}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}