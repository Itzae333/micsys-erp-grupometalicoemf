import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div>
        <textarea
          ref={ref}
          rows={3}
          className={cn(
            'w-full rounded-lg border border-steel-200 bg-white px-3 py-2 text-body text-steel-900',
            'placeholder:text-steel-400 resize-none',
            'focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-500',
            'disabled:bg-steel-50 disabled:text-steel-400 disabled:cursor-not-allowed',
            error && 'border-brand-500',
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1 text-body-sm text-brand-600">{error}</p>}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
