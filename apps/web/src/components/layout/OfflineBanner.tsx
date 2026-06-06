'use client';

import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';

export function OfflineBanner() {
  const { isOnline, pendingSync } = useOnlineStatus();

  if (isOnline && pendingSync === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-4 py-2 text-body-sm font-medium transition-colors',
        isOnline
          ? 'bg-green-600 text-white'
          : 'bg-steel-800 text-steel-300',
      )}
    >
      {isOnline ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Conexión restaurada — sincronizando {pendingSync} operación{pendingSync !== 1 ? 'es' : ''}…</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Sin conexión — los cambios se sincronizarán al reconectarte</span>
          {pendingSync > 0 && (
            <span className="ml-auto bg-steel-700 text-steel-300 text-meta px-2 py-0.5 rounded-full">
              {pendingSync} pendiente{pendingSync !== 1 ? 's' : ''}
            </span>
          )}
        </>
      )}
    </div>
  );
}
