'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PackagePlus, PackageMinus, ArrowLeftRight,
  SlidersHorizontal, Package, Search,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import type {
  MovimientoInventario, MovimientosInventarioPage,
  TipoMovimientoInventario, Articulo, ArticulosPage, ConfigColumnasSchema,
} from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

// ── Configuración de tipos de movimiento ─────────────────────

type BadgeVariant = 'paid' | 'nota_por_pagar' | 'credit' | 'cargada' | 'pending' | 'cancelled' | 'default';

const TIPO_CONFIG: Record<TipoMovimientoInventario, {
  label: string; variant: BadgeVariant; signo: '+' | '-';
}> = {
  ENTRADA:          { label: 'Entrada',        variant: 'paid',           signo: '+' },
  SALIDA:           { label: 'Salida',         variant: 'nota_por_pagar', signo: '-' },
  TRANSFERENCIA_OUT:{ label: 'Transferencia ↑',variant: 'credit',         signo: '-' },
  TRANSFERENCIA_IN: { label: 'Transferencia ↓',variant: 'cargada',        signo: '+' },
  AJUSTE_POSITIVO:  { label: 'Ajuste +',       variant: 'pending',        signo: '+' },
  AJUSTE_NEGATIVO:  { label: 'Ajuste -',       variant: 'cancelled',      signo: '-' },
};

const TIPO_FILTROS = [
  { value: '',                label: 'Todos' },
  { value: 'ENTRADA',         label: 'Entradas' },
  { value: 'SALIDA',          label: 'Salidas' },
  { value: 'TRANSFERENCIA_OUT', label: 'Transferencias' },
  { value: 'AJUSTE_POSITIVO', label: 'Ajustes' },
];

// ── Componente de búsqueda de artículo ───────────────────────

function ArticuloSearch({
  value, onChange, placeholder = 'Buscar artículo…',
}: {
  value: Articulo | null;
  onChange: (art: Articulo | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<Articulo[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (value) setQuery(`${value.clave}${value.descripcion_1 ? ` — ${value.descripcion_1}` : ''}`);
  }, [value]);

  async function buscar(val: string) {
    setQuery(val);
    onChange(null);
    if (val.length < 2) { setResultados([]); return; }
    try {
      const res = await api.get<ArticulosPage>(`/articulos?q=${encodeURIComponent(val)}&limit=8`);
      setResultados(res.data);
    } catch { setResultados([]); }
  }

  function seleccionar(art: Articulo) {
    onChange(art);
    setQuery(`${art.clave}${art.descripcion_1 ? ` — ${art.descripcion_1}` : ''}`);
    setResultados([]);
    setFocused(false);
  }

  function limpiar() {
    onChange(null);
    setQuery('');
    setResultados([]);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400 pointer-events-none" />
        <input
          className="h-9 w-full rounded-md border border-steel-300 bg-white pl-8 pr-3 text-body text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-2 focus:ring-brand-600"
          placeholder={placeholder}
          value={query}
          onChange={(e) => buscar(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={limpiar}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-700 text-meta"
          >
            ✕
          </button>
        )}
      </div>
      {focused && resultados.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-steel-200 bg-white shadow-lg overflow-hidden">
          {resultados.map((art) => (
            <li key={art.id}>
              <button
                type="button"
                onMouseDown={() => seleccionar(art)}
                className="w-full px-3 py-2 text-left hover:bg-steel-50 flex items-center gap-2"
              >
                <span className="text-meta text-steel-500 font-mono">{art.clave}</span>
                <span className="text-body-sm text-steel-800 truncate">{art.descripcion_1 ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Selector de slot de existencia ───────────────────────────

function SlotSelect({
  value, onChange, slots, label = 'Slot',
}: {
  value: number;
  onChange: (n: number) => void;
  slots: { numero: number; label: string }[];
  label?: string;
}) {
  return (
    <select
      className="h-9 w-full rounded-md border border-steel-300 bg-white px-3 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {slots.map((s) => (
        <option key={s.numero} value={s.numero}>{s.label}</option>
      ))}
    </select>
  );
}

// ── Página principal ──────────────────────────────────────────

export default function MovimientosPage() {
  const { usuario } = useAuthStore();
  const { empresa, ubicacion } = useContextoStore();

  const [data, setData] = useState<MovimientoInventario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [schema, setSchema] = useState<ConfigColumnasSchema | null>(null);

  // Diálogos
  const [dlgEntrada, setDlgEntrada] = useState(false);
  const [dlgSalida,  setDlgSalida]  = useState(false);
  const [dlgTransf,  setDlgTransf]  = useState(false);
  const [dlgAjuste,  setDlgAjuste]  = useState(false);

  // Estado compartido de formularios
  const [artSel,    setArtSel]    = useState<Articulo | null>(null);
  const [slot,      setSlot]      = useState(1);
  const [slotDst,   setSlotDst]   = useState(2);
  const [cantidad,  setCantidad]  = useState('');
  const [cantNueva, setCantNueva] = useState('');
  const [concepto,  setConcepto]  = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  const canWrite = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA'].includes(usuario?.rol ?? '');
  const canAjuste = ['SUPER_USUARIO', 'ADMIN'].includes(usuario?.rol ?? '');

  // Slots disponibles para seleccionar
  const slots = schema?.existencias?.filter((e) => e.activa).map((e) => ({
    numero: e.numero,
    label:  e.label,
  })) ?? [1, 2, 3, 4, 5].map((n) => ({ numero: n, label: `Existencia ${n}` }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filtroTipo) {
        // Para transferencias filtramos solo OUT para evitar duplicados en la lista
        params.set('tipo', filtroTipo === 'TRANSFERENCIA_OUT' ? 'TRANSFERENCIA_OUT' : filtroTipo);
      }
      const res = await api.get<MovimientosInventarioPage>(`/movimientos?${params}`);
      setData(res.data);
    } catch { setData([]); } finally { setLoading(false); }
  }, [filtroTipo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (empresa?.id && ubicacion?.id) {
      api.get<ConfigColumnasSchema>(`/config-columnas/${empresa.id}/${ubicacion.id}/schema`)
        .then(setSchema)
        .catch(() => {});
    }
  }, [empresa?.id, ubicacion?.id]);

  function slotLabel(num: number): string {
    return slots.find((s) => s.numero === num)?.label ?? `Existencia ${num}`;
  }

  function resetForm() {
    setArtSel(null); setSlot(slots[0]?.numero ?? 1); setSlotDst(slots[1]?.numero ?? 2);
    setCantidad(''); setCantNueva(''); setConcepto(''); setFormError(null);
  }

  // ── Handlers ─────────────────────────────────────────────────

  async function handleEntrada() {
    if (!artSel) { setFormError('Selecciona un artículo'); return; }
    const cant = parseFloat(cantidad);
    if (!cant || cant <= 0) { setFormError('Cantidad inválida'); return; }
    setSaving(true); setFormError(null);
    try {
      await api.post('/movimientos/entrada', {
        articulo_id:   artSel.id,
        existencia_num: slot,
        cantidad:      cant,
        concepto:      concepto || undefined,
      });
      setDlgEntrada(false); resetForm(); load();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  async function handleSalida() {
    if (!artSel) { setFormError('Selecciona un artículo'); return; }
    const cant = parseFloat(cantidad);
    if (!cant || cant <= 0) { setFormError('Cantidad inválida'); return; }
    if (!concepto.trim()) { setFormError('El concepto es obligatorio'); return; }
    setSaving(true); setFormError(null);
    try {
      await api.post('/movimientos/salida', {
        articulo_id:    artSel.id,
        existencia_num: slot,
        cantidad:       cant,
        concepto,
      });
      setDlgSalida(false); resetForm(); load();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  async function handleTransf() {
    if (!artSel) { setFormError('Selecciona un artículo'); return; }
    const cant = parseFloat(cantidad);
    if (!cant || cant <= 0) { setFormError('Cantidad inválida'); return; }
    if (slot === slotDst) { setFormError('El slot de origen y destino deben ser diferentes'); return; }
    setSaving(true); setFormError(null);
    try {
      await api.post('/movimientos/transferencia', {
        articulo_id:          artSel.id,
        existencia_num_origen:  slot,
        existencia_num_destino: slotDst,
        cantidad:               cant,
        concepto:               concepto || undefined,
      });
      setDlgTransf(false); resetForm(); load();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  async function handleAjuste() {
    if (!artSel) { setFormError('Selecciona un artículo'); return; }
    const cant = parseFloat(cantNueva);
    if (cant < 0 || isNaN(cant)) { setFormError('Cantidad inválida'); return; }
    if (!concepto.trim()) { setFormError('El concepto es obligatorio'); return; }
    setSaving(true); setFormError(null);
    try {
      await api.post('/movimientos/ajuste', {
        articulo_id:    artSel.id,
        existencia_num: slot,
        cantidad_nueva: cant,
        concepto,
      });
      setDlgAjuste(false); resetForm(); load();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Inventario</p>
        <h1 className="text-display-md font-bold text-steel-900">Movimientos</h1>
      </div>

      {/* Acciones */}
      {canWrite && (
        <div className="flex flex-wrap gap-2 mb-5">
          <Button
            onClick={() => { resetForm(); setDlgEntrada(true); }}
            className="flex items-center gap-1.5"
          >
            <PackagePlus className="h-4 w-4" />
            Entrada
          </Button>
          <Button
            variant="secondary"
            onClick={() => { resetForm(); setDlgSalida(true); }}
            className="flex items-center gap-1.5"
          >
            <PackageMinus className="h-4 w-4" />
            Salida
          </Button>
          <Button
            variant="secondary"
            onClick={() => { resetForm(); setDlgTransf(true); }}
            className="flex items-center gap-1.5"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Transferencia
          </Button>
          {canAjuste && (
            <Button
              variant="secondary"
              onClick={() => { resetForm(); setDlgAjuste(true); }}
              className="flex items-center gap-1.5"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Ajuste
            </Button>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {TIPO_FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltroTipo(f.value)}
            className={`px-3 py-1 rounded-full text-body-sm font-medium transition-colors ${
              filtroTipo === f.value
                ? 'bg-brand-600 text-white'
                : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-steel-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="Sin movimientos"
          description="Registra entradas, salidas o transferencias de inventario."
        />
      ) : (
        <div className="space-y-2">
          {data.map((m) => {
            const cfg = TIPO_CONFIG[m.tipo];
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-steel-200 rounded-xl"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  cfg.signo === '+' ? 'bg-green-50' : 'bg-brand-50'
                }`}>
                  {cfg.signo === '+'
                    ? <PackagePlus  className="h-4 w-4 text-green-600" />
                    : <PackageMinus className="h-4 w-4 text-brand-600" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    {m.articulo && (
                      <span className="text-body-sm text-steel-800 font-medium truncate">
                        {m.articulo.clave}{m.articulo.descripcion_1 ? ` — ${m.articulo.descripcion_1}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-meta text-steel-400">
                      {slotLabel(m.existencia_num)}
                    </span>
                    {m.concepto && (
                      <span className="text-meta text-steel-400 truncate">· {m.concepto}</span>
                    )}
                    {m.proveedor && (
                      <span className="text-meta text-steel-400">· {m.proveedor.nombre}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-meta text-steel-400">
                      {new Date(m.created_at).toLocaleDateString('es-MX', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {m.usuario && (
                      <span className="text-meta text-steel-400">
                        · {m.usuario.nombre} {m.usuario.apellidos}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className={`text-body font-bold ${cfg.signo === '+' ? 'text-green-600' : 'text-steel-700'}`}>
                    {cfg.signo}{m.cantidad.toFixed(3).replace(/\.?0+$/, '')}
                  </p>
                  <p className="text-meta text-steel-400">
                    → {m.cantidad_despues.toFixed(3).replace(/\.?0+$/, '')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dialog: Entrada ───────────────────────────────────── */}
      <Dialog
        open={dlgEntrada}
        onClose={() => { setDlgEntrada(false); resetForm(); }}
        title="Registrar entrada"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Artículo <span className="text-brand-600">*</span>
            </label>
            <ArticuloSearch value={artSel} onChange={setArtSel} />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Slot de existencia</label>
            <SlotSelect value={slot} onChange={setSlot} slots={slots} />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Cantidad <span className="text-brand-600">*</span>
            </label>
            <Input
              type="number" step="0.001" min="0.001" placeholder="0"
              value={cantidad} onChange={(e) => setCantidad(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Concepto</label>
            <Input placeholder="Entrada de mercancía…" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>
          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setDlgEntrada(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleEntrada} loading={saving}>Registrar entrada</Button>
          </DialogFooter>
        </div>
      </Dialog>

      {/* ── Dialog: Salida ────────────────────────────────────── */}
      <Dialog
        open={dlgSalida}
        onClose={() => { setDlgSalida(false); resetForm(); }}
        title="Registrar salida"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Artículo <span className="text-brand-600">*</span>
            </label>
            <ArticuloSearch value={artSel} onChange={setArtSel} />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Slot de existencia</label>
            <SlotSelect value={slot} onChange={setSlot} slots={slots} />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Cantidad <span className="text-brand-600">*</span>
            </label>
            <Input
              type="number" step="0.001" min="0.001" placeholder="0"
              value={cantidad} onChange={(e) => setCantidad(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Concepto <span className="text-brand-600">*</span>
            </label>
            <Input placeholder="Motivo de la salida…" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>
          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setDlgSalida(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSalida} loading={saving}>Registrar salida</Button>
          </DialogFooter>
        </div>
      </Dialog>

      {/* ── Dialog: Transferencia ─────────────────────────────── */}
      <Dialog
        open={dlgTransf}
        onClose={() => { setDlgTransf(false); resetForm(); }}
        title="Transferencia de inventario"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Artículo <span className="text-brand-600">*</span>
            </label>
            <ArticuloSearch value={artSel} onChange={setArtSel} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Origen</label>
              <SlotSelect value={slot} onChange={setSlot} slots={slots} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Destino</label>
              <SlotSelect value={slotDst} onChange={setSlotDst} slots={slots} />
            </div>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Cantidad <span className="text-brand-600">*</span>
            </label>
            <Input
              type="number" step="0.001" min="0.001" placeholder="0"
              value={cantidad} onChange={(e) => setCantidad(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Concepto</label>
            <Input placeholder="Transferencia interna…" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>
          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setDlgTransf(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleTransf} loading={saving}>Registrar transferencia</Button>
          </DialogFooter>
        </div>
      </Dialog>

      {/* ── Dialog: Ajuste ────────────────────────────────────── */}
      <Dialog
        open={dlgAjuste}
        onClose={() => { setDlgAjuste(false); resetForm(); }}
        title="Ajuste de inventario"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Artículo <span className="text-brand-600">*</span>
            </label>
            <ArticuloSearch value={artSel} onChange={setArtSel} />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Slot de existencia</label>
            <SlotSelect value={slot} onChange={setSlot} slots={slots} />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Nueva cantidad <span className="text-brand-600">*</span>
            </label>
            <Input
              type="number" step="0.001" min="0" placeholder="0"
              value={cantNueva} onChange={(e) => setCantNueva(e.target.value)}
            />
            <p className="text-meta text-steel-400 mt-1">
              Ingresa la cantidad exacta del conteo físico.
            </p>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Motivo <span className="text-brand-600">*</span>
            </label>
            <Input placeholder="Razón del ajuste…" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>
          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setDlgAjuste(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleAjuste} loading={saving}>Aplicar ajuste</Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
