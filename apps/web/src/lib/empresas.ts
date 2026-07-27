// Metálicos Lyeva pidió varias personalizaciones puntuales (corte de caja
// agrupado por vendedor, nombre del vendedor en el ticket de venta) — id fijo
// seedeado en packages/database/prisma/seed.ts. No existe un mecanismo de
// configuración por empresa en el proyecto; se resuelve así por ser casos de
// una sola empresa.
export const EMPRESA_METALICOS_LYEVA_ID = 'metalicos-leyva-id';

// EMFIMIFAR pidió que el ticket de Corte de Caja resalte el total en efectivo
// (lo que les importa para el arqueo físico) en vez de "Total de ventas" —
// mismo criterio de personalización puntual por empresa que Metálicos Lyeva.
export const EMPRESA_EMFIMIFAR_ID = 'emfimifar-id';

// Láminas Monterrey pidió un check "Imprimir nota sin precio" al cobrar/
// reimprimir, que saca una copia extra del ticket sin precios/total/forma de
// pago (nota de entrega para firma) — personalización puntual, mismo criterio
// que arriba.
export const EMPRESA_LAMINAS_MONTERREY_ID = 'laminas-monterrey-id';
