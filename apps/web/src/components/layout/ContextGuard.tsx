'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { LockScreen } from './LockScreen';

export function ContextGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Observar el estado reactivo directamente, no la función helper
  const usuario = useAuthStore((s) => s.usuario);
  const locked = useAuthStore((s) => s.locked);
  const { empresa, ubicacion } = useContextoStore();

  // Arranca en `false` tanto en el render de servidor como en el primer
  // render del cliente (idénticos, para no chocar con la hidratación de
  // React) — la revisión real de localStorage pasa solo dentro de un
  // useEffect, que nunca corre en el servidor y siempre corre después de
  // que React ya emparejó la primera pintada. Antes, revisar el storage
  // directo en el render (o en el inicializador de useState) podía quedar
  // "de acuerdo" con el render del servidor (usuario: null, sin localStorage)
  // y disparar un redirect a /login antes de que se corrigiera solo.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const check = () => {
      if (useAuthStore.persist.hasHydrated() && useContextoStore.persist.hasHydrated()) {
        setHydrated(true);
      }
    };
    const unsubAuth = useAuthStore.persist.onFinishHydration(check);
    const unsubContexto = useContextoStore.persist.onFinishHydration(check);
    check();
    return () => { unsubAuth(); unsubContexto(); };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!usuario) {
      router.replace('/login');
      return;
    }
    if ((!empresa || !ubicacion) && pathname !== '/seleccionar-contexto') {
      router.replace('/seleccionar-contexto');
    }
  }, [hydrated, usuario, empresa, ubicacion, pathname, router]);

  if (!hydrated) {
    // Nada que decidir todavía — evita el parpadeo/redirección prematura.
    return null;
  }

  if (usuario && locked) {
    // Bloqueo local ("Cerrar sesión" de cada turno) — se muestra sobre la
    // ruta actual, sin navegar, para no perder lo que estaban haciendo.
    return <LockScreen />;
  }

  return <>{children}</>;
}
