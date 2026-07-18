'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { emfDb } from '@/lib/db/emf-db';
import { retryItem, discardErrorItem } from '@/lib/db/sync-queue';
import { removeVentaPendiente } from '@/lib/db/ventas-pendientes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useBlockRoles } from '@/lib/hooks/use-block-roles';

function fmtFecha(d: Date) {
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SincronizacionPage() {
  useBlockRoles(['SUPER_USUARIO'], '/configuracion');
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  const items = useLiveQuery(
    async () => {
      const all = await emfDb.syncQueue.toArray();
      return all
        .filter((i) => i.status === 'error' || (i.status === 'done' && i.httpStatus === 422))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    [],
    [],
  );

  async function onRetry(id: number) {
    setBusyId(id);
    try {
      const ok = await retryItem(id);
      toast(ok ? 'Sincronizado correctamente' : 'Sigue fallando — revisa el motivo', ok ? 'success' : 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onDiscard(id: number, body: string) {
    setBusyId(id);
    try {
      // Si la mutación descartada era una venta rápida, también se borra su registro sombra.
      try {
        const parsed = JSON.parse(body) as { client_ref?: string };
        if (parsed.client_ref) await removeVentaPendiente(parsed.client_ref);
      } catch {
        // el body no correspondía a una venta rápida — nada que limpiar
      }
      await discardErrorItem(id);
      toast('Descartado', 'info');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-amber-600" />
        <div>
          <h1 className="text-2xl font-bold text-steel-900">Sincronización</h1>
          <p className="text-body-sm text-steel-500">
            Ventas creadas sin conexión que fallaron o fueron rechazadas al sincronizar — requieren revisión manual.
          </p>
        </div>
      </div>

      {!items || items.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Sin pendientes"
          description="No hay ventas offline con errores o rechazos por revisar."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            let detalle: { tipo_cierre?: string; lineas?: unknown[] } = {};
            try {
              detalle = JSON.parse(item.body);
            } catch {
              // body no parseable — se muestra sin detalle
            }
            const esRechazo = item.status === 'done' && item.httpStatus === 422;

            return (
              <div key={item.id} className="bg-white border border-steel-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={esRechazo ? 'credit' : 'cancelled'}>
                      {esRechazo ? 'Rechazado por el servidor' : 'Error de sincronización'}
                    </Badge>
                    <span className="text-body-sm text-steel-500">{item.method} {item.url}</span>
                  </div>
                  <span className="text-caption text-steel-400">{fmtFecha(item.createdAt)}</span>
                </div>

                {item.lastError && (
                  <p className="text-body-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {item.lastError}
                  </p>
                )}

                {detalle.lineas && (
                  <p className="text-caption text-steel-500">
                    {detalle.lineas.length} línea(s) · tipo: {detalle.tipo_cierre ?? '—'}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === item.id}
                    onClick={() => item.id !== undefined && onDiscard(item.id, item.body)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Descartar
                  </Button>
                  <Button
                    size="sm"
                    loading={busyId === item.id}
                    onClick={() => item.id !== undefined && onRetry(item.id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Reintentar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
