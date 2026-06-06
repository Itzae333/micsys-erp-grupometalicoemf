'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, ChevronLeft, ChevronRight, Receipt, Users, FileText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import type { NotasVentaPage, NotaVenta, Cliente, Articulo, ArticulosPage, ConfigColumnasSchema } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ── Estatus ──────────────────────────────────────────────────
const ESTATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'paid' | 'credit' | 'pending' | 'cancelled' | 'nota_por_pagar' | 'cargada' }> = {
  COTIZACION: { label: 'Cotización', variant: 'cargada' },
  ABIERTA:    { label: 'Abierta',    variant: 'pending' },
  PENDIENTE:  { label: 'Pendiente',  variant: 'pending' },
  PAGADA:     { label: 'Pagada',     variant: 'paid' },
  CREDITO:    { label: 'Crédito',    variant: 'credit' },
  CANCELADA:  { label: 'Cancelada',  variant: 'cancelled' },
};

// ── Schema nueva nota ────────────────────────────────────────
const NuevaNotaSchema = z.object({
  cliente_id: z.string().optional(),
  observaciones: z.string().optional(),
  es_cotizacion: z.boolean().optional(),
});
type NuevaNotaForm = z.infer<typeof NuevaNotaSchema>;

// ── Línea de captura rápida ──────────────────────────────────
const LineaSchema = z.object({
  busqueda: z.string().min(1, 'Ingresa clave o descripción'),
  cantidad: z.number({ coerce: true }).min(0.001, 'Cantidad inválida'),
  precio_unitario: z.number({ coerce: true }).min(0, 'Precio inválido'),
  descuento: z.number({ coerce: true }).min(0).max(100).optional(),
});
type LineaForm = z.infer<typeof LineaSchema>;

const METODOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'] as const;
const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
};

export default function VentasPage() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const { empresa, ubicacion } = useContextoStore();

  const [notas, setNotas] = useState<NotaVenta[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estatusFiltro, setEstatusFiltro] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState<'' | 'hoy' | 'semana' | 'mes' | 'año'>('hoy');

  // Dialog nueva nota
  const [dlgNota, setDlgNota] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [creatingNota, setCreatingNota] = useState(false);
  const [notaError, setNotaError] = useState<string | null>(null);
  const [modoCreacion, setModoCreacion] = useState<'venta' | 'cotizacion'>('venta');

  // Dialog agregar línea
  const [notaActiva, setNotaActiva] = useState<NotaVenta | null>(null);
  const [dlgLinea, setDlgLinea] = useState(false);
  const [artSugeridos, setArtSugeridos] = useState<Articulo[]>([]);
  const [artSeleccionado, setArtSeleccionado] = useState<Articulo | null>(null);
  const [schema, setSchema] = useState<ConfigColumnasSchema | null>(null);
  const [lineaError, setLineaError] = useState<string | null>(null);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  // Inline editing del carrito
  const [lineaDraft, setLineaDraft] = useState<Record<string, { cantidad: string; precio: string }>>({});
  const [savingLinea, setSavingLinea] = useState<string | null>(null);
  // Ticket preview
  const [showTicket, setShowTicket] = useState(false);
  const [showTicketCobrar, setShowTicketCobrar] = useState(false);

  // Dialog cobrar
  const [dlgCobrar, setDlgCobrar] = useState(false);
  const [pagos, setPagos] = useState<{ metodo: string; monto: number; referencia: string }[]>([
    { metodo: 'EFECTIVO', monto: 0, referencia: '' },
  ]);
  const [cobrandoError, setCobrandoError] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [checkCredito, setCheckCredito] = useState(false);
  const [checkNotaPorPagar, setCheckNotaPorPagar] = useState(false);

  // Email / PDF
  const [dlgEmail, setDlgEmail] = useState<'cotizacion' | 'ticket' | null>(null);
  const [emailDest, setEmailDest] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailOk, setEmailOk] = useState(false);

  // Post-cobro: snapshot para elegir acción
  const [postCobro, setPostCobro] = useState<{
    nota: NotaVenta;
    tipoCierre: string;
    pagos: { metodo: string; monto: number; referencia: string }[];
    cambio: number;
  } | null>(null);

  const canWrite = ['ADMIN', 'ENCARGADO', 'VENDEDOR'].includes(usuario?.rol ?? '');
  const canAdmin = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');

  // Dialog reimprimir / reenviar
  const [dlgReimprimir, setDlgReimprimir] = useState<NotaVenta | null>(null);

  // Dialog abonar a crédito
  const [dlgAbonar, setDlgAbonar] = useState<NotaVenta | null>(null);
  const [pagosAbono, setPagosAbono] = useState<{ metodo: string; monto: number; referencia: string }[]>([
    { metodo: 'EFECTIVO', monto: 0, referencia: '' },
  ]);
  const [abonandoError, setAbonandoError] = useState<string | null>(null);
  const [abonando, setAbonando] = useState(false);
  const [showTicketAbonar, setShowTicketAbonar] = useState(false);

  // ── Leer params de URL al montar ──────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clienteIdParam = params.get('cliente_id');
    const cotizacionParam = params.get('cotizacion') === '1';
    if (clienteIdParam) {
      const modo = cotizacionParam ? 'cotizacion' : 'venta';
      // Limpiar URL sin recargar
      window.history.replaceState({}, '', window.location.pathname);
      openDlgNota(modo, clienteIdParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Carga de notas ────────────────────────────────────────
  const loadNotas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (estatusFiltro) params.set('estatus', estatusFiltro);
      const desde = getFechaDesde(fechaFiltro);
      if (desde) params.set('desde', desde);
      const res = await api.get<NotasVentaPage>(`/ventas?${params}`);
      setNotas(res.data);
      setTotal(res.total);
      setPages(res.pages);
    } catch {
      setNotas([]);
    } finally {
      setLoading(false);
    }
  }, [page, estatusFiltro, fechaFiltro]);

  useEffect(() => { loadNotas(); }, [loadNotas]);

  // ── Sync drafts de carrito cuando cambia la nota activa ──
  useEffect(() => {
    if (!notaActiva) { setLineaDraft({}); return; }
    setLineaDraft(() => {
      const d: Record<string, { cantidad: string; precio: string }> = {};
      for (const l of notaActiva.lineas) {
        d[l.id] = { cantidad: String(l.cantidad), precio: String(l.precio_unitario) };
      }
      return d;
    });
  }, [notaActiva]);

  // ── Config columnas ───────────────────────────────────────
  useEffect(() => {
    if (!empresa?.id || !ubicacion?.id) return;
    api.get<ConfigColumnasSchema>(`/config-columnas/${empresa.id}/${ubicacion.id}/schema`)
      .then(setSchema)
      .catch(() => {});
  }, [empresa?.id, ubicacion?.id]);

  // ── Form nueva nota ───────────────────────────────────────
  const notaForm = useForm<NuevaNotaForm>({ resolver: zodResolver(NuevaNotaSchema) });

  async function openDlgNota(modo: 'venta' | 'cotizacion' = 'venta', preClienteId?: string) {
    setModoCreacion(modo);
    setNotaError(null);
    notaForm.reset({ es_cotizacion: modo === 'cotizacion' });
    try {
      const data = await api.get<Cliente[]>('/clientes');
      setClientes(data);
      if (preClienteId) {
        notaForm.setValue('cliente_id', preClienteId);
        const c = data.find((cl) => cl.id === preClienteId) ?? null;
        setClienteSeleccionado(c);
      } else {
        setClienteSeleccionado(null);
      }
    } catch {
      setClientes([]);
    }
    setDlgNota(true);
  }

  async function onCrearNota(data: NuevaNotaForm) {
    setCreatingNota(true);
    setNotaError(null);
    const clienteId = data.cliente_id || undefined;
    try {
      const nota = await api.post<NotaVenta>('/ventas', {
        cliente_id: clienteId,
        observaciones: data.observaciones || undefined,
        es_cotizacion: modoCreacion === 'cotizacion',
        lineas: [],
      });
      // Guardar cliente seleccionado para autocompletar precio
      const c = clientes.find((cl) => cl.id === clienteId) ?? null;
      setClienteSeleccionado(c);
      setDlgNota(false);
      setNotaActiva(nota);
      setDlgLinea(true);
      lineaForm.reset({ busqueda: '', cantidad: 1, precio_unitario: 0, descuento: 0 });
      loadNotas();
    } catch (err) {
      setNotaError(err instanceof Error ? err.message : 'Error al crear');
    } finally {
      setCreatingNota(false);
    }
  }

  // ── Form agregar línea ────────────────────────────────────
  const lineaForm = useForm<LineaForm>({ resolver: zodResolver(LineaSchema) });

  async function buscarArticulo(val: string) {
    if (val.length < 2) { setArtSugeridos([]); return; }
    try {
      const res = await api.get<ArticulosPage>(`/articulos?q=${encodeURIComponent(val)}&limit=8`);
      setArtSugeridos(res.data);
    } catch { setArtSugeridos([]); }
  }

  function seleccionarArt(art: Articulo) {
    setArtSeleccionado(art);
    setArtSugeridos([]);
    const artDescs = [art.descripcion_1, art.descripcion_2, art.descripcion_3, art.descripcion_4, art.descripcion_5].filter(Boolean).join(' · ');
    lineaForm.setValue('busqueda', `${art.clave}${artDescs ? ` — ${artDescs}` : ''}`);

    // Precio: usa el tipo del cliente si tiene uno, si no el primer precio activo
    const precioNum = clienteSeleccionado?.precio_num
      ?? schema?.precios.find((p) => p.activa)?.numero
      ?? 1;
    const campo = `precio_${precioNum}` as keyof Articulo;
    lineaForm.setValue('precio_unitario', (art[campo] as number | null) ?? 0);
  }

  async function onAgregarLinea(data: LineaForm) {
    if (!notaActiva || !artSeleccionado) return;
    setLineaError(null);

    // Detectar artículo duplicado → acumular cantidad en línea existente
    const existente = notaActiva.lineas.find((l) => l.articulo?.id === artSeleccionado.id);
    if (existente) {
      try {
        const updated = await api.patch<NotaVenta>(`/ventas/${notaActiva.id}/lineas/${existente.id}`, {
          cantidad: existente.cantidad + data.cantidad,
          precio_unitario: data.precio_unitario,
        });
        setNotaActiva(updated);
        lineaForm.reset({ busqueda: '', cantidad: 1, precio_unitario: 0, descuento: 0 });
        setArtSeleccionado(null);
        setArtSugeridos([]);
      } catch (err) {
        setLineaError(err instanceof Error ? err.message : 'Error al actualizar línea');
      }
      return;
    }

    try {
      const updated = await api.post<NotaVenta>(`/ventas/${notaActiva.id}/lineas`, {
        articulo_id: artSeleccionado.id,
        cantidad: data.cantidad,
        precio_unitario: data.precio_unitario,
        descuento: data.descuento ?? 0,
      });
      setNotaActiva(updated);
      lineaForm.reset({ busqueda: '', cantidad: 1, precio_unitario: 0, descuento: 0 });
      setArtSeleccionado(null);
      setArtSugeridos([]);
    } catch (err) {
      setLineaError(err instanceof Error ? err.message : 'Error al agregar línea');
    }
  }

  async function updateLineaInline(lineaId: string, field: 'cantidad' | 'precio_unitario', rawValue: string) {
    if (!notaActiva) return;
    const parsed = parseFloat(rawValue);
    if (isNaN(parsed) || parsed <= 0) return;
    const orig = notaActiva.lineas.find((l) => l.id === lineaId);
    if (!orig) return;
    const origVal = field === 'cantidad' ? orig.cantidad : orig.precio_unitario;
    if (Math.abs(parsed - origVal) < 0.0001) return;
    setSavingLinea(lineaId);
    try {
      const updated = await api.patch<NotaVenta>(`/ventas/${notaActiva.id}/lineas/${lineaId}`, { [field]: parsed });
      setNotaActiva(updated);
    } catch {
      setLineaDraft((prev) => ({
        ...prev,
        [lineaId]: {
          ...prev[lineaId],
          [field === 'cantidad' ? 'cantidad' : 'precio']: String(origVal),
        },
      }));
    } finally {
      setSavingLinea(null);
    }
  }

  async function eliminarLinea(lineaId: string) {
    if (!notaActiva) return;
    try {
      const updated = await api.delete<NotaVenta>(`/ventas/${notaActiva.id}/lineas/${lineaId}`);
      setNotaActiva(updated);
    } catch {}
  }

  // ── Abrir nota/cotización para editar ─────────────────────
  async function openEditarNota(nota: NotaVenta) {
    setLineaError(null);
    try {
      const full = await api.get<NotaVenta>(`/ventas/${nota.id}`);
      const c = full.cliente_id ? clientes.find((cl) => cl.id === full.cliente_id) ?? null : null;
      setClienteSeleccionado(c);
      setNotaActiva(full);
      lineaForm.reset({ busqueda: '', cantidad: 1, precio_unitario: 0, descuento: 0 });
      setArtSeleccionado(null);
      setArtSugeridos([]);
      setDlgLinea(true);
    } catch {
      router.push(`/ventas/${nota.id}`);
    }
  }

  // ── Convertir cotización a venta ──────────────────────────
  async function convertirAVenta(nota: NotaVenta) {
    try {
      await api.patch(`/ventas/${nota.id}/convertir`, {});
      loadNotas();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al convertir');
    }
  }

  // ── Enviar ticket al print bridge ─────────────────────────
  async function printTicket(
    nota: NotaVenta,
    tipoCierre: 'PAGADA' | 'CREDITO' | 'PENDIENTE',
    pagosList: { metodo: string; monto: number; referencia: string }[],
    cambioFinal: number,
  ) {
    const totalPagadoNota = (nota.pagos ?? []).reduce((s, p) => s + p.monto, 0);
    const saldoRestante = Math.max(0, +(nota.total - totalPagadoNota).toFixed(2));

    const payload = {
      tipo: 'venta',
      empresa: { nombre: empresa?.nombre ?? '' },
      ubicacion: {
        nombre: ubicacion?.nombre ?? '',
        razon_social: ubicacion?.razon_social ?? null,
        rfc: ubicacion?.rfc ?? null,
        telefono: ubicacion?.telefono ?? null,
        direccion: direccionUbicacion || null,
      },
      nota: {
        folio: String(nota.folio).padStart(4, '0'),
        fecha: new Date(nota.created_at).toLocaleDateString('es-MX', {
          day: '2-digit', month: 'short', year: 'numeric',
        }),
        cliente: nota.cliente
          ? (nota.cliente.razon_social ?? `${nota.cliente.nombre} ${nota.cliente.apellidos ?? ''}`.trim())
          : null,
      },
      lineas: nota.lineas.map((l) => ({
        clave: l.clave,
        descripcion: [
          l.articulo?.descripcion_1, l.articulo?.descripcion_2,
          l.articulo?.descripcion_3, l.articulo?.descripcion_4, l.articulo?.descripcion_5,
        ].filter((d): d is string => !!d).join(' · ') || null,
        cantidad: l.cantidad,
        precio: l.precio_unitario,
        subtotal: l.subtotal,
      })),
      totales: { subtotal: nota.subtotal, total: nota.total },
      pagos: pagosList
        .filter((p) => p.monto > 0)
        .map((p) => ({ metodo: METODO_LABEL[p.metodo] ?? p.metodo, monto: p.monto })),
      cambio: cambioFinal > 0 ? cambioFinal : 0,
      tipo_cierre: tipoCierre,
      saldo_restante: tipoCierre === 'CREDITO' ? saldoRestante : 0,
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('http://localhost:7788/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        console.warn('[ventas] Error print bridge:', err.error);
      }
    } catch {
      // Bridge no disponible — no bloquear la UI
      console.warn('[ventas] Print bridge no disponible en localhost:7788');
    }
  }

  // ── Generar PDF cotización en ventana de impresión ────────
  function generateCotizacionPDF(nota: NotaVenta) {
    const clienteNombre = nota.cliente
      ? (nota.cliente.razon_social ?? `${nota.cliente.nombre}${nota.cliente.apellidos ? ' ' + nota.cliente.apellidos : ''}`)
      : 'Público General';
    const fechaStr = new Date(nota.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    const folioStr = `#${String(nota.folio).padStart(4, '0')}`;

    const lineasHTML = nota.lineas.map((l) => {
      const descs = [l.articulo?.descripcion_1, l.articulo?.descripcion_2,
        l.articulo?.descripcion_3, l.articulo?.descripcion_4, l.articulo?.descripcion_5,
      ].filter(Boolean).join(' · ');
      return `<tr>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${l.clave}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;font-size:12px;color:#444;">${descs || '—'}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:right;font-size:12px;">${Number(l.cantidad).toLocaleString('es-MX')}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:right;font-size:12px;">$${Number(l.precio_unitario).toFixed(2)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-weight:bold;">$${Number(l.subtotal).toFixed(2)}</td>
      </tr>`;
    }).join('');

    const rfcTel = [
      ubicacion?.rfc ? `RFC: ${ubicacion.rfc}` : null,
      ubicacion?.telefono ? `Tel: ${ubicacion.telefono}` : null,
    ].filter(Boolean).join('  ·  ');

    const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8">
<title>Cotización ${folioStr}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#111;padding:24px;background:#f8f8f8}
  .wrap{max-width:800px;margin:0 auto;background:#fff;padding:32px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.1)}
  .no-print{text-align:center;margin-bottom:20px}
  .no-print button{padding:10px 28px;margin:0 6px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600}
  .btn-pdf{background:#111;color:#fff}
  .btn-close{background:#eee;color:#333}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:20px;margin-bottom:20px}
  .logo{max-height:70px;max-width:200px;object-fit:contain}
  .empresa h1{font-size:20px;font-weight:bold;text-transform:uppercase;margin-bottom:4px}
  .empresa p{font-size:11px;color:#555;margin-bottom:2px}
  .badge{display:inline-block;background:#2563eb;color:#fff;padding:6px 16px;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;border-radius:4px;margin-bottom:12px}
  .meta{display:flex;justify-content:space-between;margin-bottom:20px;font-size:13px}
  .cliente-box{background:#f5f5f5;border-left:3px solid #111;padding:10px 14px;margin-bottom:20px;font-size:13px}
  table{width:100%;border-collapse:collapse}
  thead th{background:#111;color:#fff;padding:8px;font-size:11px;font-weight:600;text-align:left;text-transform:uppercase}
  thead th:last-child,thead th:nth-child(3),thead th:nth-child(4){text-align:right}
  tfoot td{padding:8px;font-weight:bold;font-size:14px}
  .total-row{background:#111;color:#fff}
  .total-row td{padding:10px 8px!important;font-size:16px}
  .footer{margin-top:24px;padding-top:16px;border-top:1px solid #ddd;font-size:11px;color:#888;text-align:center}
  @media print{.no-print{display:none}body{background:#fff;padding:0}
    .wrap{box-shadow:none;padding:16px;border-radius:0}@page{size:letter;margin:10mm}}
</style></head>
<body><div class="wrap">
  <div class="no-print">
    <button class="btn-pdf" onclick="window.print()">⬇ Guardar como PDF / Imprimir</button>
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>
  <div class="header">
    <div>
      ${empresa?.logo_url ? `<img src="${empresa.logo_url}" class="logo" alt="Logo">` : ''}
      <span class="badge" style="margin-top:${empresa?.logo_url ? '8px' : '0'}">COTIZACIÓN ${folioStr}</span>
    </div>
    <div class="empresa" style="text-align:right">
      <h1>${(ubicacion?.razon_social ?? empresa?.nombre ?? '').toUpperCase()}</h1>
      ${ubicacion?.nombre ? `<p>${ubicacion.nombre}</p>` : ''}
      ${rfcTel ? `<p>${rfcTel}</p>` : ''}
      ${direccionUbicacion ? `<p>${direccionUbicacion}</p>` : ''}
    </div>
  </div>
  <div class="meta">
    <span>Fecha: <strong>${fechaStr}</strong></span>
    <span>Válida por <strong>30 días</strong></span>
  </div>
  <div class="cliente-box">
    <strong>Cliente:</strong> ${clienteNombre}
  </div>
  <table>
    <thead><tr>
      <th>Clave</th><th>Descripción</th>
      <th style="text-align:right">Cant.</th>
      <th style="text-align:right">Precio unit.</th>
      <th style="text-align:right">Subtotal</th>
    </tr></thead>
    <tbody>${lineasHTML}</tbody>
    <tfoot>
      <tr><td colspan="4" style="text-align:right;padding:8px;border-top:2px solid #111">Subtotal</td>
          <td style="text-align:right;padding:8px;border-top:2px solid #111">$${Number(nota.subtotal).toFixed(2)}</td></tr>
      <tr class="total-row"><td colspan="4" style="text-align:right">TOTAL</td>
          <td style="text-align:right">$${Number(nota.total).toFixed(2)}</td></tr>
    </tfoot>
  </table>
  ${nota.observaciones ? `<p style="margin-top:16px;font-size:12px;color:#555"><strong>Obs:</strong> ${nota.observaciones}</p>` : ''}
  <div class="footer">
    <p>Esta cotización es válida por 30 días a partir de su emisión.</p>
    <p style="margin-top:4px">¡Gracias por su preferencia!</p>
  </div>
</div></body></html>`;

    const win = window.open('', '_blank', 'width=900,height=750,scrollbars=yes,resizable=yes');
    if (!win) { alert('Activa las ventanas emergentes en tu navegador para generar el PDF.'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); };
  }

  // ── Enviar email ──────────────────────────────────────────
  async function sendEmailNota(
    nota: NotaVenta,
    tipo: 'cotizacion' | 'ticket',
    emailTo: string,
    extra?: { pagos?: { metodo: string; monto: number }[]; cambio?: number; tipo_cierre?: string },
  ) {
    setSendingEmail(true);
    setEmailError(null);
    setEmailOk(false);
    try {
      await api.post(`/ventas/${nota.id}/send-email`, { to: emailTo, tipo, extra });
      setEmailOk(true);
      setTimeout(() => { setDlgEmail(null); setEmailOk(false); setPostCobro(null); }, 1800);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setSendingEmail(false);
    }
  }

  // ── Abonar a nota en crédito ──────────────────────────────
  function openAbonar(nota: NotaVenta) {
    const pagado = (nota.pagos ?? []).reduce((s, p) => s + p.monto, 0);
    const saldo = Math.max(0, +(nota.total - pagado).toFixed(2));
    setDlgAbonar(nota);
    setPagosAbono([{ metodo: 'EFECTIVO', monto: saldo, referencia: '' }]);
    setAbonandoError(null);
    setShowTicketAbonar(false);
  }

  async function onAbonar() {
    if (!dlgAbonar) return;
    setAbonando(true);
    setAbonandoError(null);
    try {
      const pagosSnap = pagosAbono.filter((p) => p.monto > 0);
      const notaActualizada = await api.post<NotaVenta>(`/ventas/${dlgAbonar.id}/abonar`, {
        pagos: pagosSnap.map((p) => ({
          metodo: p.metodo,
          monto: p.monto,
          referencia: p.referencia || undefined,
        })),
      });
      setDlgAbonar(null);
      loadNotas();
      // Siempre ofrecer imprimir/enviar comprobante del abono
      setPostCobro({
        nota: notaActualizada,
        tipoCierre: notaActualizada.estatus, // 'PAGADA' o 'CREDITO'
        pagos: pagosSnap,
        cambio: 0,
      });
    } catch (err) {
      setAbonandoError(err instanceof Error ? err.message : 'Error al registrar abono');
    } finally {
      setAbonando(false);
    }
  }

  // ── Cobrar ────────────────────────────────────────────────
  function openCobrar(nota: NotaVenta) {
    setNotaActiva(nota);
    setPagos([{ metodo: 'EFECTIVO', monto: nota.total, referencia: '' }]);
    setCobrandoError(null);
    setCheckCredito(false);
    setCheckNotaPorPagar(false);
    setShowTicketCobrar(false);
    setDlgCobrar(true);
  }

  async function onCobrar() {
    if (!notaActiva) return;
    setCobrando(true);
    setCobrandoError(null);

    // Snapshot antes de cualquier operación async (los estados se resetean después)
    const notaSnap = notaActiva;
    const pagosSnap = [...pagos];
    const cambioSnap = cambio;
    const tipoCierre: 'PAGADA' | 'CREDITO' | 'PENDIENTE' = checkNotaPorPagar
      ? 'PENDIENTE'
      : checkCredito || saldoCredito > 0
      ? 'CREDITO'
      : 'PAGADA';

    try {
      if (checkNotaPorPagar) {
        await api.patch(`/ventas/${notaSnap.id}/pendiente`, {});
      } else {
        await api.post(`/ventas/${notaSnap.id}/cerrar`, {
          pagos: checkCredito
            ? []
            : pagosSnap.filter((p) => p.monto > 0).map((p) => ({
                metodo: p.metodo,
                monto: p.monto,
                referencia: p.referencia || undefined,
              })),
        });
      }

      setDlgCobrar(false);
      setNotaActiva(null);
      loadNotas();
      // Guardar snapshot para que el usuario elija cómo recibir el comprobante
      setPostCobro({ nota: notaSnap, tipoCierre, pagos: pagosSnap, cambio: cambioSnap });
    } catch (err) {
      setCobrandoError(err instanceof Error ? err.message : 'Error al procesar');
    } finally {
      setCobrando(false);
    }
  }

  const totalPagos = pagos.reduce((s, p) => s + (p.monto || 0), 0);
  const cambio = notaActiva ? +(totalPagos - notaActiva.total).toFixed(2) : 0;
  const saldoCredito = notaActiva && !checkCredito && !checkNotaPorPagar
    ? +Math.max(0, notaActiva.total - totalPagos).toFixed(2)
    : 0;

  // Validación límite de crédito
  const clienteCredito = notaActiva?.cliente;
  const excedeLimite = !!clienteCredito && clienteCredito.limite_credito > 0
    && (checkCredito
      ? clienteCredito.saldo_pendiente + notaActiva!.total > clienteCredito.limite_credito
      : saldoCredito > 0 && clienteCredito.saldo_pendiente + saldoCredito > clienteCredito.limite_credito);

  const puedeConfirmar = notaActiva && !excedeLimite && (
    checkNotaPorPagar
    || checkCredito && !!notaActiva.cliente_id
    || (!checkCredito && (saldoCredito === 0 || !!notaActiva.cliente_id))
  );

  // ── Filtro local ──────────────────────────────────────────
  const filtered = notas.filter((n) => {
    if (!q) return true;
    const qLow = q.toLowerCase();
    return (
      String(n.folio).includes(q) ||
      (n.cliente?.nombre ?? '').toLowerCase().includes(qLow) ||
      (n.cliente?.razon_social ?? '').toLowerCase().includes(qLow)
    );
  });

  const esCotizacionActiva = notaActiva?.estatus === 'COTIZACION';

  function getFechaDesde(filtro: string): string | undefined {
    const now = new Date();
    switch (filtro) {
      case 'hoy': return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      case 'semana': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(now.getFullYear(), now.getMonth(), diff).toISOString();
      }
      case 'mes': return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      case 'año': return new Date(now.getFullYear(), 0, 1).toISOString();
      default: return undefined;
    }
  }

  const direccionUbicacion = [
    ubicacion?.calle
      ? `${ubicacion.calle}${ubicacion.num_ext ? ` #${ubicacion.num_ext}` : ''}${ubicacion.num_int ? ` Int.${ubicacion.num_int}` : ''}`
      : null,
    ubicacion?.colonia,
    ubicacion?.municipio && ubicacion?.estado
      ? `${ubicacion.municipio}, ${ubicacion.estado}`
      : (ubicacion?.municipio ?? ubicacion?.estado ?? null),
    ubicacion?.cp,
  ].filter(Boolean).join(', ');

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-4 border-b border-steel-200 bg-white flex items-center justify-between">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Ventas</p>
          <h1 className="text-display-md font-bold text-steel-900">Notas de Venta</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push('/ventas/clientes')}>
            <Users className="h-4 w-4 mr-1.5" />
            Clientes
          </Button>
          {canWrite && (
            <>
              <Button variant="secondary" onClick={() => openDlgNota('cotizacion')}>
                <FileText className="h-4 w-4 mr-1.5" />
                Cotización
              </Button>
              <Button onClick={() => openDlgNota('venta')}>
                <Plus className="h-4 w-4 mr-1.5" />
                Nueva venta
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Filtros */}
        <div className="flex flex-col gap-2.5 mb-4">
          {/* Fila 1: búsqueda + estatus */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
              <input
                className="h-9 w-full rounded-md border border-steel-300 bg-white pl-8 pr-3 text-body text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                placeholder="Buscar por folio o cliente…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['', 'COTIZACION', 'ABIERTA', 'PENDIENTE', 'PAGADA', 'CREDITO', 'CANCELADA'] as const).map((est) => (
                <button
                  key={est}
                  onClick={() => { setEstatusFiltro(est); setPage(1); }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors',
                    estatusFiltro === est
                      ? 'bg-steel-900 text-white'
                      : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50',
                  )}
                >
                  {est === '' ? 'Todas' : ESTATUS_CONFIG[est]?.label}
                </button>
              ))}
            </div>
          </div>
          {/* Fila 2: filtro de fecha */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-steel-400 uppercase tracking-[1px] mr-1">Período</span>
            {([
              { value: 'hoy',   label: 'Hoy' },
              { value: 'semana', label: 'Semana' },
              { value: 'mes',   label: 'Mes' },
              { value: 'año',   label: 'Año' },
              { value: '',      label: 'Todas' },
            ] as { value: '' | 'hoy' | 'semana' | 'mes' | 'año'; label: string }[]).map(({ value, label }) => (
              <button
                key={value || 'all'}
                onClick={() => { setFechaFiltro(value); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors',
                  fechaFiltro === value
                    ? 'bg-brand-600 text-white'
                    : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 bg-steel-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title="Sin notas"
            description="Crea la primera nota de venta para comenzar."
            action={canWrite ? { label: 'Nueva venta', onClick: () => openDlgNota('venta') } : undefined}
          />
        ) : (
          <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2.5 text-left text-eyebrow text-steel-400 tracking-[1.5px] uppercase font-medium">Folio</th>
                  <th className="px-4 py-2.5 text-left text-eyebrow text-steel-400 tracking-[1.5px] uppercase font-medium">Cliente</th>
                  <th className="px-4 py-2.5 text-left text-eyebrow text-steel-400 tracking-[1.5px] uppercase font-medium">Estatus</th>
                  <th className="px-4 py-2.5 text-right text-eyebrow text-steel-400 tracking-[1.5px] uppercase font-medium">Total</th>
                  <th className="px-4 py-2.5 text-left text-eyebrow text-steel-400 tracking-[1.5px] uppercase font-medium">Fecha</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((nota, i) => {
                  const cfg = ESTATUS_CONFIG[nota.estatus];
                  const esCot = nota.estatus === 'COTIZACION';
                  return (
                    <tr
                      key={nota.id}
                      className={cn(
                        'border-b border-steel-50 hover:bg-steel-50 transition-colors cursor-pointer',
                        i === filtered.length - 1 && 'border-b-0',
                      )}
                      onClick={() => {
                        if (nota.estatus === 'ABIERTA' || nota.estatus === 'COTIZACION') void openEditarNota(nota);
                        else if (nota.estatus === 'PENDIENTE') openCobrar(nota);
                        else if (nota.estatus === 'CREDITO') openAbonar(nota);
                        else router.push(`/ventas/${nota.id}`);
                      }}
                    >
                      <td className="px-4 py-3">
                        <span className="text-body font-bold text-steel-900">#{String(nota.folio).padStart(4, '0')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-body text-steel-900">
                          {nota.cliente
                            ? nota.cliente.razon_social ?? `${nota.cliente.nombre} ${nota.cliente.apellidos ?? ''}`.trim()
                            : <span className="text-steel-400 italic">Mostrador</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={cfg?.variant ?? 'default'}>{cfg?.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-body font-semibold text-steel-900">
                          ${nota.total.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-body-sm text-steel-500">
                          {new Date(nota.created_at).toLocaleDateString('es-MX', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {esCot && canWrite && (
                            <>
                              <button
                                onClick={() => void openEditarNota(nota)}
                                className="px-3 py-1.5 bg-white border border-steel-300 text-steel-700 text-body-sm font-medium rounded-lg hover:bg-steel-50 transition-colors"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => void convertirAVenta(nota)}
                                className="px-3 py-1.5 bg-steel-900 text-white text-body-sm font-medium rounded-lg hover:bg-steel-700 transition-colors"
                              >
                                Convertir
                              </button>
                            </>
                          )}
                          {nota.estatus === 'ABIERTA' && canWrite && (
                            <>
                              <button
                                onClick={() => void openEditarNota(nota)}
                                className="px-3 py-1.5 bg-white border border-steel-300 text-steel-700 text-body-sm font-medium rounded-lg hover:bg-steel-50 transition-colors"
                              >
                                Agregar
                              </button>
                              <button
                                onClick={() => openCobrar(nota)}
                                className="px-3 py-1.5 bg-brand-600 text-white text-body-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
                              >
                                Cobrar
                              </button>
                            </>
                          )}
                          {nota.estatus === 'PENDIENTE' && canWrite && (
                            <button
                              onClick={() => openCobrar(nota)}
                              className="px-3 py-1.5 bg-steel-900 text-white text-body-sm font-medium rounded-lg hover:bg-steel-700 transition-colors"
                            >
                              Cobrar
                            </button>
                          )}
                          {nota.estatus === 'CREDITO' && canWrite && (
                            <button
                              onClick={() => openAbonar(nota)}
                              className="px-3 py-1.5 bg-amber-500 text-white text-body-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
                            >
                              Abonar
                            </button>
                          )}
                          {['PAGADA', 'CREDITO'].includes(nota.estatus) && (
                            <button
                              onClick={() => router.push(`/ventas/${nota.id}`)}
                              className="px-3 py-1.5 bg-white border border-steel-200 text-steel-700 text-body-sm font-medium rounded-lg hover:bg-steel-50 transition-colors"
                              title="Ver historial de pagos y evidencias"
                            >
                              Ver
                            </button>
                          )}
                          {['PAGADA', 'CREDITO'].includes(nota.estatus) && canAdmin && (
                            <button
                              onClick={() => setDlgReimprimir(nota)}
                              className="px-2.5 py-1.5 bg-white border border-steel-200 text-steel-500 text-body-sm font-medium rounded-lg hover:bg-steel-50 transition-colors"
                              title="Reimprimir ticket o reenviar por correo"
                            >
                              🖨
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-body-sm text-steel-500">{total} notas</p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-steel-200 text-steel-600 hover:bg-steel-50 disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-body-sm text-steel-600 px-2">{page} / {pages}</span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-steel-200 text-steel-600 hover:bg-steel-50 disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialog: crear nota / cotización ─────────────────── */}
      <Dialog
        open={dlgNota}
        onClose={() => setDlgNota(false)}
        title={modoCreacion === 'cotizacion' ? 'Nueva cotización' : 'Nueva nota de venta'}
        size="sm"
      >
        <form onSubmit={notaForm.handleSubmit(onCrearNota)} className="space-y-4">
          {modoCreacion === 'cotizacion' && (
            <div className="bg-steel-50 rounded-lg px-3 py-2.5 flex items-center gap-2">
              <FileText className="h-4 w-4 text-steel-500 flex-shrink-0" />
              <p className="text-body-sm text-steel-600">
                La cotización puede ser editada y convertida a venta cuando el cliente confirme.
              </p>
            </div>
          )}
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Cliente <span className="text-steel-400 font-normal">(opcional)</span>
            </label>
            <select
              className="flex h-9 w-full rounded-md border border-steel-300 bg-white px-3 py-1 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
              {...notaForm.register('cliente_id', {
                onChange: (e) => {
                  const c = clientes.find((cl) => cl.id === e.target.value) ?? null;
                  setClienteSeleccionado(c);
                },
              })}
            >
              <option value="">{modoCreacion === 'venta' ? 'Venta de mostrador (sin cliente)' : 'Sin cliente asignado'}</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social ?? `${c.nombre} ${c.apellidos ?? ''}`.trim()}
                </option>
              ))}
            </select>
            {clienteSeleccionado?.precio_num && schema && (
              <p className="text-meta text-brand-600 mt-1">
                Precio asignado: {schema.precios.find((p) => p.numero === clienteSeleccionado.precio_num)?.label ?? `Precio ${clienteSeleccionado.precio_num}`}
              </p>
            )}
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Observaciones</label>
            <Input placeholder="Notas internas…" {...notaForm.register('observaciones')} />
          </div>
          {notaError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{notaError}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDlgNota(false)}>Cancelar</Button>
            <Button type="submit" loading={creatingNota}>
              {modoCreacion === 'cotizacion' ? 'Crear cotización' : 'Crear nota'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* ── Dialog: agregar líneas ────────────────────────── */}
      <Dialog
        open={dlgLinea}
        onClose={() => { setDlgLinea(false); setNotaActiva(null); loadNotas(); }}
        title={
          notaActiva
            ? `${esCotizacionActiva ? 'Cotización' : 'Nota'} #${String(notaActiva.folio).padStart(4, '0')}`
            : 'Agregar artículos'
        }
        size="lg"
      >
        <div className="space-y-4">
          {esCotizacionActiva && (
            <div className="flex items-center justify-between bg-steel-50 rounded-lg px-3 py-2">
              <span className="text-body-sm text-steel-600 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Cotización — pendiente de confirmar
              </span>
              {notaActiva && notaActiva.lineas.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => notaActiva && void convertirAVenta(notaActiva).then(() => { setDlgLinea(false); loadNotas(); })}
                >
                  Convertir a venta
                </Button>
              )}
            </div>
          )}

          {/* Líneas actuales */}
          {notaActiva && notaActiva.lineas.length > 0 && (
            <div className="border border-steel-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-steel-100 bg-steel-50">
                    <th className="px-3 py-2 text-left text-eyebrow text-steel-400 tracking-[1px] uppercase font-medium text-[10px]">Artículo</th>
                    <th className="px-3 py-2 text-right text-eyebrow text-steel-400 tracking-[1px] uppercase font-medium text-[10px]">Cant.</th>
                    <th className="px-3 py-2 text-right text-eyebrow text-steel-400 tracking-[1px] uppercase font-medium text-[10px]">Precio</th>
                    <th className="px-3 py-2 text-right text-eyebrow text-steel-400 tracking-[1px] uppercase font-medium text-[10px]">Subtotal</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {notaActiva.lineas.map((l) => (
                    <tr key={l.id} className={cn('border-b border-steel-50 last:border-b-0', savingLinea === l.id && 'opacity-60')}>
                      <td className="px-3 py-2">
                        <p className="text-body-sm font-semibold text-steel-900">{l.clave}</p>
                        {(() => {
                          const d = [l.articulo?.descripcion_1, l.articulo?.descripcion_2, l.articulo?.descripcion_3, l.articulo?.descripcion_4, l.articulo?.descripcion_5].filter((x): x is string => !!x);
                          return d.length > 0 ? <p className="text-meta text-steel-500 truncate max-w-[220px]">{d.join(' · ')}</p> : null;
                        })()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          disabled={savingLinea === l.id}
                          className="w-16 text-right text-body-sm text-steel-700 bg-transparent border-b border-transparent hover:border-steel-300 focus:border-brand-600 focus:outline-none disabled:opacity-50"
                          value={lineaDraft[l.id]?.cantidad ?? String(l.cantidad)}
                          onChange={(e) => setLineaDraft((prev) => ({ ...prev, [l.id]: { ...prev[l.id], cantidad: e.target.value } }))}
                          onBlur={(e) => void updateLineaInline(l.id, 'cantidad', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={savingLinea === l.id}
                          className="w-20 text-right text-body-sm text-steel-700 bg-transparent border-b border-transparent hover:border-steel-300 focus:border-brand-600 focus:outline-none disabled:opacity-50"
                          value={lineaDraft[l.id]?.precio ?? String(l.precio_unitario)}
                          onChange={(e) => setLineaDraft((prev) => ({ ...prev, [l.id]: { ...prev[l.id], precio: e.target.value } }))}
                          onBlur={(e) => void updateLineaInline(l.id, 'precio_unitario', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-body-sm font-semibold text-steel-900">${l.subtotal.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => eliminarLinea(l.id)}
                          className="text-steel-400 hover:text-brand-600 transition-colors text-body-sm"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-3 py-2 bg-steel-50 border-t border-steel-200">
                <span className="text-body-sm text-steel-600">Total</span>
                <span className="text-body font-bold text-steel-900">${notaActiva.total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Vista previa ticket */}
          {notaActiva && notaActiva.lineas.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowTicket((v) => !v)}
                className="text-body-sm text-steel-500 hover:text-steel-800 transition-colors underline-offset-2 hover:underline"
              >
                {showTicket ? 'Ocultar ticket' : 'Ver vista previa del ticket'}
              </button>
              {showTicket && (
                <div className="mt-2 border border-steel-200 rounded-xl overflow-hidden bg-white text-[11px] font-mono">
                  {/* Cabecera: logo + nombre empresa + sucursal */}
                  <div className="bg-steel-900 text-white px-4 py-3 text-center">
                    {empresa?.logo_url && (
                      <img src={empresa.logo_url} alt="Logo" className="h-8 w-auto mx-auto mb-1.5 object-contain" />
                    )}
                    <p className="font-bold text-[13px] tracking-wide uppercase">
                      {ubicacion?.razon_social ?? empresa?.nombre ?? 'Empresa'}
                    </p>
                    <p className="text-steel-300 mt-0.5 text-[10px]">{ubicacion?.nombre}</p>
                  </div>
                  {/* Folio y fecha */}
                  <div className="px-4 py-2 border-b border-dashed border-steel-200 flex justify-between text-steel-600">
                    <span>Nota #{String(notaActiva.folio).padStart(4, '0')}</span>
                    <span>{new Date(notaActiva.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                  {/* Datos fiscales de la ubicación */}
                  {(ubicacion?.rfc || ubicacion?.telefono || direccionUbicacion) && (
                    <div className="px-4 py-1.5 border-b border-dashed border-steel-200 text-steel-500 text-[10px] space-y-0.5">
                      {ubicacion?.rfc && (
                        <p>RFC: {ubicacion.rfc}{ubicacion.telefono ? `  ·  Tel: ${ubicacion.telefono}` : ''}</p>
                      )}
                      {!ubicacion?.rfc && ubicacion?.telefono && <p>Tel: {ubicacion.telefono}</p>}
                      {direccionUbicacion && <p>{direccionUbicacion}</p>}
                    </div>
                  )}
                  {notaActiva.cliente && (
                    <div className="px-4 py-2 border-b border-dashed border-steel-200 text-steel-700">
                      <span className="text-steel-400">Cliente: </span>
                      {notaActiva.cliente.razon_social ?? `${notaActiva.cliente.nombre} ${notaActiva.cliente.apellidos ?? ''}`.trim()}
                    </div>
                  )}
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-steel-100 text-steel-400">
                        <th className="px-4 py-1.5 text-left font-medium">Artículo</th>
                        <th className="px-2 py-1.5 text-right font-medium">Cant</th>
                        <th className="px-2 py-1.5 text-right font-medium">Precio</th>
                        <th className="px-4 py-1.5 text-right font-medium">Sub</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notaActiva.lineas.map((l) => {
                        const descs = [l.articulo?.descripcion_1, l.articulo?.descripcion_2, l.articulo?.descripcion_3, l.articulo?.descripcion_4, l.articulo?.descripcion_5].filter((d): d is string => !!d);
                        return (
                          <tr key={l.id} className="border-b border-steel-50">
                            <td className="px-4 py-1.5 text-steel-800">
                              <span className="font-semibold">{l.clave}</span>
                              {descs.length > 0 && (
                                <span className="text-steel-500 block truncate max-w-[160px]">{descs.join(' · ')}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right text-steel-700">{l.cantidad}</td>
                            <td className="px-2 py-1.5 text-right text-steel-700">${l.precio_unitario.toFixed(2)}</td>
                            <td className="px-4 py-1.5 text-right font-semibold text-steel-900">${l.subtotal.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-4 py-2 border-t border-dashed border-steel-300 flex justify-between font-bold text-[13px] text-steel-900">
                    <span>TOTAL</span>
                    <span>${notaActiva.total.toFixed(2)}</span>
                  </div>
                  <div className="px-4 py-2 text-center text-steel-400 text-[10px]">¡Gracias por su compra!</div>
                </div>
              )}
            </div>
          )}

          {/* Captura rápida */}
          <form onSubmit={lineaForm.handleSubmit(onAgregarLinea)} className="space-y-3">
            <div className="relative">
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Buscar artículo</label>
              <Input
                placeholder="Clave o descripción…"
                error={lineaForm.formState.errors.busqueda?.message}
                {...lineaForm.register('busqueda', {
                  onChange: (e) => buscarArticulo(e.target.value),
                })}
              />
              {artSugeridos.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-steel-200 rounded-xl shadow-lg overflow-hidden">
                  {artSugeridos.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => seleccionarArt(art)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-steel-50 text-left transition-colors"
                    >
                      <div>
                        <p className="text-body-sm font-semibold text-steel-900">{art.clave}</p>
                        {(() => {
                          const d = [art.descripcion_1, art.descripcion_2, art.descripcion_3, art.descripcion_4, art.descripcion_5].filter(Boolean).join(' · ');
                          return d ? <p className="text-meta text-steel-500 truncate">{d}</p> : null;
                        })()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Cantidad</label>
                <Input
                  type="number" step="0.001" min="0.001"
                  error={lineaForm.formState.errors.cantidad?.message}
                  {...lineaForm.register('cantidad', { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Precio unit.</label>
                <Input
                  type="number" step="0.01" min="0"
                  error={lineaForm.formState.errors.precio_unitario?.message}
                  {...lineaForm.register('precio_unitario', { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Desc. %</label>
                <Input
                  type="number" step="0.1" min="0" max="100" placeholder="0"
                  {...lineaForm.register('descuento', { valueAsNumber: true })}
                />
              </div>
            </div>

            {lineaError && (
              <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
                <p className="text-body-sm text-brand-600">{lineaError}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setDlgLinea(false); setNotaActiva(null); loadNotas(); }}
              >
                Listo
              </Button>
              <div className="flex gap-2">
                {notaActiva && notaActiva.lineas.length > 0 && esCotizacionActiva && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => notaActiva && generateCotizacionPDF(notaActiva)}
                    >
                      📄 PDF
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => { setEmailDest(notaActiva?.cliente?.email ?? ''); setEmailError(null); setEmailOk(false); setDlgEmail('cotizacion'); }}
                    >
                      ✉️ Enviar
                    </Button>
                  </>
                )}
                {notaActiva && notaActiva.lineas.length > 0 && !esCotizacionActiva && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => { setDlgLinea(false); openCobrar(notaActiva); }}
                  >
                    Cobrar ahora
                  </Button>
                )}
                <Button type="submit" disabled={!artSeleccionado}>
                  + Agregar
                </Button>
              </div>
            </div>
          </form>
        </div>
      </Dialog>

      {/* ── Dialog: cobrar ────────────────────────────────── */}
      <Dialog
        open={dlgCobrar}
        onClose={() => setDlgCobrar(false)}
        title={notaActiva ? `Cobrar nota #${String(notaActiva.folio).padStart(4, '0')}` : 'Cobrar'}
        size="md"
      >
        {notaActiva && (
          <div className="space-y-4">
            {/* Resumen */}
            <div className="bg-steel-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-body-sm text-steel-500">
                  {notaActiva.lineas.length} artículo{notaActiva.lineas.length !== 1 ? 's' : ''}
                </span>
                <span className="text-body-sm text-steel-500">Subtotal ${notaActiva.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-body font-semibold text-steel-900">Total a cobrar</span>
                <span className="text-display-sm font-bold text-steel-900">${notaActiva.total.toFixed(2)}</span>
              </div>
              {notaActiva.cliente && (
                <p className="text-meta text-steel-500 mt-1">
                  Cliente: {notaActiva.cliente.razon_social ?? `${notaActiva.cliente.nombre} ${notaActiva.cliente.apellidos ?? ''}`.trim()}
                  {notaActiva.cliente.limite_credito > 0 && (
                    <span className="ml-2 text-steel-400">· límite ${notaActiva.cliente.limite_credito.toFixed(2)}</span>
                  )}
                </p>
              )}
            </div>

            {/* Checkboxes de modo */}
            <div className="grid grid-cols-2 gap-3">
              <label className={cn(
                'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                checkCredito
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-steel-200 hover:border-steel-300 bg-white',
              )}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                  checked={checkCredito}
                  onChange={(e) => {
                    setCheckCredito(e.target.checked);
                    if (e.target.checked) setCheckNotaPorPagar(false);
                  }}
                />
                <div>
                  <p className="text-body-sm font-semibold text-steel-900">A crédito</p>
                  <p className="text-meta text-steel-500">Toda la venta se carga a la cuenta del cliente</p>
                </div>
              </label>
              <label className={cn(
                'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                checkNotaPorPagar
                  ? 'border-steel-600 bg-steel-50'
                  : 'border-steel-200 hover:border-steel-300 bg-white',
              )}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-steel-700"
                  checked={checkNotaPorPagar}
                  onChange={(e) => {
                    setCheckNotaPorPagar(e.target.checked);
                    if (e.target.checked) setCheckCredito(false);
                  }}
                />
                <div>
                  <p className="text-body-sm font-semibold text-steel-900">Nota por pagar</p>
                  <p className="text-meta text-steel-500">Se cobra al entregar; si no paga entra a crédito</p>
                </div>
              </label>
            </div>

            {/* Sección de pagos — solo si ningún check activo */}
            {!checkCredito && !checkNotaPorPagar && (
              <div className="space-y-3">
                {pagos.map((pago, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1">
                      {i === 0 && <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Método</label>}
                      <select
                        className="flex h-9 w-full rounded-md border border-steel-300 bg-white px-3 py-1 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
                        value={pago.metodo}
                        onChange={(e) => {
                          const next = [...pagos];
                          next[i] = { ...next[i], metodo: e.target.value };
                          setPagos(next);
                        }}
                      >
                        {METODOS.map((m) => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
                      </select>
                    </div>
                    <div className="w-32">
                      {i === 0 && <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Monto</label>}
                      <Input
                        type="number" step="0.01" min="0"
                        value={pago.monto}
                        onChange={(e) => {
                          const next = [...pagos];
                          next[i] = { ...next[i], monto: parseFloat(e.target.value) || 0 };
                          setPagos(next);
                        }}
                      />
                    </div>
                    {pago.metodo !== 'EFECTIVO' && (
                      <div className="flex-1">
                        {i === 0 && <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Ref.</label>}
                        <Input
                          placeholder="Últimos 4 / folio…"
                          value={pago.referencia}
                          onChange={(e) => {
                            const next = [...pagos];
                            next[i] = { ...next[i], referencia: e.target.value };
                            setPagos(next);
                          }}
                        />
                      </div>
                    )}
                    {pagos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPagos(pagos.filter((_, idx) => idx !== i))}
                        className="h-9 px-2 text-steel-400 hover:text-brand-600 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPagos([...pagos, { metodo: 'EFECTIVO', monto: 0, referencia: '' }])}
                  className="text-body-sm text-steel-500 hover:text-steel-800 transition-colors"
                >
                  + Agregar forma de pago
                </button>
              </div>
            )}

            {/* Totales — siempre visibles, contenido según modo */}
            <div className="border-t border-steel-100 pt-3 space-y-1">
              {checkCredito ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm text-steel-500">Cobro en efectivo</span>
                    <span className="text-body font-semibold text-steel-400">$0.00</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm text-steel-500">Cargo a cuenta de crédito</span>
                    <span className="text-body font-semibold text-brand-600">${notaActiva.total.toFixed(2)}</span>
                  </div>
                </>
              ) : checkNotaPorPagar ? (
                <div className="flex items-center justify-between">
                  <span className="text-body-sm text-steel-500">Pendiente de cobrar</span>
                  <span className="text-body font-semibold text-steel-700">${notaActiva.total.toFixed(2)}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm text-steel-500">Total pagado</span>
                    <span className={cn('text-body font-semibold', totalPagos >= notaActiva.total ? 'text-steel-900' : 'text-steel-600')}>
                      ${totalPagos.toFixed(2)}
                    </span>
                  </div>
                  {cambio > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm text-steel-500">Cambio</span>
                      <span className="text-body font-semibold text-steel-900">${cambio.toFixed(2)}</span>
                    </div>
                  )}
                  {saldoCredito > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm text-steel-500">Saldo a crédito</span>
                      <span className="text-body font-semibold text-brand-600">${saldoCredito.toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Ticket preview en cobrar */}
            <div>
              <button
                type="button"
                onClick={() => setShowTicketCobrar((v) => !v)}
                className="text-body-sm text-steel-500 hover:text-steel-800 transition-colors underline-offset-2 hover:underline"
              >
                {showTicketCobrar ? 'Ocultar ticket' : 'Ver ticket'}
              </button>
              {showTicketCobrar && (
                <div className="mt-2 border border-steel-200 rounded-xl overflow-hidden bg-white text-[11px] font-mono">
                  {/* Cabecera: logo + nombre empresa + sucursal */}
                  <div className="bg-steel-900 text-white px-4 py-3 text-center">
                    {empresa?.logo_url && (
                      <img src={empresa.logo_url} alt="Logo" className="h-8 w-auto mx-auto mb-1.5 object-contain" />
                    )}
                    <p className="font-bold text-[13px] tracking-wide uppercase">
                      {ubicacion?.razon_social ?? empresa?.nombre ?? 'Empresa'}
                    </p>
                    <p className="text-steel-300 mt-0.5 text-[10px]">{ubicacion?.nombre}</p>
                  </div>
                  {/* Folio y fecha */}
                  <div className="px-4 py-2 border-b border-dashed border-steel-200 flex justify-between text-steel-600">
                    <span>Nota #{String(notaActiva.folio).padStart(4, '0')}</span>
                    <span>{new Date(notaActiva.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                  {/* Datos fiscales de la ubicación */}
                  {(ubicacion?.rfc || ubicacion?.telefono || direccionUbicacion) && (
                    <div className="px-4 py-1.5 border-b border-dashed border-steel-200 text-steel-500 text-[10px] space-y-0.5">
                      {ubicacion?.rfc && (
                        <p>RFC: {ubicacion.rfc}{ubicacion.telefono ? `  ·  Tel: ${ubicacion.telefono}` : ''}</p>
                      )}
                      {!ubicacion?.rfc && ubicacion?.telefono && <p>Tel: {ubicacion.telefono}</p>}
                      {direccionUbicacion && <p>{direccionUbicacion}</p>}
                    </div>
                  )}
                  {notaActiva.cliente && (
                    <div className="px-4 py-2 border-b border-dashed border-steel-200 text-steel-700">
                      <span className="text-steel-400">Cliente: </span>
                      {notaActiva.cliente.razon_social ?? `${notaActiva.cliente.nombre} ${notaActiva.cliente.apellidos ?? ''}`.trim()}
                    </div>
                  )}
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-steel-100 text-steel-400">
                        <th className="px-4 py-1.5 text-left font-medium">Artículo</th>
                        <th className="px-2 py-1.5 text-right font-medium">Cant</th>
                        <th className="px-2 py-1.5 text-right font-medium">Precio</th>
                        <th className="px-4 py-1.5 text-right font-medium">Sub</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notaActiva.lineas.map((l) => {
                        const descs = [l.articulo?.descripcion_1, l.articulo?.descripcion_2, l.articulo?.descripcion_3, l.articulo?.descripcion_4, l.articulo?.descripcion_5].filter((d): d is string => !!d);
                        return (
                          <tr key={l.id} className="border-b border-steel-50">
                            <td className="px-4 py-1.5 text-steel-800">
                              <span className="font-semibold">{l.clave}</span>
                              {descs.length > 0 && (
                                <span className="text-steel-500 block truncate max-w-[160px]">{descs.join(' · ')}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right text-steel-700">{l.cantidad}</td>
                            <td className="px-2 py-1.5 text-right text-steel-700">${l.precio_unitario.toFixed(2)}</td>
                            <td className="px-4 py-1.5 text-right font-semibold text-steel-900">${l.subtotal.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-4 py-2 border-t border-dashed border-steel-300 flex justify-between font-bold text-[13px] text-steel-900">
                    <span>TOTAL</span>
                    <span>${notaActiva.total.toFixed(2)}</span>
                  </div>
                  {checkCredito ? (
                    <div className="px-4 py-1.5 border-t border-dashed border-steel-200 flex justify-between text-steel-500">
                      <span>A CRÉDITO</span>
                      <span>${notaActiva.total.toFixed(2)}</span>
                    </div>
                  ) : checkNotaPorPagar ? (
                    <div className="px-4 py-1.5 border-t border-dashed border-steel-200 flex justify-between text-steel-500">
                      <span>PENDIENTE DE COBRO</span>
                      <span>${notaActiva.total.toFixed(2)}</span>
                    </div>
                  ) : (
                    <>
                      {pagos.filter((p) => p.monto > 0).map((p, i) => (
                        <div key={i} className="px-4 py-1 border-t border-dashed border-steel-200 flex justify-between text-steel-600">
                          <span>{METODO_LABEL[p.metodo] ?? p.metodo}</span>
                          <span>${p.monto.toFixed(2)}</span>
                        </div>
                      ))}
                      {cambio > 0 && (
                        <div className="px-4 py-1 border-t border-dashed border-steel-200 flex justify-between text-steel-500">
                          <span>CAMBIO</span>
                          <span>${cambio.toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="px-4 py-2 text-center text-steel-400 text-[10px]">¡Gracias por su compra!</div>
                </div>
              )}
            </div>

            {/* Banners informativos / errores */}
            {checkCredito && !notaActiva.cliente_id && (
              <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
                <p className="text-body-sm text-brand-600">La nota no tiene cliente asignado. Edítala primero para asignar uno.</p>
              </div>
            )}
            {checkCredito && notaActiva.cliente_id && !excedeLimite && (
              <div className="bg-steel-50 border border-steel-200 rounded-md px-3 py-2">
                <p className="text-body-sm text-steel-600">
                  Se cargará <span className="font-semibold text-steel-900">${notaActiva.total.toFixed(2)}</span> a la cuenta del cliente.
                </p>
              </div>
            )}
            {excedeLimite && (
              <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
                <p className="text-body-sm text-brand-600">
                  Excede el límite de crédito. Saldo actual: ${clienteCredito!.saldo_pendiente.toFixed(2)} · Límite: ${clienteCredito!.limite_credito.toFixed(2)}
                </p>
              </div>
            )}
            {checkNotaPorPagar && (
              <div className="bg-steel-50 border border-steel-200 rounded-md px-3 py-2">
                <p className="text-body-sm text-steel-600">
                  La nota quedará como <span className="font-semibold">Pendiente de pago</span>. Podrás cobrarla desde la lista cuando el cliente pague.
                </p>
              </div>
            )}
            {saldoCredito > 0 && !checkCredito && !checkNotaPorPagar && notaActiva.cliente_id && (
              <div className="bg-steel-50 border border-steel-200 rounded-md px-3 py-2">
                <p className="text-body-sm text-steel-600">
                  El saldo de <span className="font-semibold text-steel-900">${saldoCredito.toFixed(2)}</span> se cargará a la cuenta del cliente.
                </p>
              </div>
            )}
            {saldoCredito > 0 && !checkCredito && !checkNotaPorPagar && !notaActiva.cliente_id && (
              <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
                <p className="text-body-sm text-brand-600">Asigna un cliente a la nota para registrar el saldo restante como crédito, o completa el pago.</p>
              </div>
            )}
            {cobrandoError && (
              <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
                <p className="text-body-sm text-brand-600">{cobrandoError}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDlgCobrar(false)}>Cancelar</Button>
              <Button
                type="button"
                loading={cobrando}
                disabled={!puedeConfirmar}
                onClick={onCobrar}
              >
                {checkNotaPorPagar
                  ? 'Marcar como pendiente'
                  : checkCredito
                  ? 'Cargar a crédito'
                  : saldoCredito > 0
                  ? 'Cobrar y cargar a crédito'
                  : 'Confirmar cobro'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>

      {/* ── Dialog: abonar a crédito ─────────────────────── */}
      <Dialog
        open={!!dlgAbonar}
        onClose={() => setDlgAbonar(null)}
        title={dlgAbonar ? `Abonar — Nota #${String(dlgAbonar.folio).padStart(4, '0')}` : 'Abonar'}
        size="md"
      >
        {dlgAbonar && (() => {
          const pagado = (dlgAbonar.pagos ?? []).reduce((s, p) => s + p.monto, 0);
          const saldoNota = Math.max(0, +(dlgAbonar.total - pagado).toFixed(2));
          const totalAbono = pagosAbono.reduce((s, p) => s + (p.monto || 0), 0);
          return (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-body-sm text-amber-700 font-medium mb-1">
                  {dlgAbonar.cliente
                    ? (dlgAbonar.cliente.razon_social ?? `${dlgAbonar.cliente.nombre} ${dlgAbonar.cliente.apellidos ?? ''}`.trim())
                    : 'Mostrador'}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-body-sm text-amber-700">Total de la nota</span>
                  <span className="text-body font-semibold text-amber-900">${dlgAbonar.total.toFixed(2)}</span>
                </div>
                {pagado > 0 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-body-sm text-amber-600">Ya pagado</span>
                    <span className="text-body-sm text-amber-600">−${pagado.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between mt-1 pt-1 border-t border-amber-200">
                  <span className="text-body font-semibold text-amber-900">Saldo pendiente</span>
                  <span className="text-display-sm font-bold text-amber-700">${saldoNota.toFixed(2)}</span>
                </div>
              </div>

              {/* Formas de pago */}
              <div className="space-y-3">
                {pagosAbono.map((pago, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1">
                      {i === 0 && <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Método</label>}
                      <select
                        className="flex h-9 w-full rounded-md border border-steel-300 bg-white px-3 py-1 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
                        value={pago.metodo}
                        onChange={(e) => {
                          const next = [...pagosAbono];
                          next[i] = { ...next[i], metodo: e.target.value };
                          setPagosAbono(next);
                        }}
                      >
                        {METODOS.map((m) => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
                      </select>
                    </div>
                    <div className="w-32">
                      {i === 0 && <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Monto</label>}
                      <Input
                        type="number" step="0.01" min="0"
                        value={pago.monto}
                        onChange={(e) => {
                          const next = [...pagosAbono];
                          next[i] = { ...next[i], monto: parseFloat(e.target.value) || 0 };
                          setPagosAbono(next);
                        }}
                      />
                    </div>
                    {pago.metodo !== 'EFECTIVO' && (
                      <div className="flex-1">
                        {i === 0 && <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Ref.</label>}
                        <Input
                          placeholder="Últimos 4 / folio…"
                          value={pago.referencia}
                          onChange={(e) => {
                            const next = [...pagosAbono];
                            next[i] = { ...next[i], referencia: e.target.value };
                            setPagosAbono(next);
                          }}
                        />
                      </div>
                    )}
                    {pagosAbono.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPagosAbono(pagosAbono.filter((_, idx) => idx !== i))}
                        className="h-9 px-2 text-steel-400 hover:text-brand-600 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPagosAbono([...pagosAbono, { metodo: 'EFECTIVO', monto: 0, referencia: '' }])}
                  className="text-body-sm text-steel-500 hover:text-steel-800 transition-colors"
                >
                  + Agregar forma de pago
                </button>
              </div>

              {/* Resumen del abono */}
              <div className="border-t border-steel-100 pt-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-body-sm text-steel-500">Total a abonar</span>
                  <span className={cn('text-body font-semibold', totalAbono > saldoNota ? 'text-amber-600' : 'text-steel-900')}>
                    ${totalAbono.toFixed(2)}
                  </span>
                </div>
                {totalAbono >= saldoNota && saldoNota > 0 && (
                  <p className="text-body-sm text-green-600 font-medium">✓ La nota quedará como pagada</p>
                )}
                {totalAbono > saldoNota && (
                  <p className="text-meta text-amber-600">El excedente no se aplica — el abono máximo es ${saldoNota.toFixed(2)}</p>
                )}
              </div>

              {/* Vista previa del ticket de abono */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowTicketAbonar((v) => !v)}
                  className="text-body-sm text-steel-500 hover:text-steel-800 transition-colors underline-offset-2 hover:underline"
                >
                  {showTicketAbonar ? 'Ocultar ticket' : 'Ver ticket'}
                </button>
                {showTicketAbonar && (
                  <div className="mt-2 border border-steel-200 rounded-xl overflow-hidden bg-white text-[11px] font-mono">
                    {/* Cabecera empresa */}
                    <div className="bg-steel-900 text-white px-4 py-3 text-center">
                      {empresa?.logo_url && (
                        <img src={empresa.logo_url} alt="Logo" className="h-8 w-auto mx-auto mb-1.5 object-contain" />
                      )}
                      <p className="font-bold text-[13px] tracking-wide uppercase">
                        {ubicacion?.razon_social ?? empresa?.nombre ?? 'Empresa'}
                      </p>
                      <p className="text-steel-300 mt-0.5 text-[10px]">{ubicacion?.nombre}</p>
                    </div>
                    {/* Folio + fecha */}
                    <div className="px-4 py-2 border-b border-dashed border-steel-200 flex justify-between text-steel-600">
                      <span className="font-semibold">Nota #{String(dlgAbonar.folio).padStart(4, '0')}</span>
                      <span>{new Date(dlgAbonar.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                    {/* Cliente */}
                    {dlgAbonar.cliente && (
                      <div className="px-4 py-1.5 border-b border-dashed border-steel-200 text-steel-600">
                        <span className="text-steel-400">Cliente: </span>
                        {dlgAbonar.cliente.razon_social ?? `${dlgAbonar.cliente.nombre} ${dlgAbonar.cliente.apellidos ?? ''}`.trim()}
                      </div>
                    )}
                    {/* Total de la nota */}
                    <div className="px-4 py-2 flex justify-between font-bold text-[13px] text-steel-900">
                      <span>TOTAL NOTA</span>
                      <span>${dlgAbonar.total.toFixed(2)}</span>
                    </div>
                    {/* Separador */}
                    <div className="px-4"><div className="border-t border-dashed border-steel-300" /></div>
                    {/* Abono registrado */}
                    {pagosAbono.filter((p) => p.monto > 0).length > 0 && (
                      <>
                        <div className="px-4 pt-1.5 pb-0.5 text-steel-500 font-semibold text-[10px] uppercase tracking-[1px]">Abono:</div>
                        {pagosAbono.filter((p) => p.monto > 0).map((p, i) => (
                          <div key={i} className="px-4 py-0.5 flex justify-between text-steel-700">
                            <span>{METODO_LABEL[p.metodo] ?? p.metodo}</span>
                            <span>${p.monto.toFixed(2)}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {/* Estatus resultante */}
                    {totalAbono >= saldoNota && saldoNota > 0 ? (
                      <div className="px-4 py-2 text-center font-bold text-green-700 text-[12px]">*** PAGADA ***</div>
                    ) : totalAbono > 0 ? (
                      <div className="px-4 py-1.5 flex justify-between text-amber-700 font-semibold">
                        <span>SALDO PENDIENTE</span>
                        <span>${(saldoNota - Math.min(totalAbono, saldoNota)).toFixed(2)}</span>
                      </div>
                    ) : null}
                    <div className="px-4 py-2 text-center text-steel-400 text-[10px]">¡Gracias por su pago!</div>
                  </div>
                )}
              </div>

              {abonandoError && (
                <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
                  <p className="text-body-sm text-brand-600">{abonandoError}</p>
                </div>
              )}

              <DialogFooter>
                <Button variant="secondary" onClick={() => setDlgAbonar(null)}>Cancelar</Button>
                <Button
                  loading={abonando}
                  disabled={totalAbono <= 0}
                  onClick={onAbonar}
                  className="bg-amber-500 hover:bg-amber-600 border-amber-500"
                >
                  Registrar abono
                </Button>
              </DialogFooter>
            </div>
          );
        })()}
      </Dialog>

      {/* ── Dialog: reimprimir / reenviar ────────────────── */}
      <Dialog
        open={!!dlgReimprimir}
        onClose={() => setDlgReimprimir(null)}
        title={`Ticket — Nota #${String(dlgReimprimir?.folio ?? 0).padStart(4, '0')}`}
        size="sm"
      >
        {dlgReimprimir && (
          <div className="space-y-2">
            <p className="text-body-sm text-steel-500 mb-3">
              {dlgReimprimir.cliente
                ? (dlgReimprimir.cliente.razon_social ?? `${dlgReimprimir.cliente.nombre} ${dlgReimprimir.cliente.apellidos ?? ''}`.trim())
                : 'Mostrador'}
              {' · '}
              <span className="font-semibold text-steel-700">${dlgReimprimir.total.toFixed(2)}</span>
            </p>
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                const pagosImp = (dlgReimprimir.pagos ?? []).map((p) => ({
                  metodo: p.metodo, monto: p.monto, referencia: p.referencia ?? '',
                }));
                const sumaP = pagosImp.reduce((s, p) => s + p.monto, 0);
                const cambioImp = Math.max(0, +(sumaP - dlgReimprimir.total).toFixed(2));
                const tipoCierreImp = dlgReimprimir.estatus === 'CREDITO' ? 'CREDITO'
                  : dlgReimprimir.estatus === 'PENDIENTE' ? 'PENDIENTE' : 'PAGADA';
                void printTicket(dlgReimprimir, tipoCierreImp, pagosImp, cambioImp);
                setDlgReimprimir(null);
              }}
            >
              🖨️ Reimprimir ticket (ticketera)
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                const pagosImp = (dlgReimprimir.pagos ?? []).map((p) => ({
                  metodo: METODO_LABEL[p.metodo] ?? p.metodo, monto: p.monto,
                }));
                const sumaP = pagosImp.reduce((s, p) => s + p.monto, 0);
                setEmailDest(dlgReimprimir.cliente?.email ?? '');
                setEmailError(null);
                setEmailOk(false);
                setPostCobro({
                  nota: dlgReimprimir,
                  tipoCierre: dlgReimprimir.estatus,
                  pagos: (dlgReimprimir.pagos ?? []).map((p) => ({
                    metodo: p.metodo, monto: p.monto, referencia: p.referencia ?? '',
                  })),
                  cambio: Math.max(0, +(sumaP - dlgReimprimir.total).toFixed(2)),
                });
                setDlgEmail('ticket');
                setDlgReimprimir(null);
              }}
            >
              ✉️ Reenviar por correo
            </Button>
            <Button variant="ghost" className="w-full text-steel-400" onClick={() => setDlgReimprimir(null)}>
              Cancelar
            </Button>
          </div>
        )}
      </Dialog>

      {/* ── Dialog: enviar por correo ─────────────────────── */}
      <Dialog
        open={!!dlgEmail}
        onClose={() => { setDlgEmail(null); setEmailOk(false); setEmailError(null); }}
        title={dlgEmail === 'cotizacion' ? 'Enviar cotización por correo' : 'Enviar comprobante por correo'}
        size="sm"
      >
        <div className="space-y-4">
          {emailOk ? (
            <div className="text-center py-6">
              <p className="text-display-sm text-green-600 font-bold mb-1">✅ Enviado</p>
              <p className="text-body-sm text-steel-500">El correo fue enviado a <strong>{emailDest}</strong>.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Correo destino</label>
                <Input
                  type="email"
                  placeholder="cliente@empresa.com"
                  value={emailDest}
                  onChange={(e) => setEmailDest(e.target.value)}
                />
              </div>
              {emailError && (
                <p className="text-body-sm text-brand-600">{emailError}</p>
              )}
              <DialogFooter>
                <Button variant="secondary" onClick={() => { setDlgEmail(null); setEmailError(null); }}>
                  Cancelar
                </Button>
                <Button
                  disabled={!emailDest || sendingEmail}
                  onClick={() => {
                    const nota = postCobro?.nota ?? notaActiva;
                    if (!nota || !dlgEmail) return;
                    void sendEmailNota(nota, dlgEmail, emailDest, postCobro ? {
                      pagos: postCobro.pagos.filter((p) => p.monto > 0).map((p) => ({ metodo: METODO_LABEL[p.metodo] ?? p.metodo, monto: p.monto })),
                      cambio: postCobro.cambio,
                      tipo_cierre: postCobro.tipoCierre,
                    } : undefined);
                  }}
                >
                  {sendingEmail ? 'Enviando…' : '✉️ Enviar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </Dialog>

      {/* ── Dialog: comprobante post-cobro ────────────────── */}
      <Dialog
        open={!!postCobro}
        onClose={() => setPostCobro(null)}
        title="Comprobante"
        size="sm"
      >
        {postCobro && (() => {
          const totalAbonado = postCobro.pagos.filter((p) => p.monto > 0).reduce((s, p) => s + p.monto, 0);
          const totalPagadoNota = (postCobro.nota.pagos ?? []).reduce((s, p) => s + p.monto, 0);
          const saldoRestante = Math.max(0, +(postCobro.nota.total - totalPagadoNota).toFixed(2));
          const esAbono = postCobro.tipoCierre === 'CREDITO' || (postCobro.tipoCierre === 'PAGADA' && totalAbonado < postCobro.nota.total);
          return (
          <div className="space-y-3">
            <div className="bg-steel-50 rounded-xl px-4 py-3 text-body-sm">
              <p className="text-steel-700 mb-1">
                Nota <strong>#{String(postCobro.nota.folio).padStart(4, '0')}</strong>
                {' · '}Total <strong>${postCobro.nota.total.toFixed(2)}</strong>
              </p>
              {esAbono && totalAbonado > 0 && (
                <p className="text-green-700">Abono registrado: <strong>${totalAbonado.toFixed(2)}</strong></p>
              )}
              {postCobro.tipoCierre === 'CREDITO' && saldoRestante > 0 ? (
                <p className="text-amber-700 font-semibold">Saldo pendiente: ${saldoRestante.toFixed(2)} — Estatus: CRÉDITO</p>
              ) : (
                <p className="text-green-700 font-semibold">✓ Nota liquidada — Estatus: PAGADA</p>
              )}
            </div>
            <p className="text-body-sm text-steel-500">¿Cómo deseas entregar el comprobante?</p>
            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="secondary"
                className="justify-start"
                onClick={() => {
                  void printTicket(postCobro.nota, postCobro.tipoCierre as 'PAGADA' | 'CREDITO' | 'PENDIENTE', postCobro.pagos, postCobro.cambio);
                  setPostCobro(null);
                }}
              >
                🖨️ Imprimir ticket (ticketera)
              </Button>
              <Button
                variant="secondary"
                className="justify-start"
                onClick={() => {
                  setEmailDest(postCobro.nota.cliente?.email ?? '');
                  setEmailError(null);
                  setEmailOk(false);
                  setDlgEmail('ticket');
                }}
              >
                ✉️ Enviar por correo electrónico
              </Button>
              <Button
                variant="ghost"
                className="justify-start text-steel-400"
                onClick={() => setPostCobro(null)}
              >
                Omitir
              </Button>
            </div>
          </div>
          );
        })()}
      </Dialog>
    </div>
  );
}
