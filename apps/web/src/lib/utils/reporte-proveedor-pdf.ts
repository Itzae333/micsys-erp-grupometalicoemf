import { downloadHtmlAsPdf, sanitizeFilename } from './pdf-from-html';
import type { ReporteVentasProveedorData } from '@/lib/types/api';

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
};

function fmt(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tablaProductos(titulo: string, productos: ReporteVentasProveedorData['general']): string {
  const total = productos.reduce((s, p) => s + p.total, 0);
  const piezas = productos.reduce((s, p) => s + p.cantidad, 0);
  return `
    <h2 style="font-size:14px;font-weight:700;color:#0f172a;margin:24px 0 8px;">${titulo}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:#0f172a;">
          <th style="padding:6px 8px;text-align:left;color:#e2e8f0;">Producto</th>
          <th style="padding:6px 8px;text-align:right;color:#e2e8f0;">Piezas</th>
          <th style="padding:6px 8px;text-align:right;color:#e2e8f0;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${productos.map((p, i) => `
          <tr style="background:${i % 2 ? '#f8fafc' : '#ffffff'};">
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;color:#334155;">${p.producto}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right;color:#334155;">${p.cantidad}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right;color:#0f172a;font-weight:600;">$${fmt(p.total)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#e2e8f0;">
          <td style="padding:6px 8px;font-weight:700;color:#0f172a;">TOTAL</td>
          <td style="padding:6px 8px;text-align:right;font-weight:700;color:#0f172a;">${piezas}</td>
          <td style="padding:6px 8px;text-align:right;font-weight:700;color:#0f172a;">$${fmt(total)}</td>
        </tr>
      </tfoot>
    </table>`;
}

export async function generateReporteVentasProveedorPDF(
  data: ReporteVentasProveedorData,
  empresaNombre: string,
): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8">
<style>*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;}</style>
</head>
<body style="margin:0;background:#fff;">
<div class="page" style="width:880px;padding:32px;background:#fff;">
  <div style="text-align:center;margin-bottom:16px;">
    <p style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">${empresaNombre}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Reporte de ventas por proveedor</p>
    <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">${data.rango.desde} al ${data.rango.hasta}</p>
  </div>

  ${tablaProductos('GENERAL', data.general)}
  ${data.por_proveedor.map((g) => tablaProductos(`Proveedor: ${g.proveedor}`, g.productos)).join('')}

  <h2 style="font-size:14px;font-weight:700;color:#0f172a;margin:24px 0 8px;">Clientes</h2>
  <table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr style="background:#0f172a;">
        <th style="padding:6px 8px;text-align:left;color:#e2e8f0;">Cliente</th>
        <th style="padding:6px 8px;text-align:right;color:#e2e8f0;">Notas</th>
        <th style="padding:6px 8px;text-align:right;color:#e2e8f0;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${data.clientes.map((c, i) => `
        <tr style="background:${i % 2 ? '#f8fafc' : '#ffffff'};">
          <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;color:#334155;">${c.cliente}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right;color:#334155;">${c.notas}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right;color:#0f172a;font-weight:600;">$${fmt(c.total)}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <h2 style="font-size:14px;font-weight:700;color:#0f172a;margin:24px 0 8px;">Detalle de notas</h2>
  <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <thead>
      <tr style="background:#0f172a;">
        <th style="padding:5px 6px;text-align:left;color:#e2e8f0;">Nota</th>
        <th style="padding:5px 6px;text-align:left;color:#e2e8f0;">Cliente</th>
        <th style="padding:5px 6px;text-align:left;color:#e2e8f0;">Fecha</th>
        <th style="padding:5px 6px;text-align:right;color:#e2e8f0;">Total</th>
        <th style="padding:5px 6px;text-align:left;color:#e2e8f0;">Estado</th>
        <th style="padding:5px 6px;text-align:left;color:#e2e8f0;">Pago</th>
        <th style="padding:5px 6px;text-align:right;color:#e2e8f0;">Resta</th>
      </tr>
    </thead>
    <tbody>
      ${data.notas.map((n, i) => `
        <tr style="background:${i % 2 ? '#f8fafc' : '#ffffff'};">
          <td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">N${String(n.folio).padStart(4, '0')}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${n.cliente}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${new Date(n.fecha).toLocaleDateString('es-MX')}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;text-align:right;color:#0f172a;">$${fmt(n.total)}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${n.estatus}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${METODO_LABEL[n.tipo_pago] ?? n.tipo_pago}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;text-align:right;color:${n.resta > 0 ? '#dc2626' : '#334155'};">$${fmt(n.resta)}</td>
        </tr>`).join('')}
    </tbody>
  </table>
</div>
</body></html>`;

  const filename = sanitizeFilename(`Reporte-Ventas-Proveedor_${data.rango.desde}_a_${data.rango.hasta}`) + '.pdf';
  await downloadHtmlAsPdf(html, '.page', filename);
}
