'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Dialog({ open, onClose, title, description, children, size = 'md' }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-steel-900/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className={cn(
          'relative bg-white shadow-xl border border-steel-200 w-full flex flex-col',
          // Móvil < sm (640px): sube desde abajo, full width
          'rounded-t-2xl sm:rounded-xl',
          // Altura máxima según tamaño de pantalla
          'max-h-[92dvh] sm:max-h-[88dvh] lg:max-h-[82dvh]',
          // Ancho máximo según size (solo aplica desde sm en adelante)
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
          size === 'xl' && 'sm:max-w-4xl',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4 border-b border-steel-100 flex-shrink-0">
          <div>
            <h2 className="text-title sm:text-display-sm font-bold text-steel-900">{title}</h2>
            {description && <p className="text-body-sm text-steel-500 mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-steel-400 hover:text-steel-600 transition-colors flex-shrink-0 mt-0.5 p-1 -mr-1 rounded-lg hover:bg-steel-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div
      className={cn(
        // Apila botones en móvil (columna invertida = primario arriba), horizontal en sm+
        'flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-4 border-t border-steel-100 mt-4',
        // Botones full-width en móvil, tamaño automático en desktop
        '[&>button]:w-full sm:[&>button]:w-auto',
        '[&>a]:w-full sm:[&>a]:w-auto',
        className,
      )}
    >
      {children}
    </div>
  );
}
