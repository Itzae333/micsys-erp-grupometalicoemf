import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emfDb } from './emf-db';
import {
  enqueue,
  flushQueue,
  getPendingCount,
  cleanDoneItems,
  getErrorItems,
  retryItem,
} from './sync-queue';

// Mock fetch globalmente
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const CTX = {
  empresaId: 'emfimifar-id',
  ubicacionId: 'emf-matriz-id',
  accessToken: 'test-token',
};

beforeEach(async () => {
  // Limpiar la base de datos entre tests
  await emfDb.syncQueue.clear();
  fetchMock.mockReset();
});

describe('enqueue', () => {
  it('agrega un item con status pending', async () => {
    const id = await enqueue({
      method: 'POST',
      url: '/ventas',
      body: { total: 100 },
      ...CTX,
    });

    const item = await emfDb.syncQueue.get(id);
    expect(item).toBeDefined();
    expect(item?.status).toBe('pending');
    expect(item?.method).toBe('POST');
    expect(item?.url).toBe('/ventas');
    expect(item?.retries).toBe(0);
  });

  it('serializa el body como JSON', async () => {
    const payload = { articulo: 'LAMINA-001', cantidad: 5, precio: 350.0 };
    const id = await enqueue({ method: 'POST', url: '/ventas/items', body: payload, ...CTX });

    const item = await emfDb.syncQueue.get(id);
    expect(JSON.parse(item!.body)).toEqual(payload);
  });
});

describe('getPendingCount', () => {
  it('retorna 0 con cola vacía', async () => {
    expect(await getPendingCount()).toBe(0);
  });

  it('cuenta solo items pending', async () => {
    await enqueue({ method: 'POST', url: '/a', body: {}, ...CTX });
    await enqueue({ method: 'POST', url: '/b', body: {}, ...CTX });
    await emfDb.syncQueue.add({
      createdAt: new Date(),
      status: 'done',
      method: 'POST',
      url: '/c',
      body: '{}',
      retries: 0,
      ...CTX,
    });

    expect(await getPendingCount()).toBe(2);
  });
});

describe('flushQueue', () => {
  it('procesa items pendientes con fetch exitoso', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await enqueue({ method: 'POST', url: '/ventas', body: { total: 100 }, ...CTX });
    await enqueue({ method: 'PATCH', url: '/articulos/1', body: { stock: 10 }, ...CTX });

    const result = await flushQueue();
    expect(result.ok).toBe(2);
    expect(result.errors).toBe(0);

    // Todos deben estar en 'done'
    const items = await emfDb.syncQueue.toArray();
    expect(items.every((i) => i.status === 'done')).toBe(true);
  });

  it('pone en error los items que fallan MAX_RETRIES veces', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));

    const id = await enqueue({ method: 'POST', url: '/ventas', body: {}, ...CTX });

    // Cada llamada a flushQueue incrementa retries
    await flushQueue(); // retries = 1 → pending
    await flushQueue(); // retries = 2 → pending
    await flushQueue(); // retries = 3 → error

    const item = await emfDb.syncQueue.get(id);
    expect(item?.status).toBe('error');
    expect(item?.retries).toBe(3);
    expect(item?.lastError).toContain('Network error');
  });

  it('marca como done los errores 422 (rechazo de negocio, no reintentar)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    const id = await enqueue({ method: 'POST', url: '/ventas', body: {}, ...CTX });
    await flushQueue();

    const item = await emfDb.syncQueue.get(id);
    expect(item?.status).toBe('done');
  });

  it('retorna { ok: 0, errors: 0 } con cola vacía', async () => {
    const result = await flushQueue();
    expect(result).toEqual({ ok: 0, errors: 0 });
  });
});

describe('cleanDoneItems', () => {
  it('elimina solo los items con status done', async () => {
    await enqueue({ method: 'POST', url: '/a', body: {}, ...CTX });
    await emfDb.syncQueue.add({
      createdAt: new Date(),
      status: 'done',
      method: 'POST',
      url: '/b',
      body: '{}',
      retries: 0,
      ...CTX,
    });

    await cleanDoneItems();

    const remaining = await emfDb.syncQueue.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe('pending');
  });
});

describe('getErrorItems', () => {
  it('retorna solo los items en error', async () => {
    fetchMock.mockRejectedValue(new Error('fail'));

    await enqueue({ method: 'POST', url: '/a', body: {}, ...CTX });
    await emfDb.syncQueue.add({
      createdAt: new Date(),
      status: 'error',
      method: 'POST',
      url: '/b',
      body: '{}',
      retries: 3,
      lastError: 'Network error',
      ...CTX,
    });

    const errors = await getErrorItems();
    expect(errors).toHaveLength(1);
    expect(errors[0].url).toBe('/b');
  });
});

describe('retryItem', () => {
  it('resetea retries y re-ejecuta el item', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const id = await emfDb.syncQueue.add({
      createdAt: new Date(),
      status: 'error',
      method: 'POST',
      url: '/ventas',
      body: '{}',
      retries: 3,
      lastError: 'prev error',
      ...CTX,
    });

    const success = await retryItem(id);
    expect(success).toBe(true);

    const item = await emfDb.syncQueue.get(id);
    expect(item?.status).toBe('done');
  });

  it('retorna false si el id no existe', async () => {
    expect(await retryItem(99999)).toBe(false);
  });
});
