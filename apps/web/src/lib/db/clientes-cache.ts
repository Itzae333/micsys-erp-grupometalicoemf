import { emfDb } from './emf-db';
import { api } from '../api/client';
import type { Cliente } from '../types/api';

const TTL_MS = 60 * 60 * 1000; // 1 hora

function cacheKey(empresaId: string, ubicacionId: string) {
  return `${empresaId}:${ubicacionId}:list`;
}

// Lee la lista de clientes desde caché local o la descarga si expiró.
// Si no hay conexión, devuelve el caché aunque esté vencido (mejor una lista
// desactualizada que no poder elegir cliente para una venta a crédito offline).
export async function getClientesCache(
  empresaId: string,
  ubicacionId: string,
): Promise<Cliente[]> {
  const key = cacheKey(empresaId, ubicacionId);
  const cached = await emfDb.clientesCache.get(key);

  if (cached) {
    const age = Date.now() - cached.cachedAt.getTime();
    if (age < TTL_MS) {
      return JSON.parse(cached.payload) as Cliente[];
    }
  }

  try {
    const clientes = await api.get<Cliente[]>('/clientes');
    await emfDb.clientesCache.put({
      id: key,
      empresaId,
      ubicacionId,
      payload: JSON.stringify(clientes),
      cachedAt: new Date(),
    });
    return clientes;
  } catch {
    if (cached) return JSON.parse(cached.payload) as Cliente[];
    return [];
  }
}
