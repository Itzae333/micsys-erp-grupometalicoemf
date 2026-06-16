'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, ChevronLeft, ChevronRight, ClipboardList, Trash2, Pencil, Check, X, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import type { PedidosPage, Pedido, PedidoLinea, Cliente, Articulo, ArticulosPage, ConfigColumnasSchema, RegistrarAnticipoResult, LiquidarPedidoResult } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn, formatPrecio } from '@/lib/utils';
import { getTicketLogoUrl, logoToEscPosBase64 } from '@/lib/utils/ticket-logo';

// ── Estatus ──────────────────────────────────────────────────
const ESTATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'paid' | 'credit' | 'pending' | 'cancelled' | 'cargada' }> = {
  ABIERTO:   { label: 'Abierto',   variant: 'pending' },
  PARCIAL:   { label: 'Parcial',   variant: 'credit' },
  LIQUIDADO: { label: 'Liquidado', variant: 'paid' },
  CANCELADO: { label: 'Cancelado', variant: 'cancelled' },
};

const METODOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'] as const;
const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
};

function formatMoney(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type PagoForm = { metodo: string; monto: number; referencia: string };

function initPagos(): PagoForm[] {
  return [{ metodo: 'EFECTIVO', monto: 0, referencia: '' }];
}

export default function PedidosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { usuario } = useAuthStore();
  const { empresa, ubicacion } = useContextoStore();

  // ── Lista pedidos ───────────────────────────────────────────
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estatusFiltro, setEstatusFiltro] = useState('');

  // ── Pedido activo ───────────────────────────────────────────
  const [pedidoActivo, setPedidoActivo] = useState<Pedido | null>(null);

  // ── Dialog nuevo pedido ─────────────────────────────────────
  const [dlgNuevo, setDlgNuevo] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [clienteQ, setClienteQ] = useState('');
  const [obsNuevo, setObsNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);

  // ── Dialog agregar línea ────────────────────────────────────
  const [dlgLinea, setDlgLinea] = useState(false);
  const [artQ, setArtQ] = useState('');
  const [artSugeridos, setArtSugeridos] = useState<Articulo[]>([]);
  const [artSeleccionado, setArtSeleccionado] = useState<Articulo | null>(null);
  const [schema, setSchema] = useState<ConfigColumnasSchema | null>(null);
  const [lineaCantidad, setLineaCantidad] = useState('1');
  const [lineaPrecio, setLineaPrecio] = useState('');
  const [lineaDescuento, setLineaDescuento] = useState('0');
  const [lineaError, setLineaError] = useState<string | null>(null);
  const [addingLinea, setAddingLinea] = useState(false);

  // ── Inline edit líneas ──────────────────────────────────────
  const [lineaDraft, setLineaDraft] = useState<Record<string, { cantidad: string; precio: string }>>({});
  const [savingLinea, setSavingLinea] = useState<string | null>(null);

  // ── Dialog anticipo ─────────────────────────────────────────
  const [dlgAnticipo, setDlgAnticipo] = useState(false);
  const [pagosAnticipo, setPagosAnticipo] = useState<PagoForm[]>(initPagos());
  const [registrandoAnticipo, setRegistrandoAnticipo] = useState(false);
  const [errorAnticipo, setErrorAnticipo] = useState<string | null>(null);

  // ── Dialog liquidar ─────────────────────────────────────────
  const [dlgLiquidar, setDlgLiquidar] = useState(false);
  const [pagosLiquidar, setPagosLiquidar] = useState<PagoForm[]>(initPagos());
  const [liquidando, setLiquidando] = useState(false);
  const [errorLiquidar, setErrorLiquidar] = useState<string | null>(null);

  // ── Debounce arts ───────────────────────────────────────────
  const artDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Cargar pedidos ──────────────────────────────────────────
  const loadPedidos = useCallback(async (p = page, filtro = estatusFiltro, busq = q) => {
    if (!empresa) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: '50',
        ...(filtro ? { estatus: filtro } : {}),
        ...(busq ? { q: busq } : {}),
        ...(ubicacion ? { ubicacionId: ubicacion.id } : {}),
      });
      const res = await api.get<PedidosPage>(`/pedidos?${params}`);
      setPedidos(res.data);
      setTotal(res.total);
      setPages(res.pages);
    } finally {
      setLoading(false);
    }
  }, [empresa, ubicacion, page, estatusFiltro, q]);

  useEffect(() => { loadPedidos(1, estatusFiltro, q); setPage(1); }, [empresa, ubicacion]);

  // ── Buscar en lista ─────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); loadPedidos(1, estatusFiltro, q); }, 350);
    return () => clearTimeout(t);
  }, [q, estatusFiltro]);

  // ── Auto-crear pedido desde clientes page ───────────────────
  useEffect(() => {
    const clienteId = searchParams.get('cliente_id');
    if (!clienteId || !empresa) return;
    router.replace('/pedidos');
    api.post<Pedido>('/pedidos', { cliente_id: clienteId }).then((p) => {
      setPedidos((prev) => [p, ...prev]);
      setPedidoActivo(p);
    }).catch(() => null);
  }, [empresa, searchParams]);

  // ── Cargar schema columnas ──────────────────────────────────
  useEffect(() => {
    if (!empresa || !ubicacion) return;
    api.get<ConfigColumnasSchema>('/config-columnas/schema')
      .then(setSchema).catch(() => null);
  }, [empresa, ubicacion]);

  // ── Cargar clientes ─────────────────────────────────────────
  useEffect(() => {
    if (!dlgNuevo || !empresa) return;
    api.get<{ data: Cliente[] }>('/clientes?limit=200')
      .then((r) => setClientes(r.data)).catch(() => null);
  }, [dlgNuevo, empresa]);

  // ── Buscar artículos con debounce ───────────────────────────
  useEffect(() => {
    if (!dlgLinea) return;
    if (artDebounceRef.current) clearTimeout(artDebounceRef.current);
    if (!artQ.trim() || artQ.length < 2) { setArtSugeridos([]); return; }
    artDebounceRef.current = setTimeout(async () => {
      if (!empresa) return;
      const res = await api.get<ArticulosPage>(`/articulos?q=${encodeURIComponent(artQ)}&limit=10`);
      setArtSugeridos(res.data);
    }, 300);
    return () => { if (artDebounceRef.current) clearTimeout(artDebounceRef.current); };
  }, [artQ, dlgLinea, empresa]);

  // ── Refrescar pedido activo ─────────────────────────────────
  const refreshActivo = useCallback(async (id: string) => {
    if (!empresa) return;
    const p = await api.get<Pedido>(`/pedidos/${id}`);
    setPedidoActivo(p);
    setPedidos((prev) => prev.map((x) => x.id === id ? p : x));
  }, [empresa]);

  // ── Seleccionar precio del artículo ────────────────────────
  function precioDeArticulo(art: Articulo): number {
    if (!schema || !schema.precios || schema.precios.length === 0) return 0;
    const col = schema.precios[0];
    const key = `precio_${col.numero}` as keyof Articulo;
    return Number(art[key] ?? 0);
  }

  // ── Crear pedido ────────────────────────────────────────────
  async function handleCrearPedido() {
    if (!clienteSeleccionado) { setErrorNuevo('Selecciona un cliente'); return; }
    setCreando(true); setErrorNuevo(null);
    try {
      const p = await api.post<Pedido>('/pedidos', {
        cliente_id: clienteSeleccionado.id,
        observaciones: obsNuevo || undefined,
      });
      setPedidos((prev) => [p, ...prev]);
      setPedidoActivo(p);
      setDlgNuevo(false);
      setClienteSeleccionado(null); setClienteQ(''); setObsNuevo('');
    } catch (e: any) {
      setErrorNuevo(e?.message ?? 'Error al crear pedido');
    } finally {
      setCreando(false);
    }
  }

  // ── Agregar línea ───────────────────────────────────────────
  async function handleAddLinea() {
    if (!pedidoActivo || !artSeleccionado) { setLineaError('Selecciona un artículo'); return; }
    const cant = parseFloat(lineaCantidad);
    const precio = parseFloat(lineaPrecio);
    if (isNaN(cant) || cant <= 0) { setLineaError('Cantidad inválida'); return; }
    if (isNaN(precio) || precio < 0) { setLineaError('Precio inválido'); return; }

    setAddingLinea(true); setLineaError(null);
    try {
      await api.post(`/pedidos/${pedidoActivo.id}/lineas`, {
        articulo_id: artSeleccionado.id,
        cantidad: cant,
        precio_unitario: precio,
        descuento: parseFloat(lineaDescuento) || 0,
      });
      await refreshActivo(pedidoActivo.id);
      setDlgLinea(false);
      setArtQ(''); setArtSugeridos([]); setArtSeleccionado(null);
      setLineaCantidad('1'); setLineaPrecio(''); setLineaDescuento('0');
    } catch (e: any) {
      setLineaError(e?.message ?? 'Error al agregar línea');
    } finally {
      setAddingLinea(false);
    }
  }

  // ── Eliminar línea ──────────────────────────────────────────
  async function handleRemoveLinea(lineaId: string) {
    if (!pedidoActivo) return;
    await api.delete(`/pedidos/${pedidoActivo.id}/lineas/${lineaId}`);
    await refreshActivo(pedidoActivo.id);
  }

  // ── Guardar inline ──────────────────────────────────────────
  async function handleSaveLinea(linea: PedidoLinea) {
    if (!pedidoActivo) return;
    const draft = lineaDraft[linea.id];
    if (!draft) return;
    setSavingLinea(linea.id);
    try {
      await api.patch(`/pedidos/${pedidoActivo.id}/lineas/${linea.id}`, {
        cantidad: parseFloat(draft.cantidad) || linea.cantidad,
        precio_unitario: parseFloat(draft.precio) || linea.precio_unitario,
      });
      await refreshActivo(pedidoActivo.id);
      setLineaDraft((prev) => { const n = { ...prev }; delete n[linea.id]; return n; });
    } finally {
      setSavingLinea(null);
    }
  }

  // ── Imprimir ticket ─────────────────────────────────────────
  async function printTicket(payload: Record<string, unknown>, copias = 1) {
    try {
      const logoUrl = getTicketLogoUrl(ubicacion, empresa);
      let escpos: string | undefined;
      if (logoUrl) { try { escpos = (await logoToEscPosBase64(logoUrl as string)) ?? undefined; } catch { /* sin logo */ } }
      await fetch('http://localhost:7788/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          copias,
          empresa: { nombre: empresa?.nombre ?? '' },
          ubicacion: ubicacion ? {
            nombre: ubicacion.nombre, razon_social: ubicacion.razon_social,
            rfc: ubicacion.rfc, telefono: ubicacion.telefono,
            calle: ubicacion.calle, num_ext: ubicacion.num_ext,
            colonia: ubicacion.colonia, municipio: ubicacion.municipio,
            estado: ubicacion.estado, cp: ubicacion.cp,
          } : {},
          ...(escpos ? { logo_escpos_b64: escpos } : {}),
        }),
      });
    } catch {
      // print bridge no disponible, ignorar silenciosamente
    }
  }

  // ── Registrar anticipo ──────────────────────────────────────
  async function handleRegistrarAnticipo() {
    if (!pedidoActivo) return;
    const pagosValidos = pagosAnticipo.filter((p) => p.monto > 0);
    if (pagosValidos.length === 0) { setErrorAnticipo('Ingresa al menos un pago'); return; }
    setRegistrandoAnticipo(true); setErrorAnticipo(null);
    try {
      const res = await api.post<RegistrarAnticipoResult>(`/pedidos/${pedidoActivo.id}/anticipos`, {
        pagos: pagosValidos.map((p) => ({
          metodo: p.metodo,
          monto: p.monto,
          ...(p.referencia ? { referencia: p.referencia } : {}),
        })),
      });
      setPedidoActivo(res.pedido);
      setPedidos((prev) => prev.map((x) => x.id === res.pedido.id ? res.pedido : x));
      await printTicket(res.ticket);
      setDlgAnticipo(false);
      setPagosAnticipo(initPagos());
    } catch (e: any) {
      setErrorAnticipo(e?.message ?? 'Error al registrar anticipo');
    } finally {
      setRegistrandoAnticipo(false);
    }
  }

  // ── Liquidar pedido ─────────────────────────────────────────
  async function handleLiquidar() {
    if (!pedidoActivo) return;
    const saldo = pedidoActivo.saldo_pendiente;
    const pagosValidos = pagosLiquidar.filter((p) => p.monto > 0);
    if (saldo > 0.01 && pagosValidos.reduce((s, p) => s + p.monto, 0) < saldo - 0.01) {
      setErrorLiquidar(`Saldo pendiente $${formatMoney(saldo)}. Agrega pagos para cubrirlo.`);
      return;
    }
    setLiquidando(true); setErrorLiquidar(null);
    try {
      const res = await api.post<LiquidarPedidoResult>(`/pedidos/${pedidoActivo.id}/liquidar`, {
        pagos: pagosValidos.map((p) => ({
          metodo: p.metodo, monto: p.monto,
          ...(p.referencia ? { referencia: p.referencia } : {}),
        })),
      });
      await printTicket(res.ticket);
      await refreshActivo(pedidoActivo.id);
      setDlgLiquidar(false);
      setPagosLiquidar(initPagos());
    } catch (e: any) {
      setErrorLiquidar(e?.message ?? 'Error al liquidar pedido');
    } finally {
      setLiquidando(false);
    }
  }

  // ── Cancelar pedido ─────────────────────────────────────────
  async function handleCancelar() {
    if (!pedidoActivo) return;
    if (!confirm(`¿Cancelar pedido #${pedidoActivo.folio}?`)) return;
    await api.patch(`/pedidos/${pedidoActivo.id}/cancelar`, {});
    await refreshActivo(pedidoActivo.id);
  }

  const canEdit = pedidoActivo?.estatus === 'ABIERTO' || pedidoActivo?.estatus === 'PARCIAL';

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Panel izquierdo — Lista ── */}
      <div className="w-80 flex-shrink-0 border-r border-steel-200 flex flex-col bg-white">
        {/* Header */}
        <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
          <h1 className="text-display-sm font-bold text-steel-900">Pedidos</h1>
          <Button size="sm" onClick={() => setDlgNuevo(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo
          </Button>
        </div>

        {/* Filtros */}
        <div className="px-3 py-2 border-b border-steel-100 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
            <Input
              className="pl-8 h-8 text-body-sm"
              placeholder="Buscar folio o cliente..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(['', 'ABIERTO', 'PARCIAL', 'LIQUIDADO', 'CANCELADO'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setEstatusFiltro(s)}
                className={cn(
                  'px-2 py-0.5 rounded text-meta font-medium transition-colors',
                  estatusFiltro === s
                    ? 'bg-brand-600 text-white'
                    : 'bg-steel-100 text-steel-600 hover:bg-steel-200',
                )}
              >
                {s === '' ? 'Todos' : ESTATUS_CONFIG[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-steel-100 rounded animate-pulse" />)}
            </div>
          ) : pedidos.length === 0 ? (
            <div className="p-6 text-center">
              <ClipboardList className="h-8 w-8 text-steel-300 mx-auto mb-2" />
              <p className="text-body-sm text-steel-500">Sin pedidos</p>
            </div>
          ) : (
            pedidos.map((p) => {
              const est = ESTATUS_CONFIG[p.estatus] ?? { label: p.estatus, variant: 'default' as const };
              const clienteNombre = p.cliente
                ? (p.cliente.razon_social ?? `${p.cliente.nombre}${p.cliente.apellidos ? ' ' + p.cliente.apellidos : ''}`)
                : '—';
              return (
                <button
                  key={p.id}
                  onClick={() => setPedidoActivo(p)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b border-steel-50 transition-colors',
                    pedidoActivo?.id === p.id
                      ? 'bg-brand-50 border-l-2 border-l-brand-600'
                      : 'hover:bg-steel-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-steel-900">
                        #{String(p.folio).padStart(4, '0')}
                      </p>
                      <p className="text-body-sm text-steel-600 truncate">{clienteNombre}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <Badge variant={est.variant as any}>{est.label}</Badge>
                      <p className="text-meta text-steel-500 mt-0.5">${formatMoney(p.total)}</p>
                    </div>
                  </div>
                  {p.saldo_pendiente > 0 && (
                    <p className="text-meta text-amber-600 mt-1">
                      Saldo: ${formatMoney(p.saldo_pendiente)}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Paginación */}
        {pages > 1 && (
          <div className="p-3 border-t border-steel-100 flex items-center justify-between">
            <button
              disabled={page === 1}
              onClick={() => { const p = page - 1; setPage(p); loadPedidos(p); }}
              className="p-1 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-meta text-steel-500">{page} / {pages}</span>
            <button
              disabled={page === pages}
              onClick={() => { const p = page + 1; setPage(p); loadPedidos(p); }}
              className="p-1 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Panel derecho — Detalle ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-steel-50">
        {!pedidoActivo ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<ClipboardList className="h-10 w-10" />}
              title="Selecciona un pedido"
              description="O crea uno nuevo con el botón +"
            />
          </div>
        ) : (
          <>
            {/* Header detalle */}
            <div className="bg-white border-b border-steel-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-display-sm font-bold text-steel-900">
                      Pedido #{String(pedidoActivo.folio).padStart(4, '0')}
                    </h2>
                    <Badge variant={ESTATUS_CONFIG[pedidoActivo.estatus]?.variant as any}>
                      {ESTATUS_CONFIG[pedidoActivo.estatus]?.label}
                    </Badge>
                  </div>
                  <p className="text-body-sm text-steel-500 mt-0.5">
                    {pedidoActivo.cliente?.razon_social ?? `${pedidoActivo.cliente?.nombre ?? ''}${pedidoActivo.cliente?.apellidos ? ' ' + pedidoActivo.cliente.apellidos : ''}`}
                    {pedidoActivo.cliente?.telefono ? ` · ${pedidoActivo.cliente.telefono}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  {canEdit && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => { setDlgAnticipo(true); setErrorAnticipo(null); setPagosAnticipo(initPagos()); }}>
                        Registrar anticipo
                      </Button>
                      {pedidoActivo.estatus === 'CANCELADO' ? null : (
                        <Button size="sm" onClick={() => { setDlgLiquidar(true); setErrorLiquidar(null); setPagosLiquidar(initPagos()); }}>
                          Liquidar pedido
                        </Button>
                      )}
                    </>
                  )}
                  {pedidoActivo.estatus === 'LIQUIDADO' && (
                    <span className="text-body-sm text-emerald-600 font-medium self-center">✓ Liquidado</span>
                  )}
                  {pedidoActivo.estatus === 'PARCIAL' && pedidoActivo.saldo_pendiente <= 0.01 && (
                    <Button size="sm" onClick={() => { setDlgLiquidar(true); setErrorLiquidar(null); setPagosLiquidar(initPagos()); }}>
                      Liquidar pedido
                    </Button>
                  )}
                  {(pedidoActivo.estatus === 'ABIERTO' || pedidoActivo.estatus === 'PARCIAL') && pedidoActivo.anticipos.length === 0 && (
                    <Button size="sm" variant="destructive" onClick={handleCancelar}>Cancelar</Button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* ── Líneas ── */}
              <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-steel-100">
                  <h3 className="text-body font-semibold text-steel-800">Artículos</h3>
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => { setDlgLinea(true); setLineaError(null); }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
                    </Button>
                  )}
                </div>
                {pedidoActivo.lineas.length === 0 ? (
                  <p className="text-body-sm text-steel-400 text-center py-6">Sin líneas. Agrega artículos al pedido.</p>
                ) : (
                  <table className="w-full text-body-sm">
                    <thead>
                      <tr className="border-b border-steel-100 bg-steel-50">
                        <th className="text-left px-4 py-2 text-table-header text-steel-500 font-semibold uppercase tracking-wide">Artículo</th>
                        <th className="text-right px-3 py-2 text-table-header text-steel-500 font-semibold uppercase tracking-wide w-20">Cant.</th>
                        <th className="text-right px-3 py-2 text-table-header text-steel-500 font-semibold uppercase tracking-wide w-28">Precio</th>
                        <th className="text-right px-3 py-2 text-table-header text-steel-500 font-semibold uppercase tracking-wide w-28">Subtotal</th>
                        {canEdit && <th className="w-16" />}
                      </tr>
                    </thead>
                    <tbody>
                      {pedidoActivo.lineas.map((l) => {
                        const draft = lineaDraft[l.id];
                        const isSaving = savingLinea === l.id;
                        return (
                          <tr key={l.id} className="border-b border-steel-50 hover:bg-steel-50">
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-steel-900">{l.clave}</p>
                              <p className="text-meta text-steel-500 truncate max-w-xs">{l.descripcion}</p>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {draft && canEdit ? (
                                <Input
                                  className="h-7 w-20 text-right"
                                  value={draft.cantidad}
                                  onChange={(e) => setLineaDraft((prev) => ({ ...prev, [l.id]: { ...prev[l.id], cantidad: e.target.value } }))}
                                />
                              ) : (
                                <span
                                  className={cn('cursor-pointer hover:underline', canEdit && 'text-brand-600')}
                                  onClick={() => canEdit && setLineaDraft((prev) => ({ ...prev, [l.id]: { cantidad: String(l.cantidad), precio: String(l.precio_unitario) } }))}
                                >
                                  {l.cantidad}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {draft && canEdit ? (
                                <Input
                                  className="h-7 w-28 text-right"
                                  value={draft.precio}
                                  onChange={(e) => setLineaDraft((prev) => ({ ...prev, [l.id]: { ...prev[l.id], precio: e.target.value } }))}
                                />
                              ) : (
                                <span
                                  className={cn('cursor-pointer hover:underline', canEdit && 'text-brand-600')}
                                  onClick={() => canEdit && setLineaDraft((prev) => ({ ...prev, [l.id]: { cantidad: String(l.cantidad), precio: String(l.precio_unitario) } }))}
                                >
                                  ${formatMoney(l.precio_unitario)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">${formatMoney(l.subtotal)}</td>
                            {canEdit && (
                              <td className="px-3 py-2">
                                {draft ? (
                                  <div className="flex gap-1 justify-end">
                                    <button
                                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                      onClick={() => handleSaveLinea(l)}
                                      disabled={isSaving}
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      className="p-1 text-steel-400 hover:bg-steel-100 rounded"
                                      onClick={() => setLineaDraft((prev) => { const n = { ...prev }; delete n[l.id]; return n; })}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="p-1 text-rose-400 hover:bg-rose-50 rounded"
                                    onClick={() => handleRemoveLinea(l.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* Totales */}
                <div className="border-t border-steel-200 px-4 py-3 bg-steel-50 space-y-1">
                  <div className="flex justify-between text-body-sm text-steel-600">
                    <span>Total pedido</span>
                    <span className="font-semibold text-steel-900">${formatMoney(pedidoActivo.total)}</span>
                  </div>
                  <div className="flex justify-between text-body-sm text-emerald-700">
                    <span>Total anticipos</span>
                    <span className="font-semibold">-${formatMoney(pedidoActivo.total_anticipos)}</span>
                  </div>
                  <div className="flex justify-between text-body font-bold border-t border-steel-200 pt-1 mt-1">
                    <span className={pedidoActivo.saldo_pendiente > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                      Saldo pendiente
                    </span>
                    <span className={pedidoActivo.saldo_pendiente > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                      ${formatMoney(Math.max(0, pedidoActivo.saldo_pendiente))}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Anticipos ── */}
              {pedidoActivo.anticipos.length > 0 && (
                <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-steel-100">
                    <h3 className="text-body font-semibold text-steel-800">Anticipos registrados</h3>
                  </div>
                  <table className="w-full text-body-sm">
                    <thead>
                      <tr className="border-b border-steel-100 bg-steel-50">
                        <th className="text-left px-4 py-2 text-table-header text-steel-500 font-semibold uppercase tracking-wide">Fecha</th>
                        <th className="text-left px-3 py-2 text-table-header text-steel-500 font-semibold uppercase tracking-wide">Método</th>
                        <th className="text-right px-4 py-2 text-table-header text-steel-500 font-semibold uppercase tracking-wide">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidoActivo.anticipos.map((a) => (
                        <tr key={a.id} className="border-b border-steel-50">
                          <td className="px-4 py-2 text-steel-600">
                            {new Date(a.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="default">{METODO_LABEL[a.metodo] ?? a.metodo}</Badge>
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-emerald-700">${formatMoney(a.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Dialog nuevo pedido ── */}
      <Dialog open={dlgNuevo} onClose={() => setDlgNuevo(false)} title="Nuevo pedido">
        <div className="space-y-4">
          <div>
            <label className="text-body-sm font-medium text-steel-700 block mb-1">Cliente *</label>
            <Input
              placeholder="Buscar cliente..."
              value={clienteQ}
              onChange={(e) => setClienteQ(e.target.value)}
            />
            {clienteQ.length > 0 && (
              <div className="mt-1 border border-steel-200 rounded-lg max-h-40 overflow-y-auto">
                {clientes
                  .filter((c) => {
                    const n = `${c.nombre} ${c.apellidos ?? ''} ${c.razon_social ?? ''}`.toLowerCase();
                    return n.includes(clienteQ.toLowerCase());
                  })
                  .slice(0, 8)
                  .map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-2 text-body-sm hover:bg-steel-50 border-b border-steel-50"
                      onClick={() => { setClienteSeleccionado(c); setClienteQ(c.razon_social ?? `${c.nombre} ${c.apellidos ?? ''}`.trim()); }}
                    >
                      {c.razon_social ?? `${c.nombre} ${c.apellidos ?? ''}`.trim()}
                    </button>
                  ))}
              </div>
            )}
            {clienteSeleccionado && (
              <p className="text-meta text-emerald-600 mt-1">✓ {clienteSeleccionado.razon_social ?? clienteSeleccionado.nombre}</p>
            )}
          </div>
          <div>
            <label className="text-body-sm font-medium text-steel-700 block mb-1">Observaciones</label>
            <Input placeholder="Opcional..." value={obsNuevo} onChange={(e) => setObsNuevo(e.target.value)} />
          </div>
          {errorNuevo && <p className="text-body-sm text-rose-600">{errorNuevo}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDlgNuevo(false)}>Cancelar</Button>
          <Button onClick={handleCrearPedido} disabled={creando || !clienteSeleccionado}>
            {creando ? 'Creando...' : 'Crear pedido'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Dialog agregar línea ── */}
      <Dialog open={dlgLinea} onClose={() => setDlgLinea(false)} title="Agregar artículo">
        <div className="space-y-3">
          <div>
            <label className="text-body-sm font-medium text-steel-700 block mb-1">Artículo</label>
            <Input
              placeholder="Buscar por clave o descripción..."
              value={artQ}
              onChange={(e) => { setArtQ(e.target.value); setArtSeleccionado(null); }}
              autoFocus
            />
            {artSugeridos.length > 0 && !artSeleccionado && (
              <div className="mt-1 border border-steel-200 rounded-lg max-h-48 overflow-y-auto">
                {artSugeridos.map((a) => (
                  <button
                    key={a.id}
                    className="w-full text-left px-3 py-2 text-body-sm hover:bg-steel-50 border-b border-steel-50"
                    onClick={() => {
                      setArtSeleccionado(a);
                      setArtQ(a.clave);
                      setLineaPrecio(String(precioDeArticulo(a)));
                      setArtSugeridos([]);
                    }}
                  >
                    <span className="font-mono font-medium">{a.clave}</span>
                    {a.descripcion_1 && <span className="text-steel-500 ml-2">{a.descripcion_1}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-body-sm font-medium text-steel-700 block mb-1">Cantidad</label>
              <Input type="number" min="0.001" step="0.001" value={lineaCantidad} onChange={(e) => setLineaCantidad(e.target.value)} />
            </div>
            <div>
              <label className="text-body-sm font-medium text-steel-700 block mb-1">Precio</label>
              <Input type="number" min="0" step="0.01" value={lineaPrecio} onChange={(e) => setLineaPrecio(e.target.value)} />
            </div>
            <div>
              <label className="text-body-sm font-medium text-steel-700 block mb-1">Desc. %</label>
              <Input type="number" min="0" max="100" value={lineaDescuento} onChange={(e) => setLineaDescuento(e.target.value)} />
            </div>
          </div>
          {artSeleccionado && lineaPrecio && lineaCantidad && (
            <p className="text-body-sm text-steel-600">
              Subtotal: <strong>${formatMoney(parseFloat(lineaCantidad) * parseFloat(lineaPrecio) * (1 - (parseFloat(lineaDescuento) || 0) / 100))}</strong>
            </p>
          )}
          {lineaError && <p className="text-body-sm text-rose-600">{lineaError}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDlgLinea(false)}>Cancelar</Button>
          <Button onClick={handleAddLinea} disabled={addingLinea || !artSeleccionado}>
            {addingLinea ? 'Agregando...' : 'Agregar'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Dialog anticipo ── */}
      <Dialog open={dlgAnticipo} onClose={() => setDlgAnticipo(false)} title="Registrar anticipo">
        <div className="space-y-4">
          {pedidoActivo && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-body-sm">
              <p className="text-amber-800 font-medium">Saldo pendiente: ${formatMoney(Math.max(0, pedidoActivo.saldo_pendiente))}</p>
            </div>
          )}
          <PagosEditor pagos={pagosAnticipo} onChange={setPagosAnticipo} />
          {errorAnticipo && <p className="text-body-sm text-rose-600">{errorAnticipo}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDlgAnticipo(false)}>Cancelar</Button>
          <Button onClick={handleRegistrarAnticipo} disabled={registrandoAnticipo}>
            {registrandoAnticipo ? 'Registrando...' : 'Registrar e imprimir ticket'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Dialog liquidar ── */}
      <Dialog open={dlgLiquidar} onClose={() => setDlgLiquidar(false)} title="Liquidar pedido">
        <div className="space-y-4">
          {pedidoActivo && (
            <div className="bg-steel-50 border border-steel-200 rounded-lg p-3 space-y-1 text-body-sm">
              <div className="flex justify-between">
                <span className="text-steel-600">Total pedido</span>
                <span className="font-semibold">${formatMoney(pedidoActivo.total)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Anticipos pagados</span>
                <span className="font-semibold">-${formatMoney(pedidoActivo.total_anticipos)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-steel-200 pt-1 mt-1 text-amber-700">
                <span>Saldo a pagar ahora</span>
                <span>${formatMoney(Math.max(0, pedidoActivo.saldo_pendiente))}</span>
              </div>
            </div>
          )}
          {pedidoActivo && pedidoActivo.saldo_pendiente > 0.01 && (
            <PagosEditor pagos={pagosLiquidar} onChange={setPagosLiquidar} />
          )}
          {pedidoActivo && pedidoActivo.saldo_pendiente <= 0.01 && (
            <p className="text-body-sm text-emerald-700 font-medium">✓ El pedido ya está saldado con los anticipos.</p>
          )}
          {errorLiquidar && <p className="text-body-sm text-rose-600">{errorLiquidar}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDlgLiquidar(false)}>Cancelar</Button>
          <Button onClick={handleLiquidar} disabled={liquidando}>
            {liquidando ? 'Liquidando...' : 'Liquidar e imprimir ticket'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

// ── Componente editor de pagos ────────────────────────────────
function PagosEditor({
  pagos,
  onChange,
}: {
  pagos: PagoForm[];
  onChange: (p: PagoForm[]) => void;
}) {
  const total = pagos.reduce((s, p) => s + (p.monto || 0), 0);

  function update(i: number, field: keyof PagoForm, val: string | number) {
    onChange(pagos.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  }

  function add() {
    const used = pagos.map((p) => p.metodo);
    const next = METODOS.find((m) => !used.includes(m)) ?? 'EFECTIVO';
    onChange([...pagos, { metodo: next, monto: 0, referencia: '' }]);
  }

  function remove(i: number) {
    onChange(pagos.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <p className="text-body-sm font-medium text-steel-700">Métodos de pago</p>
      {pagos.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select
            className="border border-steel-200 rounded-lg px-2 py-1.5 text-body-sm bg-white"
            value={p.metodo}
            onChange={(e) => update(i, 'metodo', e.target.value)}
          >
            {METODOS.map((m) => (
              <option key={m} value={m}>{METODO_LABEL[m]}</option>
            ))}
          </select>
          <Input
            type="number"
            min="0"
            step="0.01"
            className="w-32 h-8"
            placeholder="Monto"
            value={p.monto || ''}
            onChange={(e) => update(i, 'monto', parseFloat(e.target.value) || 0)}
          />
          {p.metodo !== 'EFECTIVO' && (
            <Input
              className="flex-1 h-8"
              placeholder="Referencia"
              value={p.referencia}
              onChange={(e) => update(i, 'referencia', e.target.value)}
            />
          )}
          {pagos.length > 1 && (
            <button onClick={() => remove(i)} className="p-1 text-steel-400 hover:text-rose-500">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {pagos.length < 4 && (
        <button onClick={add} className="text-body-sm text-brand-600 hover:underline flex items-center gap-1">
          <Plus className="h-3 w-3" /> Agregar método
        </button>
      )}
      <div className="flex justify-between text-body-sm font-semibold border-t border-steel-200 pt-2 mt-1">
        <span className="text-steel-700">Total a cobrar</span>
        <span className="text-steel-900">${formatMoney(total)}</span>
      </div>
    </div>
  );
}
