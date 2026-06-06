'use client';

import { useEffect, useState } from 'react';
import { flushQueue, cleanDoneItems, getPendingCount } from '@/lib/db/sync-queue';

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
      await cleanDoneItems();
      await refreshPending();
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
