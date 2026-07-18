import { emfDb, type VentaPendiente, type VentaPendienteSyncStatus } from './emf-db';

export interface LineaVentaPendiente {
  articulo_id: string;
  clave: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
}

export interface PagoVentaPendiente {
  metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'DEPOSITO';
  monto: number;
  referencia?: string;
}

export async function nextFolioLocal(empresaId: string, ubicacionId: string): Promise<number> {
  const count = await emfDb.ventasPendientes.where({ empresaId, ubicacionId }).count();
  return count + 1;
}

export async function addVentaPendiente(params: {
  clientRef: string;
  empresaId: string;
  ubicacionId: string;
  usuarioId: string;
  clienteId: string | null;
  clienteNombre: string | null;
  lineas: LineaVentaPendiente[];
  subtotal: number;
  total: number;
  tipoCierre: 'PAGADA' | 'CREDITO' | 'PENDIENTE';
  pagos: PagoVentaPendiente[];
  syncQueueId?: number;
  folioLocal: number;
}): Promise<void> {
  const venta: VentaPendiente = {
    clientRef: params.clientRef,
    empresaId: params.empresaId,
    ubicacionId: params.ubicacionId,
    createdAt: new Date(),
    usuarioId: params.usuarioId,
    clienteId: params.clienteId,
    clienteNombre: params.clienteNombre,
    lineas: JSON.stringify(params.lineas),
    subtotal: params.subtotal,
    total: params.total,
    tipoCierre: params.tipoCierre,
    pagos: JSON.stringify(params.pagos),
    syncStatus: 'queued',
    syncQueueId: params.syncQueueId,
    folioLocal: params.folioLocal,
  };
  await emfDb.ventasPendientes.put(venta);
}

export async function getVentasPendientes(empresaId: string, ubicacionId: string): Promise<VentaPendiente[]> {
  const rows = await emfDb.ventasPendientes.where({ empresaId, ubicacionId }).sortBy('createdAt');
  return rows.reverse(); // más recientes primero
}

export async function markVentaPendienteStatus(
  clientRef: string,
  syncStatus: VentaPendienteSyncStatus,
  lastError?: string,
): Promise<void> {
  await emfDb.ventasPendientes.update(clientRef, { syncStatus, lastError });
}

export async function removeVentaPendiente(clientRef: string): Promise<void> {
  await emfDb.ventasPendientes.delete(clientRef);
}

// Revisa cada venta pendiente contra el estado actual de su item en syncQueue
// y actualiza/borra según corresponda. Llamar después de flushQueue() y ANTES
// de cleanDoneItems() (que ya preserva los ítems 422, pero el syncQueueId de
// una venta ya sincronizada exitosamente puede haber sido limpiado).
export async function reconcileVentasPendientes(): Promise<void> {
  const pendientes = await emfDb.ventasPendientes.where('syncStatus').equals('queued').toArray();

  for (const p of pendientes) {
    if (p.syncQueueId === undefined) continue;
    const queueItem = await emfDb.syncQueue.get(p.syncQueueId);

    if (!queueItem) {
      // Ya no está en la cola (limpiado tras un 'done' exitoso previo) — la
      // venta real ya existe en el servidor, se borra el registro sombra.
      await emfDb.ventasPendientes.delete(p.clientRef);
      continue;
    }

    if (queueItem.status === 'done' && queueItem.httpStatus === 422) {
      await emfDb.ventasPendientes.update(p.clientRef, { syncStatus: 'failed', lastError: queueItem.lastError });
    } else if (queueItem.status === 'done') {
      await emfDb.ventasPendientes.delete(p.clientRef);
    } else if (queueItem.status === 'error') {
      await emfDb.ventasPendientes.update(p.clientRef, { syncStatus: 'failed', lastError: queueItem.lastError });
    }
    // 'pending'/'processing' — sigue en curso, no-op.
  }
}
