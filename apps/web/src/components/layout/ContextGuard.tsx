'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';

export function ContextGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Observar el estado reactivo directamente, no la función helper
  const usuario = useAuthStore((s) => s.usuario);
  const { empresa, ubicacion } = useContextoStore();

  useEffect(() => {
    if (!usuario) {
      // Conserva a dónde iba (ej. un QR de remisión: /movimientos/recibir?folio=...)
      // para regresarlo ahí después de loguearse, en vez de mandarlo siempre
      // al dashboard.
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const destino = encodeURIComponent(pathname + search);
      router.replace(`/login?redirect=${destino}`);
      return;
    }
    if ((!empresa || !ubicacion) && pathname !== '/seleccionar-contexto') {
      router.replace('/seleccionar-contexto');
    }
  }, [usuario, empresa, ubicacion, pathname, router]);

  return <>{children}</>;
}
