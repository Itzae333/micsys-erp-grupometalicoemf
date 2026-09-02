'use client';

import { useEffect, useState } from 'react';
import { flushQueue, cleanDoneItems, getPendingCount } from '@/lib/db/sync-queue';
import { reconcileVentasPendientes } from '@/lib/db/ventas-pendientes';
import { refreshArticulosCacheIfStale } from '@/lib/db/articulos-cache';
import { getClientesCache } from '@/lib/db/clientes-cache';
import { useContextoStore } from '@/lib/store/contexto.store';

interface OnlineStatus {
  isOnline: boolean;
  pendingSync: number;
}

// Cada cuánto se reintenta la cola en segundo plano mientras hay conexión —
// cubre el caso de que el intento disparado por el evento `online` haya
// fallado (ej. el navegador avisa "online" con la interfaz de red ya activa
// pero el internet real tardando unos segundos más en responder) y nada
// vuelva a reintentarlo, porque ese evento no se repite solo.
const RETRY_INTERVAL_MS = 2 * 60 * 1000;

export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pendingSync, setPendingSync] = useState(0);

  useEffect(() => {
    async function refreshPending() {
      const count = await getPendingCount();
      setPendingSync(count);
    }

    async function syncNow() {
      await flushQueue();
      await reconcileVentasPendientes();
      await cleanDoneItems();
      await refreshPending();
      // Y aprovecha para refrescar el catálogo offline, por si el usuario
      // abrió la app sin conexión (vía PIN) y no lo tenía precargado.
      const { empresa, ubicacion } = useContextoStore.getState();
      if (empresa?.id && ubicacion?.id) {
        void refreshArticulosCacheIfStale(empresa.id, ubicacion.id).catch(() => {});
        void getClientesCache(empresa.id, ubicacion.id).catch(() => {});
      }
    }

    async function handleOnline() {
      setIsOnline(true);
      // Cuando se recupera la conexión, procesa la cola automáticamente
      await syncNow();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Inicializar conteo y, si ya hay pendientes al montar (ej. se recargó la
    // página después de un intento fallido que nunca se reintentó solo),
    // dispara un intento de una vez — no hay que esperar a otra transición
    // offline→online que quizá nunca vuelva a pasar.
    (async () => {
      await refreshPending();
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const count = await getPendingCount();
        if (count > 0) await syncNow();
      }
    })();

    // Reintento periódico mientras la pestaña siga abierta y online — mismo
    // motivo que arriba, para no depender de que el evento `online` se
    // repita.
    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void syncNow();
      }
    }, RETRY_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return { isOnline, pendingSync };
}
