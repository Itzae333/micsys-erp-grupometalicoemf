import * as React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  description?: string;
  accent?: boolean;
  className?: string;
}

export function StatCard({ label, value, description, accent = false, className }: StatCardProps) {
  if (accent) {
    return (
      <div className={cn('bg-brand-600 rounded-xl p-4', className)}>
        <p className="text-eyebrow text-brand-200 uppercase tracking-wide">{label}</p>
        <p className="text-display-md font-bold text-white mt-1 tabular-nums">{value}</p>
        {description && (
          <p className="text-body-sm text-brand-200 mt-0.5">{description}</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('bg-white border border-steel-200 rounded-xl p-4', className)}>
      <p className="text-eyebrow text-steel-500 uppercase tracking-wide">{label}</p>
      <p className="text-display-md font-bold text-steel-900 mt-1 tabular-nums">{value}</p>
      {description && (
        <p className="text-body-sm text-steel-500 mt-0.5">{description}</p>
      )}
    </div>
  );
}
