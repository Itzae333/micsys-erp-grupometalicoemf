// Los artículos tienen 5 sub-almacenes de existencia (existencia_1..5) — el
// slot activo depende de ConfigColumnasUbicacion por empresa+ubicación. Este
// helper centraliza el acceso al campo dinámico para no reimplementarlo por
// separado en cada módulo que mueve inventario (movimientos, remisiones,
// cargas de nota, recepción de compras).

export function getExistencia(articulo: Record<string, unknown>, num: number): number {
  return Number((articulo as any)[`existencia_${num}`] ?? 0);
}

export function buildExistenciaUpdate(num: number, val: number): Record<string, number> {
  return { [`existencia_${num}`]: val };
}
