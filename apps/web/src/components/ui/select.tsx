import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, placeholder, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full rounded-lg border border-steel-200 bg-white px-3 py-2 text-body text-steel-900',
            'focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-500',
            'disabled:bg-steel-50 disabled:text-steel-400 disabled:cursor-not-allowed',
            'appearance-none pr-8',
            error && 'border-brand-500 focus:ring-brand-600/20',
            className,
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
          <svg className="h-4 w-4 text-steel-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {error && <p className="mt-1 text-body-sm text-brand-600">{error}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';
