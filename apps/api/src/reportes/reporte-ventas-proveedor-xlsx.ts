import ExcelJS from 'exceljs';
import type { ReportesService } from './reportes.service';

type ReporteVentasProveedor = Awaited<ReturnType<ReportesService['getReporteVentasProveedor']>>;

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true };
const MONEY_FORMAT = '$#,##0.00';

// Excel no permite '\ / ? * [ ]' en nombres de hoja, y limita a 31 caracteres.
function sheetName(nombre: string): string {
  return nombre.replace(/[\\/?*[\]]/g, ' ').slice(0, 31) || 'Proveedor';
}

function addProductosSheet(wb: ExcelJS.Workbook, nombre: string, productos: ReporteVentasProveedor['general']) {
  const sheet = wb.addWorksheet(sheetName(nombre));
  sheet.columns = [
    { header: 'Producto', key: 'producto', width: 45 },
    { header: 'Piezas Vendidas', key: 'cantidad', width: 18 },
    { header: 'Total Dinero', key: 'total', width: 18 },
  ];
  sheet.getRow(1).eachCell((cell) => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT; });
  for (const p of productos) {
    sheet.addRow({ producto: p.producto, cantidad: p.cantidad, total: p.total });
  }
  sheet.getColumn('total').numFmt = MONEY_FORMAT;
  const totalRow = sheet.addRow({
    producto: 'TOTAL',
    cantidad: productos.reduce((s, p) => s + p.cantidad, 0),
    total: productos.reduce((s, p) => s + p.total, 0),
  });
  totalRow.font = { bold: true };
}

export function buildVentasProveedorWorkbook(data: ReporteVentasProveedor): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GrupoMetalicoEMF ERP';
  wb.created = new Date();

  addProductosSheet(wb, 'GENERAL', data.general);
  for (const grupo of data.por_proveedor) {
    addProductosSheet(wb, grupo.proveedor, grupo.productos);
  }

  const clientesSheet = wb.addWorksheet(sheetName('Clientes'));
  clientesSheet.columns = [
    { header: 'Cliente', key: 'cliente', width: 40 },
    { header: 'Notas', key: 'notas', width: 12 },
    { header: 'Total Ventas', key: 'total', width: 18 },
  ];
  clientesSheet.getRow(1).eachCell((cell) => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT; });
  for (const c of data.clientes) clientesSheet.addRow(c);
  clientesSheet.getColumn('total').numFmt = MONEY_FORMAT;

  const notasSheet = wb.addWorksheet(sheetName('Notas'));
  notasSheet.columns = [
    { header: 'Nota', key: 'folio', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 40 },
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Estado de la Venta', key: 'estatus', width: 18 },
    { header: 'Tipo de Pago', key: 'tipo_pago', width: 16 },
    { header: 'Resta', key: 'resta', width: 14 },
  ];
  notasSheet.getRow(1).eachCell((cell) => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT; });
  for (const n of data.notas) {
    notasSheet.addRow({
      folio: `N${String(n.folio).padStart(4, '0')}`,
      cliente: n.cliente,
      fecha: new Date(n.fecha).toLocaleDateString('es-MX'),
      total: n.total,
      estatus: n.estatus,
      tipo_pago: n.tipo_pago,
      resta: n.resta,
    });
  }
  notasSheet.getColumn('total').numFmt = MONEY_FORMAT;
  notasSheet.getColumn('resta').numFmt = MONEY_FORMAT;

  return wb;
}
