import { getTicketLogoUrl } from './ticket-logo';
import { resolveLogoUrl } from '@/components/brand/Logo';
import { downloadHtmlAsPdf, sanitizeFilename } from './pdf-from-html';
import type { MovimientoCuenta } from '@/lib/types/api';

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

interface ClientePDF {
  nombre: string;
  telefono?: string | null;
  saldo_pendiente: number;
  saldo_ventas_credito?: number;
  saldo_otras_deudas?: number;
}

const TIPO_LABEL: Record<MovimientoCuenta['tipo'], string> = {
  CARGO: 'Cargo',
  ABONO: 'Abono',
  AJUSTE: 'Ajuste',
};

function fmt(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Descarga el estado de cuenta del cliente: todos los movimientos (ventas a
// crédito y otras deudas, cargos y abonos) en un solo documento.
export async function generateEstadoCuentaPDF(
  cliente: ClientePDF,
  movimientos: MovimientoCuenta[],
  empresa: EmpresaPDF | null,
  ubicacion: UbicacionPDF | null,
): Promise<void> {
  const fechaStr = new Date().toLocaleDateString('es-MX', {
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

  // Los movimientos vienen más reciente primero (mismo orden que el historial
  // en pantalla) — para el estado de cuenta se leen mejor del más viejo al más
  // nuevo, como un extracto.
  const movimientosAsc = [...movimientos].reverse();

  const filasHTML = movimientosAsc.map((m, idx) => {
    const fecha = new Date(m.created_at).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    const esCargo = m.tipo === 'CARGO' || m.tipo === 'AJUSTE';
    const signo = m.tipo === 'ABONO' ? '−' : '+';
    const montoColor = m.tipo === 'ABONO' ? '#16a34a' : '#0f172a';
    const conceptoTxt = m.nota ? `${m.concepto} · Nota #${String(m.nota.folio).padStart(4, '0')}` : m.concepto;
    const bg = idx % 2 === 1 ? 'background:#f8fafc;' : '';
    return `<tr>
      <td style="padding:8px;font-size:11px;color:#64748b;white-space:nowrap;${bg}">${fecha}</td>
      <td style="padding:8px;font-size:11px;color:#0f172a;${bg}">${TIPO_LABEL[m.tipo] ?? m.tipo}</td>
      <td style="padding:8px;font-size:11px;color:#475569;${bg}">${conceptoTxt}</td>
      <td style="padding:8px;text-align:right;font-size:12px;font-weight:700;color:${montoColor};${bg}">${signo}$${fmt(Number(m.monto))}</td>
      <td style="padding:8px;text-align:right;font-size:11px;color:#64748b;${bg}">$${fmt(Number(m.saldo_despues))}</td>
    </tr>`;
  }).join('');

  const mostrarDesglose = cliente.saldo_ventas_credito != null && cliente.saldo_otras_deudas != null;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Estado de cuenta — ${cliente.nombre}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a;background:#fff}
  .page{width:760px;background:#fff;overflow:hidden;border-radius:10px}
  .header{background:#0f172a;padding:28px 36px;text-align:center}
  .emp-nombre{margin:0;color:#f1f5f9;font-size:18px;font-weight:800;letter-spacing:1px}
  .emp-sub{margin:5px 0 0;color:#94a3b8;font-size:11px}
  .emp-sub2{margin:6px 0 0;color:#64748b;font-size:11px}
  .badge-row{background:#334155;padding:11px 36px;display:flex;justify-content:space-between;align-items:center}
  .badge-label{color:#fff;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase}
  .badge-fecha{color:#fff;font-size:11px;opacity:.85}
  .cliente-box{margin:16px 36px 0;background:#f0f9ff;border-left:3px solid #334155;border-radius:0 4px 4px 0;padding:10px 14px}
  .cliente-tag{margin:0;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8}
  .cliente-val{margin:4px 0 0;font-size:14px;font-weight:700;color:#0f172a}
  .saldos{display:flex;gap:12px;margin:16px 36px 0}
  .saldo-card{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px}
  .saldo-tag{margin:0;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#94a3b8}
  .saldo-val{margin:4px 0 0;font-size:16px;font-weight:800;color:#0f172a}
  .tbl-wrap{padding:18px 36px 0}
  table{width:100%;border-collapse:collapse}
  thead th{background:#0f172a;padding:9px 8px;text-align:left;font-size:9px;color:#e2e8f0;font-weight:700;letter-spacing:1px;text-transform:uppercase}
  thead th.r{text-align:right}
  tbody td{border-bottom:1px solid #f1f5f9}
  tfoot{border-top:2px solid #e2e8f0}
  .total-row td{padding:12px 8px;text-align:right;color:#ffffff;font-weight:900;font-size:16px;background:#0f172a}
  .total-row td:first-child{font-weight:700;font-size:13px;letter-spacing:.5px;color:#f8fafc}
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
  </div>

  <div class="badge-row">
    <span class="badge-label">Estado de cuenta</span>
    <span class="badge-fecha">Generado: ${fechaStr}</span>
  </div>

  <div class="cliente-box">
    <p class="cliente-tag">Cliente</p>
    <p class="cliente-val">${cliente.nombre}</p>
  </div>

  <div class="saldos">
    ${mostrarDesglose ? `
    <div class="saldo-card">
      <p class="saldo-tag">Ventas a crédito</p>
      <p class="saldo-val">$${fmt(cliente.saldo_ventas_credito ?? 0)}</p>
    </div>
    <div class="saldo-card">
      <p class="saldo-tag">Otras deudas</p>
      <p class="saldo-val">$${fmt(cliente.saldo_otras_deudas ?? 0)}</p>
    </div>` : ''}
    <div class="saldo-card">
      <p class="saldo-tag">Saldo total</p>
      <p class="saldo-val">$${fmt(cliente.saldo_pendiente)}</p>
    </div>
  </div>

  <div class="tbl-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:80px">Fecha</th>
          <th style="width:70px">Tipo</th>
          <th>Concepto</th>
          <th class="r" style="width:90px">Monto</th>
          <th class="r" style="width:90px">Saldo</th>
        </tr>
      </thead>
      <tbody>${filasHTML || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#94a3b8;font-size:12px;">Sin movimientos registrados</td></tr>'}</tbody>
      <tfoot>
        <tr class="total-row"><td colspan="4">SALDO ACTUAL</td><td>$${fmt(cliente.saldo_pendiente)}</td></tr>
      </tfoot>
    </table>
  </div>

  <div class="footer">
    <p>Este documento es un resumen informativo de los movimientos de la cuenta.</p>
  </div>
</div>
</body>
</html>`;

  const fechaArchivo = new Date()
    .toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '-');
  const filename = sanitizeFilename(`Estado-cuenta-${cliente.nombre}-${fechaArchivo}`) + '.pdf';

  await downloadHtmlAsPdf(html, '.page', filename);
}
