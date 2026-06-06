import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          className={cn(
            'flex h-9 w-full rounded-md border border-steel-300 bg-white px-3 py-1 text-body text-steel-900 shadow-none transition-colors',
            'placeholder:text-steel-400',
            'focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-0 focus:border-brand-600',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-steel-50',
            error && 'border-brand-600 focus:ring-brand-600',
            className,
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-body-sm text-brand-600">{error}</p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

export { Input };
