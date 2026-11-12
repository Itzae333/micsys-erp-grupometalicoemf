import type { Articulo } from '@/lib/types/api';

// Las cargas de nota descuentan del sub-almacén 1 (ver CargasNotaService).
// Disponible = existencia − lo ya vendido que aún no se entrega.
export function disponibleArticulo(art: Pick<Articulo, 'existencia_1' | 'comprometido'>) {
  const existencia = Number(art.existencia_1 ?? 0);
  const comprometido = Number(art.comprometido ?? 0);
  return { existencia, comprometido, disponible: +(existencia - comprometido).toFixed(3) };
}

export function textoDisponibilidad(art: Pick<Articulo, 'existencia_1' | 'comprometido'>): string {
  const { existencia, comprometido, disponible } = disponibleArticulo(art);
  return comprometido > 0
    ? `Existencia ${existencia} · Comprometido ${comprometido} · Disponible ${disponible}`
    : `Existencia ${existencia}`;
}
