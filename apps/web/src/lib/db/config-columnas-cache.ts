import { emfDb } from './emf-db';
import { api } from '../api/client';
import type { ConfigColumnasSchema } from '../types/api';

const TTL_MS = 60 * 60 * 1000; // 1 hora

function cacheKey(empresaId: string, ubicacionId: string) {
  return `${empresaId}:${ubicacionId}`;
}

// Lee el schema desde caché local o lo descarga si expiró.
export async function getConfigColumnasSchema(
  empresaId: string,
  ubicacionId: string,
): Promise<ConfigColumnasSchema | null> {
  const key = cacheKey(empresaId, ubicacionId);
  const cached = await emfDb.configColumnasCache.get(key);

  if (cached) {
    const age = Date.now() - cached.cachedAt.getTime();
    if (age < TTL_MS) {
      return JSON.parse(cached.schema) as ConfigColumnasSchema;
    }
  }

  // Caché expirado o vacío — intentar red
  try {
    const schema = await api.get<ConfigColumnasSchema>(
      `/config-columnas/${empresaId}/${ubicacionId}/schema`,
    );
    await emfDb.configColumnasCache.put({
      id: key,
      empresaId,
      ubicacionId,
      schema: JSON.stringify(schema),
      cachedAt: new Date(),
    });
    return schema;
  } catch {
    // Sin conexión: devuelve el caché aunque esté expirado
    if (cached) return JSON.parse(cached.schema) as ConfigColumnasSchema;
    return null;
  }
}

// Invalida el caché de una ubicación (llamar después de un upsert de columnas)
export async function invalidateConfigColumnas(
  empresaId: string,
  ubicacionId: string,
): Promise<void> {
  await emfDb.configColumnasCache.delete(cacheKey(empresaId, ubicacionId));
}
