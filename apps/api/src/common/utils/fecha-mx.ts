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

// Resta `n` días hábiles (lunes a viernes, sin festivos) a la fecha de hoy en
// horario de México y regresa el resultado como "YYYY-MM-DD". Usado para
// limitar cuánto puede retroceder el rol ENCARGADO al generar un corte de caja.
export function restarDiasHabilesMx(n: number): string {
  const fecha = inicioDiaMx(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }));
  let restantes = n;
  while (restantes > 0) {
    fecha.setUTCDate(fecha.getUTCDate() - 1);
    const diaSemana = fecha.getUTCDay(); // 0 = domingo, 6 = sábado
    if (diaSemana !== 0 && diaSemana !== 6) restantes--;
  }
  return fecha.toISOString().slice(0, 10);
}
