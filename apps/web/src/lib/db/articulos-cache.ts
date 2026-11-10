import { emfDb } from './emf-db';
import { api } from '../api/client';
import type { Articulo, ArticulosPage } from '../types/api';

const PAGE_LIMIT = 200;

function nombreDisplay(art: Articulo): string {
  return [art.descripcion_1, art.descripcion_2, art.descripcion_3, art.descripcion_4, art.descripcion_5]
    .filter(Boolean).join(' · ');
}

// Descarga el catálogo completo de artículos activos y lo guarda en Dexie,
// página por página, para poder buscar artículos sin conexión. Se llama
// mientras hay red (idealmente en segundo plano); si falla a la mitad, la
// próxima llamada exitosa simplemente sobrescribe lo que ya se cacheó.
export async function refreshArticulosCache(empresaId: string, ubicacionId: string): Promise<void> {
  let page = 1;
  let pages = 1;
  const idsVigentes = new Set<string>();

  do {
    const res = await api.get<ArticulosPage>(`/articulos?page=${page}&limit=${PAGE_LIMIT}&activo=true`);
    pages = res.pages;
    res.data.forEach((art) => idsVigentes.add(art.id));

    await emfDb.articulosCache.bulkPut(
      res.data.map((art) => ({
        id: art.id,
        empresaId,
        ubicacionId,
        clave: art.clave,
        nombre: nombreDisplay(art),
        payload: JSON.stringify(art),
        cachedAt: new Date(),
      })),
    );

    page++;
  } while (page <= pages);

  // Descarga completa: quita lo que el servidor ya no devuelve (ej. productos
  // especiales ocultados) para que no sigan saliendo en la búsqueda offline.
  await emfDb.articulosCache
    .where({ empresaId, ubicacionId })
    .filter((c) => !idsVigentes.has(c.id))
    .delete();
}

const REFRESH_TTL_MS = 10 * 60 * 1000; // 10 min

// Igual que refreshArticulosCache, pero no repite la descarga completa si el
// caché de esta empresa/ubicación ya se refrescó hace poco — para poder
// llamarla libremente en segundo plano (al entrar a la app, al reconectar)
// sin generar tráfico de más.
export async function refreshArticulosCacheIfStale(empresaId: string, ubicacionId: string): Promise<void> {
  const reciente = await emfDb.articulosCache.where({ empresaId, ubicacionId }).first();
  if (reciente && Date.now() - reciente.cachedAt.getTime() < REFRESH_TTL_MS) return;
  return refreshArticulosCache(empresaId, ubicacionId);
}

// Busca artículos en el caché local por clave o nombre (para el formulario de
// venta rápida offline). No requiere conexión.
export async function searchArticulosCache(
  empresaId: string,
  ubicacionId: string,
  query: string,
): Promise<Articulo[]> {
  const rows = await emfDb.articulosCache
    .where({ empresaId, ubicacionId })
    .toArray();

  // Por palabras (todas deben aparecer, en cualquier orden): el nombre guarda las
  // descripciones separadas por " · ", así que "charola 40" nunca coincidiría
  // como una sola frase con "Charola · 40 X 85".
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = words.length
    ? rows.filter((r) => {
        const texto = `${r.clave} ${r.nombre}`.toLowerCase();
        return words.every((w) => texto.includes(w));
      })
    : rows;

  return filtered.slice(0, 30).map((r) => JSON.parse(r.payload) as Articulo);
}
