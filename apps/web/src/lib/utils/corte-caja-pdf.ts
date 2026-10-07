import { downloadHtmlAsPdf, sanitizeFilename } from './pdf-from-html';

// Tipos estructurales mínimos: la página del corte tiene su propio CorteCajaData
// (con más campos) y es asignable a esto.
interface MetodoResumen { count: number; total: number }
export interface CorteCajaPdfData {
  desde: string | null;
  hasta: string | null;
  total_ventas: number;
  total_cobrado: number;
  total_gastos: number;
  total_neto: number;
  total_entregar_efectivo: number;
  por_metodo: Record<string, MetodoResumen>;
  por_estatus: Record<string, MetodoResumen>;
  pagos_credito?: {
    total: number; count: number;
    por_metodo: Record<string, MetodoResumen>;
    detalle: { folio: number; metodo: string; monto: number; cambio: number; total: number }[];
  };
  anticipos_pedido?: {
    total: number; count: number;
    detalle: { pedido_folio: number; cliente: string; metodo: string; monto: number }[];
  };
  pagos_administrativos?: {
    total: number; count: number;
    detalle: { folio: number; monto: number; referencia: string | null }[];
  };
  notas: {
    folio: number; estatus: string; total: number; cambio: number; created_at: string;
    cliente: { nombre: string };
    pagos: { metodo: string; monto: number }[];
  }[];
  gastos: {
    concepto: string; categoria: string; monto: number; metodo_pago: string; usuario: string;
  }[];
}

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
  ADMINISTRATIVO: 'Administrativo', CANCELADA: 'Cancelada',
};
const metodoLabel = (m: string) => METODO_LABEL[m] ?? m;

const fmt = (n: number) =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const folio = (n: number) => `#${String(n).padStart(4, '0')}`;
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });

// Nombres de clientes/conceptos son texto libre: se escapan antes de armar el HTML.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TH = 'padding:6px 8px;color:#e2e8f0;';
const TD = 'padding:5px 8px;border-bottom:1px solid #f1f5f9;color:#334155;';
const bg = (i: number) => (i % 2 ? '#f8fafc' : '#ffffff');

function titulo(texto: string): string {
  return `<h2 style="font-size:14px;font-weight:700;color:#0f172a;margin:22px 0 8px;">${esc(texto)}</h2>`;
}

function tabla(cabeceras: { t: string; right?: boolean }[], filas: string[][], pie?: { colspan: number; label: string; valor: string }): string {
  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#0f172a;">
        ${cabeceras.map((c) => `<th style="${TH}text-align:${c.right ? 'right' : 'left'};">${c.t}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${filas.map((f, i) => `<tr style="background:${bg(i)};">${f.map((celda, j) =>
          `<td style="${TD}${cabeceras[j]?.right ? 'text-align:right;' : ''}">${celda}</td>`).join('')}</tr>`).join('')}
      </tbody>
      ${pie ? `<tfoot><tr style="background:#e2e8f0;">
        <td colspan="${pie.colspan}" style="padding:6px 8px;font-weight:700;color:#0f172a;text-align:right;">${esc(pie.label)}</td>
        <td style="padding:6px 8px;font-weight:700;color:#0f172a;text-align:right;">${pie.valor}</td>
      </tr></tfoot>` : ''}
    </table>`;
}

function tarjeta(etiqueta: string, valor: string, color = '#0f172a'): string {
  return `<div style="flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
    <p style="margin:0;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">${etiqueta}</p>
    <p style="margin:4px 0 0;font-size:17px;font-weight:800;color:${color};">${valor}</p>
  </div>`;
}

export async function generateCorteCajaPDF(
  data: CorteCajaPdfData,
  empresaNombre: string,
  ubicacionNombre: string | undefined,
): Promise<void> {
  const periodo = data.desde === data.hasta ? data.desde : `${data.desde} al ${data.hasta}`;

  const porMetodo = Object.entries(data.por_metodo)
    .map(([m, r]) => [esc(metodoLabel(m)), String(r.count), fmt(r.total)]);
  const porEstatus = Object.entries(data.por_estatus)
    .map(([e, r]) => [esc(e), String(r.count), fmt(r.total)]);

  const pagosCredito = data.pagos_credito;
  const anticipos = data.anticipos_pedido;
  const administrativos = data.pagos_administrativos;

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8">
<style>*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;}</style>
</head>
<body style="margin:0;background:#fff;">
<div class="page" style="width:880px;padding:32px;background:#fff;">
  <div style="text-align:center;margin-bottom:16px;">
    <p style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">${esc(empresaNombre)}</p>
    ${ubicacionNombre ? `<p style="margin:2px 0 0;font-size:12px;color:#475569;">${esc(ubicacionNombre)}</p>` : ''}
    <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#0f172a;">Corte de caja</p>
    <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">${esc(String(periodo))}</p>
  </div>

  <div style="display:flex;gap:10px;">
    ${tarjeta('Total de ventas', fmt(data.total_ventas ?? data.total_cobrado))}
    ${tarjeta('Total cobrado', fmt(data.total_cobrado))}
    ${tarjeta('Gastos', fmt(data.total_gastos), '#dc2626')}
    ${tarjeta('Neto', fmt(data.total_neto), '#059669')}
    ${tarjeta('A entregar (efectivo)', fmt(data.total_entregar_efectivo), '#059669')}
  </div>

  ${titulo('Por método de pago (sin incluir pagos de crédito)')}
  ${tabla([{ t: 'Método' }, { t: 'Cobros', right: true }, { t: 'Total', right: true }], porMetodo)}

  ${titulo('Por estatus')}
  ${tabla([{ t: 'Estatus' }, { t: 'Notas', right: true }, { t: 'Total', right: true }], porEstatus)}

  ${pagosCredito && pagosCredito.detalle.length > 0 ? `
    ${titulo('Pagos de crédito')}
    ${tabla(
      [{ t: 'Folio' }, { t: 'Método' }, { t: 'Monto', right: true }, { t: 'Cambio', right: true }, { t: 'Total nota', right: true }],
      pagosCredito.detalle.map((p) => [folio(p.folio), esc(metodoLabel(p.metodo)), fmt(p.monto), p.cambio > 0 ? fmt(p.cambio) : '—', fmt(p.total)]),
      { colspan: 4, label: 'TOTAL PAGOS DE CRÉDITO', valor: fmt(pagosCredito.total) },
    )}` : ''}

  ${anticipos && anticipos.detalle.length > 0 ? `
    ${titulo('Anticipos de pedidos')}
    ${tabla(
      [{ t: 'Pedido' }, { t: 'Cliente' }, { t: 'Método' }, { t: 'Monto', right: true }],
      anticipos.detalle.map((a) => [folio(a.pedido_folio), esc(a.cliente), esc(metodoLabel(a.metodo)), fmt(a.monto)]),
      { colspan: 3, label: 'TOTAL ANTICIPOS', valor: fmt(anticipos.total) },
    )}` : ''}

  ${administrativos && administrativos.detalle.length > 0 ? `
    ${titulo('Pagos administrativos (no cuentan como efectivo a entregar)')}
    ${tabla(
      [{ t: 'Folio' }, { t: 'Lo recibió' }, { t: 'Monto', right: true }],
      administrativos.detalle.map((p) => [folio(p.folio), esc(p.referencia ?? '—'), fmt(p.monto)]),
      { colspan: 2, label: 'TOTAL ADMINISTRATIVO', valor: fmt(administrativos.total) },
    )}` : ''}

  ${data.gastos.length > 0 ? `
    ${titulo('Gastos del período')}
    ${tabla(
      [{ t: 'Concepto' }, { t: 'Categoría' }, { t: 'Método' }, { t: 'Usuario' }, { t: 'Monto', right: true }],
      data.gastos.map((g) => [esc(g.concepto), esc(g.categoria), esc(metodoLabel(g.metodo_pago)), esc(g.usuario), `− ${fmt(g.monto)}`]),
      { colspan: 4, label: 'TOTAL GASTOS', valor: fmt(data.total_gastos) },
    )}` : ''}

  ${titulo('Detalle de notas')}
  ${data.notas.length === 0
    ? '<p style="font-size:11px;color:#94a3b8;">Sin notas en el rango seleccionado</p>'
    : tabla(
      [{ t: 'Folio' }, { t: 'Hora' }, { t: 'Cliente' }, { t: 'Estatus' }, { t: 'Métodos' }, { t: 'Cambio', right: true }, { t: 'Total', right: true }],
      data.notas.map((n) => [
        folio(n.folio),
        hora(n.created_at),
        esc(n.cliente.nombre),
        esc(n.estatus),
        esc(n.pagos.filter((p) => p.monto > 0 || p.metodo === 'CANCELADA')
          .map((p) => (p.monto > 0 ? `${metodoLabel(p.metodo)} ${fmt(p.monto)}` : metodoLabel(p.metodo))).join(', ') || '—'),
        n.cambio > 0 ? fmt(n.cambio) : '—',
        fmt(n.total),
      ]),
      { colspan: 6, label: 'TOTAL COBRADO', valor: fmt(data.total_cobrado) },
    )}
</div>
</body></html>`;

  const sufijo = data.desde === data.hasta ? `${data.desde}` : `${data.desde}_a_${data.hasta}`;
  const filename = sanitizeFilename(`Corte-de-caja_${sufijo}`) + '.pdf';
  await downloadHtmlAsPdf(html, '.page', filename);
}
