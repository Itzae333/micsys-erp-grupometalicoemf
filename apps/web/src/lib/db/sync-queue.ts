import { emfDb, type HttpMethod, type SyncQueueItem } from './emf-db';
import { checkSessionAlive } from '../api/client';
import { useAuthStore } from '../store/auth.store';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const MAX_RETRIES = 3;

// Encola una mutación para ejecutarse cuando haya conexión.
export async function enqueue(params: {
  method: HttpMethod;
  url: string;
  body: unknown;
  empresaId: string;
  ubicacionId: string;
  accessToken: string;
}): Promise<number> {
  return emfDb.syncQueue.add({
    createdAt: new Date(),
    status: 'pending',
    method: params.method,
    url: params.url,
    body: JSON.stringify(params.body),
    retries: 0,
    empresaId: params.empresaId,
    ubicacionId: params.ubicacionId,
    accessToken: params.accessToken,
  }) as Promise<number>;
}

// Procesa todos los pendientes en orden FIFO.
// Llama a esta función cuando se restaura la conexión.
export async function flushQueue(): Promise<{ ok: number; errors: number }> {
  const pending = await emfDb.syncQueue
    .where('status')
    .equals('pending')
    .sortBy('createdAt');

  if (pending.length === 0) return { ok: 0, errors: 0 };

  // El access_token ya no expira solo, pero pudo ser revocado ("Cerrar
  // todas las sesiones") mientras el equipo estuvo offline — se confirma
  // una vez aquí antes de reproducir todo el lote, en vez de arrastrar el
  // 401 por cada ítem pendiente.
  await checkSessionAlive();

  let ok = 0;
  let errors = 0;

  for (const item of pending) {
    const result = await _processItem(item);
    if (result) ok++;
    else errors++;
  }

  return { ok, errors };
}

async function _processItem(item: SyncQueueItem): Promise<boolean> {
  if (item.id === undefined) return false;

  await emfDb.syncQueue.update(item.id, { status: 'processing' });

  try {
    const tokenActual = useAuthStore.getState().accessToken ?? item.accessToken;
    const response = await fetch(`${BASE_URL}${item.url}`, {
      method: item.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenActual}`,
        'x-empresa-id': item.empresaId,
        'x-ubicacion-id': item.ubicacionId,
      },
      body: item.method !== 'DELETE' ? item.body : undefined,
    });

    if (response.ok) {
      await emfDb.syncQueue.update(item.id, { status: 'done', httpStatus: response.status });
      return true;
    }

    if (response.status === 422) {
      // 422 = servidor rechazó la operación por regla de negocio (ej. límite de
      // crédito excedido) — no se reintenta, pero se guarda el motivo para que
      // la pantalla de revisión pueda mostrarlo.
      let message = 'Rechazado por el servidor';
      try {
        const body = await response.json();
        if (typeof body?.message === 'string') message = body.message;
      } catch {
        // sin cuerpo JSON legible — se usa el mensaje genérico
      }
      await emfDb.syncQueue.update(item.id, { status: 'done', httpStatus: 422, lastError: message });
      return true;
    }

    throw new Error(`HTTP ${response.status}`);
  } catch (err) {
    const retries = item.retries + 1;
    if (retries >= MAX_RETRIES) {
      await emfDb.syncQueue.update(item.id, {
        status: 'error',
        retries,
        lastError: err instanceof Error ? err.message : 'Error desconocido',
      });
    } else {
      await emfDb.syncQueue.update(item.id, {
        status: 'pending',
        retries,
        lastError: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
    return false;
  }
}

// Retorna cuántos items están pendientes (para mostrar badge en UI)
export async function getPendingCount(): Promise<number> {
  return emfDb.syncQueue.where('status').equals('pending').count();
}

// Limpia los items completados exitosamente (status = 'done') para no crecer
// infinitamente. Los rechazados por 422 (ver getRejectedItems) NO se borran
// aquí — necesitan revisión manual primero.
export async function cleanDoneItems(): Promise<void> {
  await emfDb.syncQueue.where('status').equals('done').and((i) => i.httpStatus !== 422).delete();
}

// Retorna items con error para mostrar al usuario
export async function getErrorItems(): Promise<SyncQueueItem[]> {
  return emfDb.syncQueue.where('status').equals('error').toArray();
}

// Retorna items rechazados por el servidor con 422 (ej. crédito excedido) —
// terminaron en 'done' (no se reintentan solos) pero necesitan revisión manual.
export async function getRejectedItems(): Promise<SyncQueueItem[]> {
  const done = await emfDb.syncQueue.where('status').equals('done').toArray();
  return done.filter((i) => i.httpStatus === 422);
}

// Reintenta manualmente un item en error
export async function retryItem(id: number): Promise<boolean> {
  const item = await emfDb.syncQueue.get(id);
  if (!item) return false;
  await emfDb.syncQueue.update(id, { status: 'pending', retries: 0, lastError: undefined, httpStatus: undefined });
  return _processItem({ ...item, status: 'pending', retries: 0 });
}

// Descarta un item (error o rechazado) sin reintentar — el llamador es
// responsable de limpiar cualquier registro relacionado (ej. VentaPendiente).
export async function discardErrorItem(id: number): Promise<void> {
  await emfDb.syncQueue.delete(id);
}
