'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth.store';
import type { RolUsuario } from '@/lib/store/auth.store';

/**
 * Saca al usuario de la página si su rol está en la lista bloqueada.
 * Ocultar el link del sidebar no basta — esto evita el acceso por URL directa.
 */
export function useBlockRoles(blockedRoles: RolUsuario[], redirectTo = '/dashboard') {
  const router = useRouter();
  const usuario = useAuthStore((s) => s.usuario);

  useEffect(() => {
    if (usuario && blockedRoles.includes(usuario.rol)) {
      router.replace(redirectTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, router]);
}
