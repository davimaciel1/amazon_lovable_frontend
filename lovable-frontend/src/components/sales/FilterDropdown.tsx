import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type FilterDropdownProps = {
  label: string;
  children: React.ReactNode;
  hasActiveFilters?: boolean;
  className?: string;
};

export function FilterDropdown({ 
  label, 
  children, 
  hasActiveFilters = false,
  className 
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 justify-between font-normal text-sm border-input bg-background hover:bg-accent/50 transition-colors",
            hasActiveFilters && "border-primary text-primary bg-primary/5",
            className
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className={cn(
            "h-4 w-4 transition-transform duration-200",
            isOpen && "rotate-180"
          )} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-56 max-h-80 overflow-y-auto"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}