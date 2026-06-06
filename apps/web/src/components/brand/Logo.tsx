import Image from 'next/image';
import { cn } from '@/lib/utils';

export type LogoVariant =
  | 'horizontal'
  | 'vertical'
  | 'isotipo'
  | 'isotipo-mono'
  | 'isotipo-blanco'
  | 'wordmark';

export type EmpresaSlug =
  | 'grupo'
  | 'emfimifar'
  | 'metalicos-lyeva'
  | 'laminas-monterrey';

interface LogoProps {
  variant?: LogoVariant;
  empresa?: EmpresaSlug;
  size?: number;
  className?: string;
}

const ASSET_MAP: Record<EmpresaSlug, Record<LogoVariant, string>> = {
  grupo: {
    horizontal:      '/brand/grupo/logo-horizontal.svg',
    vertical:        '/brand/grupo/logo-vertical.svg',
    isotipo:         '/brand/grupo/isotipo-color.svg',
    'isotipo-mono':  '/brand/grupo/isotipo-mono.svg',
    'isotipo-blanco':'/brand/grupo/isotipo-blanco.svg',
    wordmark:        '/brand/grupo/logo-horizontal.svg',
  },
  emfimifar: {
    horizontal:      '/brand/emfimifar/logo.svg',
    vertical:        '/brand/emfimifar/logo.svg',
    isotipo:         '/brand/emfimifar/isotipo.svg',
    'isotipo-mono':  '/brand/emfimifar/logo-mono.svg',
    'isotipo-blanco':'/brand/emfimifar/isotipo.svg',
    wordmark:        '/brand/emfimifar/logo.svg',
  },
  'metalicos-lyeva': {
    horizontal:      '/brand/metalicos-lyeva/logo.svg',
    vertical:        '/brand/metalicos-lyeva/logo.svg',
    isotipo:         '/brand/metalicos-lyeva/isotipo.svg',
    'isotipo-mono':  '/brand/metalicos-lyeva/logo-mono.svg',
    'isotipo-blanco':'/brand/metalicos-lyeva/isotipo.svg',
    wordmark:        '/brand/metalicos-lyeva/logo.svg',
  },
  'laminas-monterrey': {
    horizontal:      '/brand/laminas-monterrey/logo.svg',
    vertical:        '/brand/laminas-monterrey/logo.svg',
    isotipo:         '/brand/laminas-monterrey/isotipo.svg',
    'isotipo-mono':  '/brand/laminas-monterrey/logo-mono.svg',
    'isotipo-blanco':'/brand/laminas-monterrey/isotipo.svg',
    wordmark:        '/brand/laminas-monterrey/logo.svg',
  },
};

export function Logo({ variant = 'isotipo', empresa = 'grupo', size = 28, className }: LogoProps) {
  const src = ASSET_MAP[empresa][variant];

  const isIsotipo = variant.startsWith('isotipo');
  const aspectRatio = isIsotipo ? 1 : variant === 'vertical' ? 0.8 : 3;
  const height = Math.round(size * aspectRatio);

  return (
    <Image
      src={src}
      alt={`Logo ${empresa}`}
      width={size}
      height={height}
      className={cn('object-contain', className)}
      priority
    />
  );
}

// Wordmark en código puro — para cuando no hay SVG disponible
export function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        'font-bold tracking-tight select-none',
        dark ? 'text-white' : 'text-steel-900',
      )}
    >
      Metálico
      <span className={dark ? 'text-brand-400' : 'text-brand-600'}>EMF</span>
    </span>
  );
}
