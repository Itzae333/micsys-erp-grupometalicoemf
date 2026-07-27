import { getTicketLogoUrl } from './ticket-logo';
import { resolveLogoUrl } from '@/components/brand/Logo';
import { downloadHtmlAsPdf, sanitizeFilename } from './pdf-from-html';
import type { NotaVenta } from '@/lib/types/api';

interface EmpresaPDF {
  nombre: string;
  razon_social?: string | null;
  rfc?: string | null;
  logo_url?: string | null;
}

interface UbicacionPDF {
  nombre?: string | null;
  razon_social?: string | null;
  rfc?: string | null;
  telefono?: string | null;
  calle?: string | null;
  num_ext?: string | null;
  num_int?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  estado?: string | null;
  cp?: string | null;
  logo_url?: string | null;
}

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
};

function fmt(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Descarga el comprobante de venta (misma apariencia que el correo enviado al cliente)
export async function generateComprobantePDF(
  nota: NotaVenta,
  empresa: EmpresaPDF | null,
  ubicacion: UbicacionPDF | null,
  sinPrecios = false,
): Promise<void> {
  const folioStr = `#${String(nota.folio).padStart(4, '0')}`;
  const fechaStr = new Date(nota.created_at).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const rawLogo = getTicketLogoUrl(empresa, ubicacion);
  const logoUrl  = rawLogo ? resolveLogoUrl(rawLogo) : null;
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" style="max-height:70px;max-width:180px;object-fit:contain;display:block;margin:0 auto 10px;">`
    : '';

  const razonSocial = (ubicacion?.razon_social ?? empresa?.razon_social ?? empresa?.nombre ?? '').toUpperCase();

  const infoLineas: string[] = [];
  const rfc = ubicacion?.rfc ?? empresa?.rfc;
  if (rfc) infoLineas.push(`RFC: ${rfc}`);
  if (ubicacion?.telefono) infoLineas.push(`Tel: ${ubicacion.telefono}`);

  const addrParts = [
    ubicacion?.calle
      ? `${ubicacion.calle}${ubicacion.num_ext ? ' #' + ubicacion.num_ext : ''}${ubicacion.num_int ? ' Int.' + ubicacion.num_int : ''}`
      : null,
    ubicacion?.colonia,
    ubicacion?.municipio,
    ubicacion?.estado
      ? `${ubicacion.estado}${ubicacion.cp ? ' C.P. ' + ubicacion.cp : ''}`
      : ubicacion?.cp ? `C.P. ${ubicacion.cp}` : null,
  ].filter(Boolean);
  const direccion = addrParts.join(', ');

  const clienteNombre = nota.cliente
    ? (nota.cliente.razon_social ?? `${nota.cliente.nombre}${nota.cliente.apellidos ? ' ' + nota.cliente.apellidos : ''}`)
    : 'Público en general';

  const esCredito = nota.estatus === 'CREDITO';
  const accentColor = '#16a34a';

  const lineasHTML = nota.lineas.map((l, idx) => {
    const desc = [
      l.articulo?.descripcion_1, l.articulo?.descripcion_2,
      l.articulo?.descripcion_3, l.articulo?.descripcion_4, l.articulo?.descripcion_5,
    ].filter(Boolean).join(' · ');
    const bg = idx % 2 === 1 ? 'background:#f8fafc;' : '';
    const precioCeldas = sinPrecios ? '' : `
      <td style="padding:9px 8px;text-align:right;font-size:12px;color:#0f172a;${bg}">$${fmt(Number(l.precio_unitario))}</td>
      <td style="padding:9px 8px;text-align:right;font-size:13px;font-weight:700;color:#0f172a;${bg}">$${fmt(Number(l.subtotal))}</td>`;
    return `<tr>
      <td style="padding:9px 8px;font-size:12px;color:#475569;${bg}">${desc || l.clave}</td>
      <td style="padding:9px 8px;text-align:right;font-size:12px;color:#0f172a;${bg}">${Number(l.cantidad).toLocaleString('es-MX')}</td>${precioCeldas}
    </tr>`;
  }).join('');

  // Se omiten por completo si sinPrecios (nota de entrega sin valor fiscal)
  const subtotalRow = sinPrecios ? '' : `<tr><td colspan="3" style="padding:7px 8px;text-align:right;font-size:12px;color:#64748b;">Subtotal</td><td style="padding:7px 8px;text-align:right;font-size:12px;color:#64748b;">$${fmt(Number(nota.subtotal))}</td></tr>`;
  const descuentoRow = !sinPrecios && Number(nota.descuento) > 0
    ? `<tr><td colspan="3" style="padding:5px 8px;text-align:right;font-size:12px;color:#dc2626;">Descuento</td><td style="padding:5px 8px;text-align:right;font-size:12px;color:#dc2626;">-$${fmt(Number(nota.descuento))}</td></tr>`
    : '';

  const totalPagado = nota.pagos.reduce((s, p) => s + Number(p.monto), 0);
  const saldoPendiente = Math.max(0, +(Number(nota.total) - totalPagado).toFixed(2));

  const pagoRows = sinPrecios ? '' : nota.pagos.map((p) =>
    `<tr><td colspan="3" style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">${METODO_LABEL[p.metodo] ?? p.metodo}</td><td style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">$${fmt(Number(p.monto))}</td></tr>`,
  ).join('');
  const creditoRow = !sinPrecios && esCredito && saldoPendiente > 0
    ? `<tr><td colspan="3" style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">A crédito</td><td style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">$${fmt(saldoPendiente)}</td></tr>`
    : '';

  const totalRowHtml = sinPrecios ? '' : `<tr class="total-row"><td colspan="3">TOTAL</td><td>$${fmt(Number(nota.total))}</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comprobante ${folioStr}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a;background:#fff}
  .page{width:680px;background:#fff;overflow:hidden;border-radius:10px}
  .header{background:#0f172a;padding:28px 36px;text-align:center}
  .emp-nombre{margin:0;color:#f1f5f9;font-size:18px;font-weight:800;letter-spacing:1px}
  .emp-sub{margin:5px 0 0;color:#94a3b8;font-size:11px}
  .emp-sub2{margin:6px 0 0;color:#64748b;font-size:11px}
  .badge-row{background:${accentColor};padding:11px 36px;display:flex;justify-content:space-between;align-items:center}
  .badge-label{color:#fff;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase}
  .badge-fecha{color:#fff;font-size:11px;opacity:.85}
  .cliente-box{margin:16px 36px 0;background:#f0f9ff;border-left:3px solid ${accentColor};border-radius:0 4px 4px 0;padding:10px 14px}
  .cliente-tag{margin:0;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8}
  .cliente-val{margin:4px 0 0;font-size:14px;font-weight:700;color:#0f172a}
  .tbl-wrap{padding:18px 36px 0}
  table{width:100%;border-collapse:collapse}
  thead th{background:#0f172a;padding:9px 8px;text-align:left;font-size:9px;color:#e2e8f0;font-weight:700;letter-spacing:1px;text-transform:uppercase}
  thead th.r{text-align:right}
  tbody td{border-bottom:1px solid #f1f5f9}
  tfoot{border-top:2px solid #e2e8f0}
  .total-row td{padding:12px 8px;text-align:right;color:#ffffff;font-weight:900;font-size:18px;background:#0f172a}
  .total-row td:first-child{font-weight:700;font-size:14px;letter-spacing:.5px;color:#f8fafc}
  .obs{margin:14px 36px 0;background:#fefce8;border-left:3px solid #eab308;padding:10px 14px;border-radius:0 4px 4px 0;font-size:12px;color:#713f12}
  .footer{padding:20px 36px 26px;text-align:center;border-top:1px solid #e2e8f0;margin-top:16px}
  .footer p{margin:0;font-size:11px;color:#94a3b8}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    ${logoHtml}
    <p class="emp-nombre">${razonSocial}</p>
    ${ubicacion?.nombre ? `<p class="emp-sub">${ubicacion.nombre}</p>` : ''}
    ${infoLineas.length > 0 ? `<p class="emp-sub2">${infoLineas.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</p>` : ''}
    ${direccion ? `<p class="emp-sub2">${direccion}</p>` : ''}
  </div>

  <div class="badge-row">
    <span class="badge-label">${sinPrecios ? 'Nota de entrega — sin valor fiscal' : 'Comprobante de venta'}&nbsp;&nbsp;${folioStr}</span>
    <span class="badge-fecha">Fecha: ${fechaStr}</span>
  </div>

  ${nota.cliente ? `
  <div class="cliente-box">
    <p class="cliente-tag">Cliente</p>
    <p class="cliente-val">${clienteNombre}</p>
  </div>` : ''}

  <div class="tbl-wrap">
    <table>
      <thead>
        <tr>
          <th>Descripción</th>
          <th class="r" style="width:55px">Cant.</th>
          ${sinPrecios ? '' : `
          <th class="r" style="width:90px">P.U.</th>
          <th class="r" style="width:92px">Subtotal</th>`}
        </tr>
      </thead>
      <tbody>${lineasHTML}</tbody>
      <tfoot>
        ${subtotalRow}
        ${descuentoRow}
        ${pagoRows}
        ${creditoRow}
        ${totalRowHtml}
      </tfoot>
    </table>
  </div>

  ${nota.observaciones ? `<div class="obs"><strong>Observaciones:</strong>&nbsp;${nota.observaciones}</div>` : ''}

  <div class="footer">
    <p>¡Gracias por su preferencia!</p>
  </div>
</div>
</body>
</html>`;

  const fechaArchivo = new Date(nota.created_at)
    .toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '-');
  const filename = sanitizeFilename(`Comprobante-${clienteNombre}-${fechaArchivo}`) + '.pdf';

  await downloadHtmlAsPdf(html, '.page', filename);
}
