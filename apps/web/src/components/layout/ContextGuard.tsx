'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { LockScreen } from './LockScreen';

// Si nadie toca la pantalla/teclado por este tiempo, se bloquea sola con PIN
// — no espera a que el access token expire y el refresh sea rechazado (eso
// es un cierre de sesión real, no un bloqueo por inactividad).
const IDLE_LOCK_MS = 60 * 60 * 1000; // 1 hora
const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

export function ContextGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Observar el estado reactivo directamente, no la función helper
  const usuario = useAuthStore((s) => s.usuario);
  const locked = useAuthStore((s) => s.locked);
  const { empresa, ubicacion } = useContextoStore();

  useEffect(() => {
    if (!usuario || locked) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => useAuthStore.getState().lock(), IDLE_LOCK_MS);
    };
    reset();
    IDLE_EVENTS.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      IDLE_EVENTS.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [usuario, locked]);

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
