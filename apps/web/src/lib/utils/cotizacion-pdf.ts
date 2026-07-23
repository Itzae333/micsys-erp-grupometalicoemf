import { getTicketLogoUrl } from './ticket-logo';
import { resolveLogoUrl } from '@/components/brand/Logo';
import { downloadHtmlAsPdf, sanitizeFilename } from './pdf-from-html';
import type { NotaCotizacion } from '@/lib/types/api';

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

function fmt(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generateCotizacionPDF(
  nota: NotaCotizacion,
  empresa: EmpresaPDF | null,
  ubicacion: UbicacionPDF | null,
): Promise<void> {
  const folioStr = `#${String(nota.folio).padStart(4, '0')}`;
  const fechaStr = new Date(nota.created_at).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const vigenciaStr = new Date(nota.vigencia_hasta).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  // Logo: ubicacion primero, luego empresa
  const rawLogo = getTicketLogoUrl(empresa, ubicacion);
  const logoUrl  = rawLogo ? resolveLogoUrl(rawLogo) : null;
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" style="max-height:80px;max-width:200px;object-fit:contain;display:block;">`
    : '';

  const razonSocial = ubicacion?.razon_social ?? empresa?.razon_social ?? empresa?.nombre ?? '';

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

  const usuarioNombre = nota.usuario
    ? `${nota.usuario.nombre}${nota.usuario.apellidos ? ' ' + nota.usuario.apellidos : ''}`
    : null;

  // Columna de descuento solo si al menos una línea lo tiene
  const hasDesc = nota.lineas.some((l) => Number(l.descuento) > 0);

  const lineasHTML = nota.lineas.map((l, idx) => {
    const desc = [
      l.articulo?.descripcion_1, l.articulo?.descripcion_2,
      l.articulo?.descripcion_3, l.articulo?.descripcion_4, l.articulo?.descripcion_5,
    ].filter(Boolean).join(' · ');
    const bg = idx % 2 === 1 ? 'background:#f8fafc;' : '';
    return `<tr>
      <td style="padding:9px 6px;text-align:center;font-size:11px;color:#94a3b8;${bg}">${idx + 1}</td>
      <td style="padding:9px 6px;font-size:12px;color:#475569;${bg}">${desc || '—'}</td>
      <td style="padding:9px 6px;text-align:right;font-size:12px;${bg}">${Number(l.cantidad).toLocaleString('es-MX')}</td>
      <td style="padding:9px 6px;text-align:right;font-size:12px;${bg}">$${fmt(Number(l.precio_unitario))}</td>
      ${hasDesc ? `<td style="padding:9px 6px;text-align:center;font-size:11px;color:#64748b;${bg}">${Number(l.descuento) > 0 ? Number(l.descuento).toFixed(0) + '%' : '—'}</td>` : ''}
      <td style="padding:9px 6px;text-align:right;font-size:13px;font-weight:700;color:#0f172a;${bg}">$${fmt(Number(l.subtotal))}</td>
    </tr>`;
  }).join('');

  const subtotalFmt = fmt(Number(nota.subtotal));
  const totalFmt    = fmt(Number(nota.total));
  const descRow = Number(nota.descuento) > 0
    ? `<div class="total-line" style="color:#dc2626"><span>Descuento</span><span>-$${fmt(Number(nota.descuento))}</span></div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Cotización ${folioStr}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:860px;background:#fff;overflow:hidden}
  /* Header */
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding:28px 36px 22px;border-bottom:1px solid #e2e8f0;gap:24px}
  .header-left{flex:1}
  .emp-nombre{font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#0f172a;margin-top:10px}
  .emp-sub{font-size:11px;color:#64748b;margin-top:4px;line-height:1.6}
  .header-right{text-align:right;flex-shrink:0}
  .badge{display:inline-block;background:#2563eb;color:#fff;padding:4px 14px;font-size:9px;font-weight:700;letter-spacing:2.5px;border-radius:20px;text-transform:uppercase;margin-bottom:8px}
  .folio{font-size:30px;font-weight:900;color:#0f172a;letter-spacing:-1px;line-height:1}
  .folio-meta{font-size:11px;color:#64748b;margin-top:5px;line-height:1.7}
  .folio-valida{color:#2563eb;font-weight:600}
  /* Cajas de info */
  .info-row{display:flex;border-bottom:1px solid #e2e8f0}
  .info-box{flex:1;padding:14px 36px;border-right:1px solid #e2e8f0}
  .info-box:last-child{border-right:none}
  .info-tag{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:5px}
  .info-val{font-size:13px;font-weight:700;color:#0f172a}
  .info-val2{font-size:11px;color:#64748b;margin-top:2px}
  /* Tabla */
  .tbl-wrap{padding:22px 36px 16px}
  table{width:100%;border-collapse:collapse}
  thead th{background:#0f172a;padding:10px 7px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#e2e8f0;text-align:left}
  thead th.r{text-align:right} thead th.c{text-align:center}
  tbody tr:last-child td{border-bottom:2px solid #e2e8f0}
  /* Totales */
  .totals{padding:0 36px 20px;display:flex;justify-content:flex-end}
  .totals-inner{min-width:270px}
  .total-line{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#475569;border-bottom:1px solid #f1f5f9}
  .total-grand{display:flex;justify-content:space-between;padding:12px 0 0;font-size:20px;font-weight:900;color:#0f172a;border-top:2px solid #0f172a;margin-top:4px}
  /* Obs */
  .obs{margin:0 36px 18px;background:#f0f9ff;border-left:3px solid #2563eb;padding:10px 14px;font-size:12px;color:#475569;border-radius:0 4px 4px 0}
  .obs strong{color:#0f172a}
  /* Footer */
  .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 36px;text-align:center;font-size:11px;color:#94a3b8;line-height:1.8}
</style>
</head>
<body>
<div class="page">

  <!-- Encabezado empresa + número de cotización -->
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <div class="emp-nombre">${razonSocial}</div>
      ${infoLineas.length > 0 ? `<div class="emp-sub">${infoLineas.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>` : ''}
      ${direccion ? `<div class="emp-sub">${direccion}</div>` : ''}
    </div>
    <div class="header-right">
      <div><span class="badge">Cotización</span></div>
      <div class="folio">${folioStr}</div>
      <div class="folio-meta">
        Fecha:&nbsp;<strong>${fechaStr}</strong><br>
        <span class="folio-valida">Válida hasta el ${vigenciaStr}</span>
      </div>
    </div>
  </div>

  <!-- Cliente + Preparada por -->
  <div class="info-row">
    <div class="info-box">
      <div class="info-tag">Cliente</div>
      <div class="info-val">${clienteNombre}</div>
      ${nota.cliente?.email ? `<div class="info-val2">${nota.cliente.email}</div>` : ''}
    </div>
    ${usuarioNombre || ubicacion?.nombre ? `
    <div class="info-box">
      <div class="info-tag">Preparada por</div>
      ${usuarioNombre ? `<div class="info-val">${usuarioNombre}</div>` : ''}
      ${ubicacion?.nombre ? `<div class="info-val2">${ubicacion.nombre}</div>` : ''}
    </div>` : ''}
  </div>

  <!-- Tabla de artículos -->
  <div class="tbl-wrap">
    <table>
      <thead>
        <tr>
          <th class="c" style="width:30px">#</th>
          <th>Descripción</th>
          <th class="r" style="width:55px">Cant.</th>
          <th class="r" style="width:90px">Precio unit.</th>
          ${hasDesc ? '<th class="c" style="width:50px">Desc.</th>' : ''}
          <th class="r" style="width:92px">Subtotal</th>
        </tr>
      </thead>
      <tbody>${lineasHTML}</tbody>
    </table>
  </div>

  <!-- Totales -->
  <div class="totals">
    <div class="totals-inner">
      <div class="total-line"><span>Subtotal</span><span>$${subtotalFmt}</span></div>
      ${descRow}
      <div class="total-grand"><span>Total</span><span>$${totalFmt}</span></div>
    </div>
  </div>

  ${nota.observaciones ? `<div class="obs"><strong>Observaciones:</strong>&nbsp;${nota.observaciones}</div>` : ''}

  <div class="footer">
    <p>Esta cotización es válida hasta el ${vigenciaStr}.</p>
    <p>Precios sujetos a cambio sin previo aviso &nbsp;·&nbsp; ¡Gracias por su preferencia!</p>
  </div>

</div>
</body>
</html>`;

  const fechaArchivo = new Date(nota.created_at)
    .toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '-');
  const filename = sanitizeFilename(`Cotizaciones-${clienteNombre}-${fechaArchivo}`) + '.pdf';

  await downloadHtmlAsPdf(html, '.page', filename);
}
