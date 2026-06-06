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
      router.replace('/login');
      return;
    }
    if ((!empresa || !ubicacion) && pathname !== '/seleccionar-contexto') {
      router.replace('/seleccionar-contexto');
    }
  }, [usuario, empresa, ubicacion, pathname, router]);

  return <>{children}</>;
}
