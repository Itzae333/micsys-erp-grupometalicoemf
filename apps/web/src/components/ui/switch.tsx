'use client';

import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export function Switch({ checked, onChange, disabled, label, id }: SwitchProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center gap-2 cursor-pointer select-none',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <div className="relative">
        <input
          id={id}
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <div
          className={cn(
            'w-9 h-5 rounded-full transition-colors duration-200',
            checked ? 'bg-brand-600' : 'bg-steel-300',
          )}
        />
        <div
          className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
            checked && 'translate-x-4',
          )}
        />
      </div>
      {label && <span className="text-body text-steel-900">{label}</span>}
    </label>
  );
}
