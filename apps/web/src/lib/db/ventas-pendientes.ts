import { emfDb, type VentaPendiente, type VentaPendienteSyncStatus } from './emf-db';
import { enqueue, retryItem, cleanDoneItems } from './sync-queue';
import { useAuthStore } from '../store/auth.store';

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
  aplicaIva?: boolean;
  observaciones?: string;
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
    aplicaIva: params.aplicaIva,
    observaciones: params.observaciones,
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

// Revisa cada venta pendiente (queued o failed) contra el estado actual de su
// item en syncQueue y actualiza/borra según corresponda. Llamar después de
// flushQueue() y ANTES de cleanDoneItems() (que ya preserva los ítems 422,
// pero el syncQueueId de una venta ya sincronizada exitosamente puede haber
// sido limpiado).
//
// También revisa 'failed': antes solo se miraban las 'queued', así que una
// venta que ya había quedado marcada como fallida NUNCA se volvía a revisar
// — si luego un reintento (manual o automático) la sincronizaba con éxito y
// cleanDoneItems() borraba su item de la cola, la nota se quedaba mostrando
// "Sincronización fallida" para siempre en la lista de Ventas, aunque ya
// existiera bien en el servidor. Al incluir 'failed' aquí, esas notas se
// autocorrigen en el siguiente ciclo (evento 'online' o el intervalo de
// reintento de useOnlineStatus), sin necesitar acción manual.
export async function reconcileVentasPendientes(): Promise<void> {
  const pendientes = await emfDb.ventasPendientes.where('syncStatus').anyOf(['queued', 'failed']).toArray();

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
    } else if (p.syncStatus === 'failed') {
      // El item de cola volvió a 'pending'/'processing' (reintento en curso,
      // ej. desde el panel de Sincronización) — ya no es definitivamente
      // fallida, se refleja en la lista mientras se resuelve.
      await emfDb.ventasPendientes.update(p.clientRef, { syncStatus: 'queued', lastError: undefined });
    }
    // 'pending'/'processing' sobre una que ya estaba 'queued' — sigue en
    // curso, no-op.
  }
}

// Reintenta sincronizar una venta pendiente desde la lista de Ventas, sin
// depender del panel de Sincronización (solo para SUPER_USUARIO). Cubre dos
// casos:
//  - El item de syncQueue sigue vivo (referenciado por syncQueueId): se
//    reintenta ese mismo item.
//  - El item ya no existe (se limpió, se descartó, o el registro quedó sin
//    syncQueueId por alguna razón): se reconstruye el payload original a
//    partir de los datos guardados en la venta sombra y se vuelve a encolar
//    desde cero — esto es lo que desatasca una nota que llevaba mucho tiempo
//    en "Pendiente de sincronizar" sin ningún item de cola detrás.
export async function reintentarVentaPendiente(clientRef: string): Promise<{ ok: boolean; mensaje: string }> {
  const venta = await emfDb.ventasPendientes.get(clientRef);
  if (!venta) return { ok: false, mensaje: 'La venta ya no está en la lista local.' };

  const queueItem = venta.syncQueueId !== undefined ? await emfDb.syncQueue.get(venta.syncQueueId) : undefined;

  if (queueItem?.id !== undefined) {
    await retryItem(queueItem.id);
  } else {
    const dto = {
      cliente_id: venta.clienteId ?? undefined,
      observaciones: venta.observaciones,
      aplica_iva: venta.aplicaIva ?? false,
      tipo_cierre: venta.tipoCierre,
      pagos: JSON.parse(venta.pagos) as PagoVentaPendiente[],
      lineas: (JSON.parse(venta.lineas) as LineaVentaPendiente[]).map((l) => ({
        articulo_id: l.articulo_id,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        descuento: l.descuento,
      })),
      client_ref: venta.clientRef,
    };
    const queueId = await enqueue({
      method: 'POST',
      url: '/ventas/rapida',
      body: dto,
      empresaId: venta.empresaId,
      ubicacionId: venta.ubicacionId,
      accessToken: useAuthStore.getState().accessToken ?? '',
    });
    await emfDb.ventasPendientes.update(clientRef, { syncQueueId: queueId, syncStatus: 'queued', lastError: undefined });
    await retryItem(queueId);
  }

  await reconcileVentasPendientes();
  await cleanDoneItems();

  // `ok` (el resultado crudo de retryItem/_processItem) no alcanza para
  // saber si de verdad se resolvió: un rechazo 422 del servidor también
  // devuelve `true` ahí (se considera "procesado", no "reintentable"). Lo
  // confiable es si la venta sombra sigue existiendo después de reconciliar
  // — si ya no está, se sincronizó; si sigue, el mensaje real es el que dejó
  // el reconcile en `lastError` (rechazo de negocio o error de red).
  const sigueExistiendo = await emfDb.ventasPendientes.get(clientRef);
  return {
    ok: !sigueExistiendo,
    mensaje: !sigueExistiendo
      ? 'Sincronizada correctamente.'
      : (sigueExistiendo.lastError ?? 'Sigue sin poder sincronizarse.'),
  };
}
