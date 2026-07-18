import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-3.5 w-3.5 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-8 w-8 border-[3px]',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent text-steel-400',
        SIZE_CLASS[size],
        className,
      )}
    />
  );
}

interface LoadingBlockProps {
  label?: string;
  className?: string;
}

export function LoadingBlock({ label = 'Cargando...', className }: LoadingBlockProps) {
  return (
    <div className={cn('flex-1 flex items-center justify-center gap-2 text-steel-400 text-body-sm py-12', className)}>
      <Spinner size="sm" />
      {label}
    </div>
  );
}
