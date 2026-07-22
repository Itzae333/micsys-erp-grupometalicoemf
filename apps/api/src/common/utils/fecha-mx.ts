// México opera en horario estándar fijo (UTC-6, sin horario de verano desde
// 2022). Los filtros "por día" (corte de caja, período Hoy/Semana/etc., gastos)
// deben usar el día calendario del negocio, no el día UTC del servidor — si no,
// una venta/gasto después de las 18:00 hora local queda contado en el día UTC
// siguiente.
//
// Algunos llamadores mandan una fecha plana "YYYY-MM-DD" (inputs type="date")
// y otros ya mandan un instante ISO completo con hora (ej. el filtro de período
// del listado de ventas, vía `new Date(...).toISOString()`). Si ya trae hora,
// es un instante preciso — se respeta tal cual, no se le concatena nada
// (concatenar rompe el string y produce una fecha inválida).

export function inicioDiaMx(fecha: string): Date {
  return fecha.includes('T') ? new Date(fecha) : new Date(`${fecha}T00:00:00-06:00`);
}

export function finDiaMx(fecha: string): Date {
  return fecha.includes('T') ? new Date(fecha) : new Date(`${fecha}T23:59:59.999-06:00`);
}

// Una cotización convertida a venta conserva su folio y su created_at original
// (el día en que se cotizó) — cambiarlos haría que el folio se vea fuera de
// orden cronológico frente a notas creadas después. Pero para reportes de
// dinero (corte de caja, ventas del día/mes) lo que importa es cuándo se cobró
// de verdad, no cuándo se creó el registro: se filtra por `cerrada_at`, y solo
// se usa `created_at` como respaldo para notas que nunca tuvieron un cierre
// aparte (abiertas, canceladas, o migradas de un sistema anterior sin ese dato).
export function rangoCierreNota(rango: { gte?: Date; lte?: Date }) {
  return {
    OR: [
      { cerrada_at: rango },
      { cerrada_at: null, created_at: rango },
    ],
  };
}

// Para distinguir "nota que ya era venta antes de este rango" (p. ej. un abono
// de hoy sobre una nota a crédito vieja) de "nota que se volvió venta apenas
// hoy" (una cotización convertida y cobrada hoy) — misma lógica que
// rangoCierreNota pero para un límite superior exclusivo en vez de un rango.
export function antesDeCierreNota(antesDe: Date) {
  return {
    OR: [
      { cerrada_at: { lt: antesDe } },
      { cerrada_at: null, created_at: { lt: antesDe } },
    ],
  };
}
