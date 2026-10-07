import ExcelJS from 'exceljs';
import type { VentasService } from './ventas.service';

type CorteCaja = Awaited<ReturnType<VentasService['getCorteCaja']>>;

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true };
const MONEY_FORMAT = '$#,##0.00';

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
  ADMINISTRATIVO: 'Administrativo', CANCELADA: 'Cancelada',
};
const metodoLabel = (m: string) => METODO_LABEL[m] ?? m;

const folioTxt = (n: number) => `#${String(n).padStart(4, '0')}`;
const fechaHora = (d: Date | string) =>
  new Date(d).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' });

function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).eachCell((cell) => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT; });
}

export interface CorteCajaXlsxMeta {
  empresa?: string;
  ubicacion?: string;
}

export function buildCorteCajaWorkbook(data: CorteCaja, meta: CorteCajaXlsxMeta = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GrupoMetalicoEMF ERP';
  wb.created = new Date();

  // ── Resumen ─────────────────────────────────────────────────
  const resumen = wb.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Concepto', key: 'concepto', width: 38 },
    { header: 'Cobros', key: 'count', width: 10 },
    { header: 'Total', key: 'total', width: 18 },
  ];
  styleHeader(resumen);

  const periodo = data.desde === data.hasta ? `${data.desde}` : `${data.desde} al ${data.hasta}`;
  const encabezado = [meta.empresa, meta.ubicacion].filter(Boolean).join(' · ');
  if (encabezado) resumen.addRow({ concepto: encabezado });
  resumen.addRow({ concepto: `Período: ${periodo}` });
  resumen.addRow({});

  const seccion = (titulo: string) => {
    const row = resumen.addRow({ concepto: titulo });
    row.font = { bold: true };
    row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; });
  };
  const linea = (concepto: string, total: number, count?: number, bold = false) => {
    const row = resumen.addRow({ concepto, count, total });
    if (bold) row.font = { bold: true };
  };

  seccion('Totales');
  linea('Total de ventas', data.total_ventas ?? data.total_cobrado);
  linea('Total cobrado', data.total_cobrado);
  linea('Total gastos', data.total_gastos);
  linea('Total neto (tras gastos)', data.total_neto, undefined, true);
  linea('Total a entregar en efectivo', data.total_entregar_efectivo, undefined, true);

  resumen.addRow({});
  seccion('Por método de pago (sin incluir pagos de crédito)');
  for (const [m, r] of Object.entries(data.por_metodo)) linea(metodoLabel(m), r.total, r.count);

  resumen.addRow({});
  seccion('Por estatus');
  for (const [est, r] of Object.entries(data.por_estatus)) linea(est, r.total, r.count);

  if (data.pagos_credito?.count > 0) {
    resumen.addRow({});
    seccion('Pagos de crédito');
    for (const [m, r] of Object.entries(data.pagos_credito.por_metodo)) {
      if (r.count > 0) linea(metodoLabel(m), r.total, r.count);
    }
    linea('Total pagos de crédito', data.pagos_credito.total, data.pagos_credito.count, true);
  }
  if (data.anticipos_pedido?.count > 0) {
    resumen.addRow({});
    seccion('Anticipos de pedidos');
    for (const [m, r] of Object.entries(data.anticipos_pedido.por_metodo)) {
      if (r.count > 0) linea(metodoLabel(m), r.total, r.count);
    }
    linea('Total anticipos', data.anticipos_pedido.total, data.anticipos_pedido.count, true);
  }
  if (data.pagos_administrativos?.count > 0) {
    resumen.addRow({});
    seccion('Pagos administrativos (no cuentan como efectivo a entregar)');
    linea('Total administrativo', data.pagos_administrativos.total, data.pagos_administrativos.count, true);
  }
  resumen.getColumn('total').numFmt = MONEY_FORMAT;

  // ── Notas ───────────────────────────────────────────────────
  const notas = wb.addWorksheet('Notas');
  notas.columns = [
    { header: 'Folio', key: 'folio', width: 10 },
    { header: 'Fecha y hora', key: 'fecha', width: 18 },
    { header: 'Cliente', key: 'cliente', width: 36 },
    { header: 'Estatus', key: 'estatus', width: 14 },
    { header: 'Métodos de pago', key: 'metodos', width: 38 },
    { header: 'Cambio', key: 'cambio', width: 14 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Pedido de origen', key: 'pedido', width: 16 },
  ];
  styleHeader(notas);
  for (const n of data.notas) {
    notas.addRow({
      folio: folioTxt(n.folio),
      fecha: fechaHora(n.created_at),
      cliente: n.cliente.nombre,
      estatus: n.estatus,
      metodos: n.pagos
        .filter((p) => p.monto > 0 || p.metodo === 'CANCELADA')
        .map((p) => (p.monto > 0 ? `${metodoLabel(p.metodo)} $${p.monto.toFixed(2)}` : metodoLabel(p.metodo)))
        .join(', '),
      cambio: n.cambio,
      total: n.total,
      pedido: n.pedido_origen ? folioTxt(n.pedido_origen.folio) : '',
    });
  }
  notas.getColumn('cambio').numFmt = MONEY_FORMAT;
  notas.getColumn('total').numFmt = MONEY_FORMAT;
  if (data.notas.length > 0) {
    const totalRow = notas.addRow({ cliente: 'TOTAL COBRADO', total: data.total_cobrado });
    totalRow.font = { bold: true };
  }

  // ── Gastos ──────────────────────────────────────────────────
  if (data.gastos.length > 0) {
    const gastos = wb.addWorksheet('Gastos');
    gastos.columns = [
      { header: 'Fecha y hora', key: 'fecha', width: 18 },
      { header: 'Concepto', key: 'concepto', width: 40 },
      { header: 'Categoría', key: 'categoria', width: 30 },
      { header: 'Método', key: 'metodo', width: 16 },
      { header: 'Usuario', key: 'usuario', width: 24 },
      { header: 'Monto', key: 'monto', width: 16 },
    ];
    styleHeader(gastos);
    for (const g of data.gastos) {
      gastos.addRow({
        fecha: fechaHora(g.created_at),
        concepto: g.concepto,
        categoria: g.categoria,
        metodo: metodoLabel(g.metodo_pago),
        usuario: g.usuario,
        monto: g.monto,
      });
    }
    gastos.getColumn('monto').numFmt = MONEY_FORMAT;
    gastos.addRow({ usuario: 'TOTAL GASTOS', monto: data.total_gastos }).font = { bold: true };
  }

  // ── Pagos de crédito ────────────────────────────────────────
  if (data.pagos_credito?.detalle.length > 0) {
    const pc = wb.addWorksheet('Pagos de crédito');
    pc.columns = [
      { header: 'Folio', key: 'folio', width: 10 },
      { header: 'Fecha y hora', key: 'fecha', width: 18 },
      { header: 'Método', key: 'metodo', width: 16 },
      { header: 'Monto', key: 'monto', width: 16 },
      { header: 'Cambio', key: 'cambio', width: 14 },
      { header: 'Total de la nota', key: 'total', width: 18 },
    ];
    styleHeader(pc);
    for (const p of data.pagos_credito.detalle) {
      pc.addRow({
        folio: folioTxt(p.folio),
        fecha: fechaHora(p.fecha),
        metodo: metodoLabel(p.metodo),
        monto: p.monto,
        cambio: p.cambio,
        total: p.total,
      });
    }
    ['monto', 'cambio', 'total'].forEach((k) => { pc.getColumn(k).numFmt = MONEY_FORMAT; });
  }

  // ── Anticipos de pedidos ────────────────────────────────────
  if (data.anticipos_pedido?.detalle.length > 0) {
    const an = wb.addWorksheet('Anticipos');
    an.columns = [
      { header: 'Pedido', key: 'pedido', width: 10 },
      { header: 'Fecha y hora', key: 'fecha', width: 18 },
      { header: 'Cliente', key: 'cliente', width: 36 },
      { header: 'Método', key: 'metodo', width: 16 },
      { header: 'Referencia', key: 'referencia', width: 24 },
      { header: 'Monto', key: 'monto', width: 16 },
    ];
    styleHeader(an);
    for (const a of data.anticipos_pedido.detalle) {
      an.addRow({
        pedido: folioTxt(a.pedido_folio),
        fecha: fechaHora(a.fecha),
        cliente: a.cliente,
        metodo: metodoLabel(a.metodo),
        referencia: a.referencia ?? '',
        monto: a.monto,
      });
    }
    an.getColumn('monto').numFmt = MONEY_FORMAT;
  }

  // ── Pagos administrativos ───────────────────────────────────
  if (data.pagos_administrativos?.detalle.length > 0) {
    const ad = wb.addWorksheet('Administrativos');
    ad.columns = [
      { header: 'Folio', key: 'folio', width: 10 },
      { header: 'Fecha y hora', key: 'fecha', width: 18 },
      { header: 'Lo recibió', key: 'referencia', width: 30 },
      { header: 'Monto', key: 'monto', width: 16 },
    ];
    styleHeader(ad);
    for (const p of data.pagos_administrativos.detalle) {
      ad.addRow({ folio: folioTxt(p.folio), fecha: fechaHora(p.fecha), referencia: p.referencia ?? '', monto: p.monto });
    }
    ad.getColumn('monto').numFmt = MONEY_FORMAT;
  }

  return wb;
}
