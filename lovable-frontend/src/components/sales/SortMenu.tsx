import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { sortOptions } from '@/lib/filters';

type SortMenuProps = {
  sortBy?: 'units' | 'revenue' | 'profit' | 'roi' | 'acos';
  sortDir?: 'asc' | 'desc';
  onChange: (sortBy: 'units' | 'revenue' | 'profit' | 'roi' | 'acos', sortDir: 'asc' | 'desc') => void;
};

export function SortMenu({ sortBy = 'revenue', sortDir = 'desc', onChange }: SortMenuProps) {
  const currentSort = sortOptions.find(option => option.value === sortBy);
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1 h-7 px-2 text-xs">
          <ArrowUpDown className="h-3 w-3" />
          {currentSort?.label}
          {sortDir === 'asc' ? (
            <ArrowUp className="h-2 w-2" />
          ) : (
            <ArrowDown className="h-2 w-2" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {sortOptions.map((option) => (
          <div key={option.value}>
            <DropdownMenuItem
              onClick={() => onChange(option.value, 'desc')}
              className="flex items-center justify-between"
            >
              <span>{option.label}</span>
              <div className="flex items-center gap-1">
                <ArrowDown className="h-3 w-3" />
                <span className="text-xs text-muted-foreground">High to Low</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onChange(option.value, 'asc')}
              className="flex items-center justify-between"
            >
              <span>{option.label}</span>
              <div className="flex items-center gap-1">
                <ArrowUp className="h-3 w-3" />
                <span className="text-xs text-muted-foreground">Low to High</span>
              </div>
            </DropdownMenuItem>
            {option !== sortOptions[sortOptions.length - 1] && <DropdownMenuSeparator />}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}