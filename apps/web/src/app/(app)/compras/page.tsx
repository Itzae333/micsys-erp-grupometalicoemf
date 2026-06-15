'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ShoppingCart, Plus, Truck, CreditCard, ChevronRight,
  CheckCircle, XCircle, AlertTriangle, Search, Trash2, PackageCheck,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import type {
  OrdenCompra, OrdenesCompraPage, Proveedor,
  CuentaProveedorDetalle, EstatusOrdenCompra,
  TipoMovimientoProveedor,
} from '@/lib/types/api';
import type { Articulo } from '@/lib/types/api';

// ── Badge helpers ─────────────────────────────────────────────

const ESTATUS_CONFIG: Record<EstatusOrdenCompra, {
  label: string;
  variant: 'incomplete' | 'pending' | 'credit' | 'paid' | 'cancelled';
}> = {
  BORRADOR:         { label: 'Borrador',        variant: 'incomplete' },
  APROBADA:         { label: 'Aprobada',         variant: 'pending'    },
  RECIBIDA_PARCIAL: { label: 'Parcial',          variant: 'credit'     },
  RECIBIDA:         { label: 'Recibida',         variant: 'paid'       },
  CANCELADA:        { label: 'Cancelada',        variant: 'cancelled'  },
};

const MOV_CONFIG: Record<TipoMovimientoProveedor, {
  label: string;
  variant: 'cancelled' | 'paid' | 'default';
  signo: string;
}> = {
  CARGO:  { label: 'Cargo',  variant: 'cancelled', signo: '+' },
  ABONO:  { label: 'Abono',  variant: 'paid',       signo: '-' },
  AJUSTE: { label: 'Ajuste', variant: 'default',    signo: '~' },
};

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── ProveedorSearch ───────────────────────────────────────────

function ProveedorSearch({
  value,
  onChange,
  placeholder = 'Buscar proveedor...',
}: {
  value: Proveedor | null;
  onChange: (p: Proveedor | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Proveedor[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value) { setQuery(value.nombre); setOpen(false); }
  }, [value]);

  const search = useCallback((q: string) => {
    if (q.length < 1) { setResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await api.get<{ data: Proveedor[] }>(`/proveedores?q=${encodeURIComponent(q)}&limit=8`);
        setResults(res.data ?? []);
      } catch { setResults([]); }
    }, 250);
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400 pointer-events-none" />
        <input
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-steel-200 text-body text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange(null);
            setOpen(true);
            search(e.target.value);
          }}
          onFocus={() => { if (query && !value) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-steel-200 rounded-lg shadow-lg overflow-hidden">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-steel-50 flex items-center gap-2"
                onMouseDown={() => { onChange(p); setQuery(p.nombre); setOpen(false); }}
              >
                <span className="text-body-sm font-medium text-steel-900">{p.nombre}</span>
                {p.razon_social && (
                  <span className="text-meta text-steel-400 truncate">{p.razon_social}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── ArticuloSearch (inline) ───────────────────────────────────

function ArticuloSearch({
  value,
  onChange,
}: {
  value: Articulo | null;
  onChange: (a: Articulo | null) => void;
}) {
  const [query, setQuery] = useState(value ? `${value.clave} - ${value.descripcion_1 ?? ''}` : '');
  const [results, setResults] = useState<Articulo[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (q.length < 1) { setResults([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await api.get<{ data: Articulo[] }>(`/articulos?q=${encodeURIComponent(q)}&limit=8`);
        setResults(res.data ?? []);
      } catch { setResults([]); }
    }, 250);
  }, []);

  return (
    <div className="relative">
      <input
        className="w-full px-3 py-2 rounded-lg border border-steel-200 text-body-sm text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        placeholder="Buscar artículo..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange(null);
          setOpen(true);
          search(e.target.value);
        }}
        onFocus={() => { if (query && !value) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-steel-200 rounded-lg shadow-lg overflow-hidden">
          {results.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-steel-50"
                onMouseDown={() => {
                  onChange(a);
                  setQuery(`${a.clave} - ${a.descripcion_1 ?? ''}`);
                  setOpen(false);
                }}
              >
                <span className="text-body-sm font-medium text-steel-900">{a.clave}</span>
                <span className="text-meta text-steel-500 ml-2">{a.descripcion_1 ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Línea de OC en el formulario de creación ──────────────────

interface LineaForm {
  key: number;
  articulo: Articulo | null;
  existencia_num: number;
  cantidad_solicitada: string;
  precio_unitario: string;
}

// ── Main Page ─────────────────────────────────────────────────

export default function ComprasPage() {
  const { usuario } = useAuthStore();
  const canApprove  = ['SUPER_USUARIO', 'ADMIN'].includes(usuario?.rol ?? '');
  const canWrite    = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA'].includes(usuario?.rol ?? '');
  const canAjuste   = canApprove;

  // Tab
  const [tab, setTab] = useState<'ordenes' | 'cuentas'>('ordenes');

  // ── Órdenes ────────────────────────────────────────────────

  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loadingOrdenes, setLoadingOrdenes] = useState(true);
  const [filtroEstatus, setFiltroEstatus] = useState<string>('');

  const cargarOrdenes = useCallback(async () => {
    setLoadingOrdenes(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filtroEstatus) params.set('estatus', filtroEstatus);
      const res = await api.get<OrdenesCompraPage>(`/compras/ordenes?${params}`);
      setOrdenes(res.data ?? []);
    } catch { setOrdenes([]); }
    finally { setLoadingOrdenes(false); }
  }, [filtroEstatus]);

  useEffect(() => { cargarOrdenes(); }, [cargarOrdenes]);

  // ── Cuentas ────────────────────────────────────────────────

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loadingCuentas, setLoadingCuentas] = useState(true);

  const cargarProveedores = useCallback(async () => {
    setLoadingCuentas(true);
    try {
      const res = await api.get<{ data: Proveedor[] }>('/proveedores?limit=200');
      setProveedores((res.data ?? []).filter(p => p.saldo_pendiente > 0));
    } catch { setProveedores([]); }
    finally { setLoadingCuentas(false); }
  }, []);

  useEffect(() => {
    if (tab === 'cuentas') cargarProveedores();
  }, [tab, cargarProveedores]);

  // ── Dialog: Crear OC ───────────────────────────────────────

  const [showCreate, setShowCreate] = useState(false);
  const [createProveedor, setCreateProveedor] = useState<Proveedor | null>(null);
  const [createObservaciones, setCreateObservaciones] = useState('');
  const [createLineas, setCreateLineas] = useState<LineaForm[]>([
    { key: 0, articulo: null, existencia_num: 1, cantidad_solicitada: '', precio_unitario: '' },
  ]);
  const [savingCreate, setSavingCreate] = useState(false);
  const [createError, setCreateError] = useState('');
  const lineaKey = useRef(1);

  function resetCreate() {
    setCreateProveedor(null);
    setCreateObservaciones('');
    setCreateLineas([{ key: 0, articulo: null, existencia_num: 1, cantidad_solicitada: '', precio_unitario: '' }]);
    setCreateError('');
    lineaKey.current = 1;
  }

  function addLinea() {
    setCreateLineas(prev => [
      ...prev,
      { key: lineaKey.current++, articulo: null, existencia_num: 1, cantidad_solicitada: '', precio_unitario: '' },
    ]);
  }

  function removeLinea(key: number) {
    setCreateLineas(prev => prev.filter(l => l.key !== key));
  }

  function updateLinea(key: number, patch: Partial<LineaForm>) {
    setCreateLineas(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));
  }

  async function submitCreate() {
    if (!createProveedor) { setCreateError('Selecciona un proveedor'); return; }
    const lineasValidas = createLineas.filter(
      l => l.articulo && Number(l.cantidad_solicitada) > 0,
    );
    if (lineasValidas.length === 0) {
      setCreateError('Agrega al menos una línea con artículo y cantidad'); return;
    }
    setSavingCreate(true);
    setCreateError('');
    try {
      await api.post('/compras/ordenes', {
        proveedor_id:  createProveedor.id,
        observaciones: createObservaciones || undefined,
        lineas: lineasValidas.map(l => ({
          articulo_id:         l.articulo!.id,
          existencia_num:      l.existencia_num,
          cantidad_solicitada: Number(l.cantidad_solicitada),
          precio_unitario:     Number(l.precio_unitario) || 0,
        })),
      });
      setShowCreate(false);
      resetCreate();
      cargarOrdenes();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear la orden';
      setCreateError(msg);
    } finally { setSavingCreate(false); }
  }

  const totalCreate = createLineas.reduce((s, l) =>
    s + (Number(l.cantidad_solicitada) * Number(l.precio_unitario)), 0,
  );

  // ── Dialog: Detalle OC ─────────────────────────────────────

  const [ocSeleccionada, setOcSeleccionada] = useState<OrdenCompra | null>(null);
  const [loadingOc, setLoadingOc] = useState(false);

  async function abrirOc(id: string) {
    setLoadingOc(true);
    setOcSeleccionada(null);
    try {
      const oc = await api.get<OrdenCompra>(`/compras/ordenes/${id}`);
      setOcSeleccionada(oc);
    } finally { setLoadingOc(false); }
  }

  async function aprobarOc(id: string) {
    try {
      await api.patch(`/compras/ordenes/${id}/aprobar`, {});
      const updated = await api.get<OrdenCompra>(`/compras/ordenes/${id}`);
      setOcSeleccionada(updated);
      cargarOrdenes();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al aprobar');
    }
  }

  async function cancelarOc(id: string) {
    if (!confirm('¿Cancelar esta orden de compra?')) return;
    try {
      await api.patch(`/compras/ordenes/${id}/cancelar`, {});
      setOcSeleccionada(null);
      cargarOrdenes();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al cancelar');
    }
  }

  // ── Dialog: Recibir OC ─────────────────────────────────────

  const [showRecibir, setShowRecibir] = useState(false);
  const [recibirCantidades, setRecibirCantidades] = useState<Record<string, string>>({});
  const [savingRecibir, setSavingRecibir] = useState(false);
  const [recibirError, setRecibirError] = useState('');

  function abrirRecibir() {
    if (!ocSeleccionada) return;
    const init: Record<string, string> = {};
    for (const l of ocSeleccionada.lineas) {
      const pendiente = l.cantidad_solicitada - l.cantidad_recibida;
      init[l.id] = pendiente > 0 ? String(pendiente) : '0';
    }
    setRecibirCantidades(init);
    setRecibirError('');
    setShowRecibir(true);
  }

  async function submitRecibir() {
    if (!ocSeleccionada) return;
    const lineas = Object.entries(recibirCantidades)
      .map(([linea_id, v]) => ({ linea_id, cantidad_recibida: Number(v) }))
      .filter(l => l.cantidad_recibida > 0);
    if (lineas.length === 0) { setRecibirError('Ingresa al menos una cantidad'); return; }
    setSavingRecibir(true);
    setRecibirError('');
    try {
      await api.post(`/compras/ordenes/${ocSeleccionada.id}/recibir`, { lineas });
      setShowRecibir(false);
      const updated = await api.get<OrdenCompra>(`/compras/ordenes/${ocSeleccionada.id}`);
      setOcSeleccionada(updated);
      cargarOrdenes();
      if (tab === 'cuentas') cargarProveedores();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrar recepción';
      setRecibirError(msg);
    } finally { setSavingRecibir(false); }
  }

  // ── Dialog: Cuenta Proveedor ───────────────────────────────

  const [cuentaAbierta, setCuentaAbierta] = useState<CuentaProveedorDetalle | null>(null);
  const [loadingCuenta, setLoadingCuenta] = useState(false);

  async function abrirCuenta(proveedorId: string) {
    setLoadingCuenta(true);
    setCuentaAbierta(null);
    try {
      const detalle = await api.get<CuentaProveedorDetalle>(`/compras/cuenta/${proveedorId}`);
      setCuentaAbierta(detalle);
    } finally { setLoadingCuenta(false); }
  }

  // ── Dialog: Abono ──────────────────────────────────────────

  const [showAbono, setShowAbono] = useState(false);
  const [abonoMonto, setAbonoMonto] = useState('');
  const [abonoConcepto, setAbonoConcepto] = useState('');
  const [savingAbono, setSavingAbono] = useState(false);
  const [abonoError, setAbonoError] = useState('');

  async function submitAbono() {
    if (!cuentaAbierta) return;
    if (!abonoMonto || Number(abonoMonto) <= 0) { setAbonoError('Ingresa un monto válido'); return; }
    if (!abonoConcepto) { setAbonoError('Ingresa un concepto'); return; }
    setSavingAbono(true);
    setAbonoError('');
    try {
      await api.post(`/compras/cuenta/${cuentaAbierta.proveedor.id}/abono`, {
        monto:    Number(abonoMonto),
        concepto: abonoConcepto,
      });
      setShowAbono(false);
      setAbonoMonto('');
      setAbonoConcepto('');
      const updated = await api.get<CuentaProveedorDetalle>(
        `/compras/cuenta/${cuentaAbierta.proveedor.id}`,
      );
      setCuentaAbierta(updated);
      cargarProveedores();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrar abono';
      setAbonoError(msg);
    } finally { setSavingAbono(false); }
  }

  // ── Render ─────────────────────────────────────────────────

  const totalPendiente = proveedores.reduce((s, p) => s + p.saldo_pendiente, 0);

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Abastecimiento</p>
          <h1 className="text-display-md font-bold text-steel-900">Compras</h1>
        </div>
        {tab === 'ordenes' && canWrite && (
          <Button onClick={() => { resetCreate(); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva OC
          </Button>
        )}
        {tab === 'cuentas' && !loadingCuentas && proveedores.length > 0 && (
          <div className="text-right">
            <p className="text-body-sm text-steel-400">Total por pagar</p>
            <p className="text-display-sm font-bold text-brand-600">{fmt(totalPendiente)}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-steel-100 rounded-xl p-1 w-fit">
        {([
          { key: 'ordenes', label: 'Órdenes de Compra', icon: ShoppingCart },
          { key: 'cuentas', label: 'Cuentas por Pagar', icon: CreditCard },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-body-sm font-medium transition-all ${
              tab === key
                ? 'bg-white text-steel-900 shadow-sm'
                : 'text-steel-500 hover:text-steel-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: ÓRDENES ────────────────────────────────────── */}
      {tab === 'ordenes' && (
        <>
          {/* Filtro por estatus */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {([
              { value: '',                 label: 'Todas' },
              { value: 'BORRADOR',         label: 'Borrador' },
              { value: 'APROBADA',         label: 'Aprobadas' },
              { value: 'RECIBIDA_PARCIAL', label: 'Parciales' },
              { value: 'RECIBIDA',         label: 'Recibidas' },
              { value: 'CANCELADA',        label: 'Canceladas' },
            ] as { value: string; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFiltroEstatus(value)}
                className={`px-3 py-1.5 rounded-lg text-body-sm font-medium transition-all ${
                  filtroEstatus === value
                    ? 'bg-brand-600 text-white'
                    : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loadingOrdenes ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-steel-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : ordenes.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="h-8 w-8" />}
              title="Sin órdenes de compra"
              description={filtroEstatus ? 'No hay OCs con ese estatus.' : 'Crea tu primera orden de compra.'}
            />
          ) : (
            <div className="space-y-2">
              {ordenes.map((oc) => {
                const cfg = ESTATUS_CONFIG[oc.estatus];
                const lineasPendientes = oc.lineas.filter(
                  l => l.cantidad_recibida < l.cantidad_solicitada,
                ).length;
                return (
                  <button
                    key={oc.id}
                    onClick={() => abrirOc(oc.id)}
                    className="w-full flex items-center gap-4 px-4 py-3.5 bg-white border border-steel-200 rounded-xl hover:border-steel-300 hover:shadow-sm transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-steel-100 flex items-center justify-center flex-shrink-0">
                      <Truck className="h-5 w-5 text-steel-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-body font-semibold text-steel-900">OC #{oc.folio}</span>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        {oc.estatus === 'RECIBIDA_PARCIAL' && (
                          <span className="text-meta text-steel-400">{lineasPendientes} pendiente(s)</span>
                        )}
                      </div>
                      <p className="text-body-sm text-steel-500 truncate">
                        {oc.proveedor?.nombre ?? oc.proveedor_id}
                        {oc.observaciones && ` · ${oc.observaciones}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-body font-semibold text-steel-900">{fmt(oc.total)}</p>
                      <p className="text-meta text-steel-400">
                        {new Date(oc.created_at).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-steel-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── TAB: CUENTAS POR PAGAR ──────────────────────────── */}
      {tab === 'cuentas' && (
        <>
          {proveedores.length > 0 && (
            <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 flex items-center gap-3 mb-5">
              <AlertTriangle className="h-4 w-4 text-brand-600 flex-shrink-0" />
              <p className="text-body-sm text-brand-700">
                {proveedores.length} {proveedores.length === 1 ? 'proveedor tiene' : 'proveedores tienen'} saldo pendiente por pagar.
              </p>
            </div>
          )}

          {loadingCuentas ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 bg-steel-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : proveedores.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="h-8 w-8" />}
              title="Sin cuentas pendientes"
              description="No hay proveedores con saldo por pagar."
            />
          ) : (
            <div className="space-y-2">
              {proveedores.map((p) => (
                <button
                  key={p.id}
                  onClick={() => abrirCuenta(p.id)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 bg-white border border-steel-200 rounded-xl hover:border-steel-300 hover:shadow-sm transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-steel-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-steel-700 font-bold text-body">
                      {p.nombre.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body font-semibold text-steel-900">{p.nombre}</p>
                    {p.razon_social && (
                      <p className="text-body-sm text-steel-400 truncate">{p.razon_social}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-body font-semibold text-brand-600">{fmt(p.saldo_pendiente)}</p>
                    <p className="text-meta text-steel-400">pendiente</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-steel-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          DIALOG: CREAR OC
      ══════════════════════════════════════════════════════ */}
      <Dialog
        open={showCreate}
        onClose={() => { setShowCreate(false); resetCreate(); }}
        title="Nueva Orden de Compra"
        size="lg"
      >
        <div className="space-y-4">
          {/* Proveedor */}
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Proveedor *</label>
            <ProveedorSearch value={createProveedor} onChange={setCreateProveedor} />
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Observaciones</label>
            <Input
              placeholder="Notas u observaciones..."
              value={createObservaciones}
              onChange={e => setCreateObservaciones(e.target.value)}
            />
          </div>

          {/* Líneas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-body-sm font-medium text-steel-700">Artículos *</label>
              <button
                type="button"
                onClick={addLinea}
                className="text-brand-600 hover:text-brand-700 text-body-sm font-medium flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar línea
              </button>
            </div>

            <div className="space-y-3">
              {createLineas.map((linea, idx) => (
                <div key={linea.key} className="border border-steel-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-meta font-medium text-steel-500">Línea {idx + 1}</span>
                    {createLineas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLinea(linea.key)}
                        className="text-steel-400 hover:text-brand-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <ArticuloSearch
                    value={linea.articulo}
                    onChange={(a) => updateLinea(linea.key, { articulo: a })}
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-meta text-steel-500 mb-1 block">Slot exist.</label>
                      <select
                        className="w-full px-2 py-2 rounded-lg border border-steel-200 text-body-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        value={linea.existencia_num}
                        onChange={e => updateLinea(linea.key, { existencia_num: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 5].map(n => (
                          <option key={n} value={n}>Existencia {n}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-meta text-steel-500 mb-1 block">Cantidad *</label>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        placeholder="0"
                        className="w-full px-2 py-2 rounded-lg border border-steel-200 text-body-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        value={linea.cantidad_solicitada}
                        onChange={e => updateLinea(linea.key, { cantidad_solicitada: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-meta text-steel-500 mb-1 block">Precio unit.</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full px-2 py-2 rounded-lg border border-steel-200 text-body-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        value={linea.precio_unitario}
                        onChange={e => updateLinea(linea.key, { precio_unitario: e.target.value })}
                      />
                    </div>
                  </div>

                  {linea.articulo && linea.cantidad_solicitada && (
                    <p className="text-meta text-steel-400 text-right">
                      Subtotal: {fmt(Number(linea.cantidad_solicitada) * Number(linea.precio_unitario))}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          {totalCreate > 0 && (
            <div className="flex justify-end pt-1">
              <span className="text-body font-bold text-steel-900">Total: {fmt(totalCreate)}</span>
            </div>
          )}

          {createError && (
            <p className="text-body-sm text-brand-600 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
              {createError}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => { setShowCreate(false); resetCreate(); }}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={savingCreate}>
              {savingCreate ? 'Guardando...' : 'Crear OC'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ══════════════════════════════════════════════════════
          DIALOG: DETALLE OC
      ══════════════════════════════════════════════════════ */}
      <Dialog
        open={!!ocSeleccionada || loadingOc}
        onClose={() => setOcSeleccionada(null)}
        title={ocSeleccionada ? `OC #${ocSeleccionada.folio}` : 'Cargando...'}
        size="lg"
      >
        {loadingOc && (
          <div className="space-y-2 py-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-steel-100 rounded animate-pulse" />)}
          </div>
        )}
        {ocSeleccionada && !loadingOc && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={ESTATUS_CONFIG[ocSeleccionada.estatus].variant}>
                {ESTATUS_CONFIG[ocSeleccionada.estatus].label}
              </Badge>
              <span className="text-body-sm text-steel-500">
                {ocSeleccionada.proveedor?.nombre}
              </span>
              <span className="text-body-sm text-steel-400">
                {new Date(ocSeleccionada.created_at).toLocaleDateString('es-MX', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
              <span className="ml-auto text-body font-bold text-steel-900">
                {fmt(ocSeleccionada.total)}
              </span>
            </div>

            {ocSeleccionada.observaciones && (
              <p className="text-body-sm text-steel-500 bg-steel-50 rounded-lg px-3 py-2">
                {ocSeleccionada.observaciones}
              </p>
            )}

            {/* Líneas */}
            <div className="border border-steel-200 rounded-xl overflow-hidden">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="bg-steel-50 border-b border-steel-200">
                    <th className="px-3 py-2 text-left font-medium text-steel-500">Artículo</th>
                    <th className="px-3 py-2 text-right font-medium text-steel-500">Solicitado</th>
                    <th className="px-3 py-2 text-right font-medium text-steel-500">Recibido</th>
                    <th className="px-3 py-2 text-right font-medium text-steel-500">Precio</th>
                    <th className="px-3 py-2 text-right font-medium text-steel-500">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {ocSeleccionada.lineas.map((l) => {
                    const pendiente = l.cantidad_solicitada - l.cantidad_recibida;
                    return (
                      <tr key={l.id} className="border-b border-steel-100 last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium text-steel-900">{l.articulo?.descripcion_1 ?? l.clave}</p>
                          <p className="text-meta text-steel-400">{l.clave} · Exist. {l.existencia_num}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-steel-700">
                          {l.cantidad_solicitada}
                        </td>
                        <td className={`px-3 py-2 text-right ${pendiente > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                          {l.cantidad_recibida}
                        </td>
                        <td className="px-3 py-2 text-right text-steel-600">{fmt(l.precio_unitario)}</td>
                        <td className="px-3 py-2 text-right font-medium text-steel-900">{fmt(l.subtotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Acciones */}
            {ocSeleccionada.estatus !== 'CANCELADA' && ocSeleccionada.estatus !== 'RECIBIDA' && (
              <div className="flex gap-2 justify-end pt-1 flex-wrap">
                {canApprove && ocSeleccionada.estatus === 'BORRADOR' && (
                  <Button
                    variant="ghost"
                    onClick={() => cancelarOc(ocSeleccionada.id)}
                    className="text-brand-600 hover:text-brand-700"
                  >
                    <XCircle className="h-4 w-4 mr-1.5" /> Cancelar OC
                  </Button>
                )}
                {canApprove && ocSeleccionada.estatus === 'BORRADOR' && (
                  <Button onClick={() => aprobarOc(ocSeleccionada.id)}>
                    <CheckCircle className="h-4 w-4 mr-1.5" /> Aprobar
                  </Button>
                )}
                {canWrite && (ocSeleccionada.estatus === 'APROBADA' || ocSeleccionada.estatus === 'RECIBIDA_PARCIAL') && (
                  <>
                    {canApprove && (
                      <Button
                        variant="ghost"
                        onClick={() => cancelarOc(ocSeleccionada.id)}
                        className="text-brand-600 hover:text-brand-700"
                      >
                        <XCircle className="h-4 w-4 mr-1.5" /> Cancelar OC
                      </Button>
                    )}
                    <Button onClick={abrirRecibir}>
                      <PackageCheck className="h-4 w-4 mr-1.5" /> Registrar recepción
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* ══════════════════════════════════════════════════════
          DIALOG: RECIBIR OC
      ══════════════════════════════════════════════════════ */}
      <Dialog
        open={showRecibir}
        onClose={() => setShowRecibir(false)}
        title="Registrar recepción de mercancía"
        description="Ingresa las cantidades recibidas en este envío. Se crearán Entradas en inventario."
        size="md"
      >
        {ocSeleccionada && (
          <div className="space-y-4">
            <div className="space-y-3">
              {ocSeleccionada.lineas
                .filter(l => l.cantidad_recibida < l.cantidad_solicitada)
                .map((l) => {
                  const pendiente = l.cantidad_solicitada - l.cantidad_recibida;
                  return (
                    <div key={l.id} className="flex items-center gap-3 p-3 bg-steel-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium text-steel-900">{l.articulo?.descripcion_1 ?? l.clave}</p>
                        <p className="text-meta text-steel-400">
                          Pendiente: {pendiente} · Exist. {l.existencia_num}
                        </p>
                      </div>
                      <div className="w-28 flex-shrink-0">
                        <input
                          type="number"
                          min="0"
                          max={pendiente}
                          step="0.001"
                          className="w-full px-2 py-2 rounded-lg border border-steel-200 text-body-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500"
                          value={recibirCantidades[l.id] ?? ''}
                          onChange={e => setRecibirCantidades(prev => ({ ...prev, [l.id]: e.target.value }))}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>

            {recibirError && (
              <p className="text-body-sm text-brand-600 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                {recibirError}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowRecibir(false)}>Cancelar</Button>
              <Button onClick={submitRecibir} disabled={savingRecibir}>
                {savingRecibir ? 'Registrando...' : 'Confirmar recepción'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* ══════════════════════════════════════════════════════
          DIALOG: CUENTA PROVEEDOR
      ══════════════════════════════════════════════════════ */}
      <Dialog
        open={!!cuentaAbierta || loadingCuenta}
        onClose={() => { setCuentaAbierta(null); setShowAbono(false); }}
        title={cuentaAbierta ? cuentaAbierta.proveedor.nombre : 'Cargando...'}
        size="lg"
      >
        {loadingCuenta && (
          <div className="space-y-2 py-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-steel-100 rounded animate-pulse" />)}
          </div>
        )}
        {cuentaAbierta && !loadingCuenta && (
          <div className="space-y-4">
            {/* Saldo */}
            <div className="flex items-center justify-between bg-steel-50 rounded-xl px-4 py-3">
              <div>
                <p className="text-body-sm text-steel-500">Saldo pendiente</p>
                <p className="text-display-sm font-bold text-brand-600">
                  {fmt(cuentaAbierta.proveedor.saldo_pendiente)}
                </p>
              </div>
              <Button onClick={() => { setAbonoMonto(''); setAbonoConcepto(''); setAbonoError(''); setShowAbono(true); }}>
                <Plus className="h-4 w-4 mr-1.5" /> Registrar pago
              </Button>
            </div>

            {/* Abono inline */}
            {showAbono && (
              <div className="border border-steel-200 rounded-xl p-4 space-y-3 bg-white">
                <p className="text-body-sm font-medium text-steel-700">Registrar pago</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-meta text-steel-500 mb-1 block">Monto *</label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={abonoMonto}
                      onChange={e => setAbonoMonto(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-meta text-steel-500 mb-1 block">Concepto *</label>
                    <Input
                      placeholder="Pago por transferencia..."
                      value={abonoConcepto}
                      onChange={e => setAbonoConcepto(e.target.value)}
                    />
                  </div>
                </div>
                {abonoError && (
                  <p className="text-body-sm text-brand-600">{abonoError}</p>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setShowAbono(false)}>Cancelar</Button>
                  <Button onClick={submitAbono} disabled={savingAbono}>
                    {savingAbono ? 'Guardando...' : 'Registrar pago'}
                  </Button>
                </div>
              </div>
            )}

            {/* Movimientos */}
            {cuentaAbierta.movimientos.length === 0 ? (
              <p className="text-body-sm text-steel-400 text-center py-4">Sin movimientos registrados</p>
            ) : (
              <div className="space-y-1">
                {cuentaAbierta.movimientos.map((m) => {
                  const cfg = MOV_CONFIG[m.tipo];
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-steel-50 rounded-lg transition-colors">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm text-steel-700 truncate">{m.concepto}</p>
                        <p className="text-meta text-steel-400">
                          {new Date(m.created_at).toLocaleDateString('es-MX')}
                          {m.orden && ` · OC #${m.orden.folio}`}
                          {m.usuario && ` · ${m.usuario.nombre}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-body font-semibold ${
                          m.tipo === 'CARGO' ? 'text-brand-600' : 'text-green-600'
                        }`}>
                          {cfg.signo}{fmt(m.monto)}
                        </p>
                        <p className="text-meta text-steel-400">{fmt(m.saldo_despues)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
