import * as React from 'react';
import { Package } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="w-12 h-12 rounded-xl bg-steel-100 flex items-center justify-center mb-3">
        {icon ?? <Package className="h-6 w-6 text-steel-400" />}
      </div>
      <p className="text-body font-medium text-steel-900">{title}</p>
      {description && (
        <p className="text-body-sm text-steel-500 mt-1 max-w-sm">{description}</p>
      )}
      {action && (
        <Button size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
