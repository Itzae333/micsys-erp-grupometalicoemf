import { emfDb, type HttpMethod, type SyncQueueItem } from './emf-db';

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
  });
}

// Procesa todos los pendientes en orden FIFO.
// Llama a esta función cuando se restaura la conexión.
export async function flushQueue(): Promise<{ ok: number; errors: number }> {
  const pending = await emfDb.syncQueue
    .where('status')
    .equals('pending')
    .sortBy('createdAt');

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
    const response = await fetch(`${BASE_URL}${item.url}`, {
      method: item.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${item.accessToken}`,
        'x-empresa-id': item.empresaId,
        'x-ubicacion-id': item.ubicacionId,
      },
      body: item.method !== 'DELETE' ? item.body : undefined,
    });

    if (response.ok || response.status === 422) {
      // 422 = servidor rechazó la operación por regla de negocio — no reintentar
      await emfDb.syncQueue.update(item.id, { status: 'done' });
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

// Limpia los items completados (status = 'done') para no crecer infinitamente
export async function cleanDoneItems(): Promise<void> {
  await emfDb.syncQueue.where('status').equals('done').delete();
}

// Retorna items con error para mostrar al usuario
export async function getErrorItems(): Promise<SyncQueueItem[]> {
  return emfDb.syncQueue.where('status').equals('error').toArray();
}

// Reintenta manualmente un item en error
export async function retryItem(id: number): Promise<boolean> {
  const item = await emfDb.syncQueue.get(id);
  if (!item) return false;
  await emfDb.syncQueue.update(id, { status: 'pending', retries: 0, lastError: undefined });
  return _processItem({ ...item, status: 'pending', retries: 0 });
}
