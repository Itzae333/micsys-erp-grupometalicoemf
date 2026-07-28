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

    async function handleOnline() {
      setIsOnline(true);
      // Cuando se recupera la conexión, procesa la cola automáticamente
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

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Inicializar conteo
    refreshPending();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, pendingSync };
}
