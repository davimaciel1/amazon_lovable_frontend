import { Badge } from '@/components/ui/badge';
import { TrendingUp, AlertTriangle, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type HealthBadgeProps = {
  health: 'excellent' | 'good' | 'fair' | 'poor' | 'warning' | 'bad' | string;
  showIcon?: boolean;
  size?: 'sm' | 'default';
};

export function HealthBadge({ health, showIcon = true, size = 'default' }: HealthBadgeProps) {
  const config = {
    excellent: {
      label: 'Excellent',
      variant: 'success' as const,
      icon: TrendingUp,
      className: 'bg-success-subtle text-success border-success-muted',
    },
    good: {
      label: 'Good',
      variant: 'success' as const,
      icon: TrendingUp,
      className: 'bg-success-subtle text-success border-success-muted',
    },
    fair: {
      label: 'Fair',
      variant: 'warning' as const,
      icon: AlertTriangle,
      className: 'bg-warning-subtle text-warning border-warning-muted',
    },
    poor: {
      label: 'Poor',
      variant: 'destructive' as const,
      icon: TrendingDown,
      className: 'bg-destructive-subtle text-destructive border-destructive-muted',
    },
    warning: {
      label: 'Warning',
      variant: 'warning' as const,
      icon: AlertTriangle,
      className: 'bg-warning-subtle text-warning border-warning-muted',
    },
    bad: {
      label: 'Poor',
      variant: 'destructive' as const,
      icon: TrendingDown,
      className: 'bg-destructive-subtle text-destructive border-destructive-muted',
    },
  };

  // Default to 'fair' if health value is not recognized
  const healthKey = health in config ? health : 'fair';
  const { label, icon: Icon, className } = config[healthKey as keyof typeof config];

  return (
    <Badge 
      variant="outline" 
      className={cn(
        'gap-1 font-medium',
        size === 'sm' && 'text-xs px-2 py-0.5',
        className
      )}
    >
      {showIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />}
      {label}
    </Badge>
  );
}