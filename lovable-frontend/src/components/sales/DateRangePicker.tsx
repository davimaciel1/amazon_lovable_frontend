import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { datePresets, getDateRangeFromPreset } from '@/lib/filters';

type DateRangePickerProps = {
  value: {
    preset?: string;
    from: string;
    to: string;
  };
  onChange: (value: { preset?: string; from: string; to: string }) => void;
};

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: value.preset === 'custom' ? new Date(value.from) : undefined,
    to: value.preset === 'custom' ? new Date(value.to) : undefined,
  });

  const handlePresetChange = (preset: string) => {
    if (preset === 'custom') {
      onChange({
        preset,
        from: customRange.from?.toISOString() || new Date().toISOString(),
        to: customRange.to?.toISOString() || new Date().toISOString(),
      });
    } else {
      const range = getDateRangeFromPreset(preset);
      onChange({
        preset,
        ...range,
      });
    }
    if (preset !== 'custom') {
      setIsOpen(false);
    }
  };

  const handleCustomRangeChange = (range: { from: Date | undefined; to: Date | undefined }) => {
    setCustomRange(range);
    if (range.from && range.to) {
      onChange({
        preset: 'custom',
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      setIsOpen(false);
    }
  };

  const formatDateRange = () => {
    const preset = datePresets.find(p => p.value === value.preset);
    if (preset && preset.value !== 'custom') {
      return preset.label;
    }
    
    if (value.from && value.to) {
      const from = new Date(value.from);
      const to = new Date(value.to);
      return `${format(from, 'MMM dd')} - ${format(to, 'MMM dd, yyyy')}`;
    }
    
    return 'Select date range';
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "min-w-[160px] justify-between text-left font-normal h-10",
            !value.from && "text-muted-foreground",
            value.preset && "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100"
          )}
        >
          <span className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            {formatDateRange()}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="flex flex-col">
          {datePresets.map((preset) => (
            <Button
              key={preset.value}
              variant="ghost"
              className={cn(
                "justify-start px-4 py-2 text-sm font-normal hover:bg-accent",
                value.preset === preset.value && "bg-accent"
              )}
              onClick={() => handlePresetChange(preset.value)}
            >
              {preset.value === value.preset && (
                <span className="mr-2">✓</span>
              )}
              {preset.label}
            </Button>
          ))}
        </div>
        
        {value.preset === 'custom' && (
          <div className="border-t p-2">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={customRange.from}
              selected={{
                from: customRange.from,
                to: customRange.to,
              }}
              onSelect={handleCustomRangeChange}
              numberOfMonths={2}
              className="pointer-events-auto"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}