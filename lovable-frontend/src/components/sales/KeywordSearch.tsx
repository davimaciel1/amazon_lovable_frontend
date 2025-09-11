import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type KeywordSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
};

export function KeywordSearch({ 
  value, 
  onChange, 
  placeholder = "Enter ASIN, SKU, Order or Keyword",
  debounceMs = 300,
  className
}: KeywordSearchProps) {
  const [localValue, setLocalValue] = useState(value);

  // Debounce the onChange callback
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(localValue);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [localValue, onChange, debounceMs]);

  // Update local value when prop changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className={cn("relative flex items-center w-full", className)}>
      <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        className="pl-10 pr-10 h-10 bg-background border-input font-normal text-sm"
      />
      {localValue && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-2 h-6 w-6 p-0 hover:bg-muted"
          onClick={() => {
            setLocalValue('');
            onChange('');
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}