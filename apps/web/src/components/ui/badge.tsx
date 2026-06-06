import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center px-2 py-0.5 rounded text-meta font-medium',
  {
    variants: {
      variant: {
        default:      'bg-steel-100 text-steel-600',
        paid:         'bg-green-50 text-status-paid border border-green-200',
        credit:       'bg-amber-50 text-status-credit border border-amber-200',
        pending:      'bg-blue-50 text-status-pending border border-blue-200',
        incomplete:   'bg-purple-50 text-status-incomplete border border-purple-200',
        cancelled:    'bg-brand-50 text-status-alert border border-brand-200',
        process:      'bg-steel-100 text-steel-600',
        nota_por_pagar: 'bg-orange-50 text-orange-700 border border-orange-200',
        cargada:      'bg-teal-50 text-teal-700 border border-teal-200',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
