'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { History, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { cn, formatFechaCorta, formatPrecio } from '@/lib/utils';

interface VentaLegacy {
  id: string;
  legacy_id: number;
  sucursal: string;
  cliente_nombre: string | null;
  total: number;
  recibido: number;
  restan: number;
  estatus: string;
  tipo_pago: string;
  fecha_hora: string;
}

interface LineaLegacy {
  id: string;
  descripcion_1: string | null;
  descripcion_2: string | null;
  descripcion_3: string | null;
  color: string | null;
  material: string | null;
  cantidad: number;
  precio_neto: number;
  total: number;
}

interface VentaDetalle {
  id: string;
  legacy_id: number;
  sucursal: string;
  cliente_nombre: string | null;
  nota: string | null;
  incidencia: string | null;
  total: number;
  recibido: number;
  cambio: number;
  restan: number;
  estatus: string;
  tipo_pago: string;
  fecha_hora: string;
  lineas: LineaLegacy[];
}

interface ListaResponse {
  data: VentaLegacy[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const SUCURSAL_ALIAS: Record<string, string> = {
  virgen:       'La Virgen',
  santa:        'Santa',
  tecamachalco: 'Tecamachalco',
  tepeaca:      'Tepeaca',
  punto_venta:  'Punto de Venta',
  sin_sucursal: 'Sin sucursal',
};

function labelSucursal(s: string): string {
  return SUCURSAL_ALIAS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const ESTATUS_COLORS: Record<string, string> = {
  PAGADA:    'bg-green-50 text-green-700',
  CANCELADA: 'bg-red-50 text-red-600',
  CREDITO:   'bg-amber-50 text-amber-700',
  PENDIENTE: 'bg-blue-50 text-blue-700',
};

const COLUMNAS_VENTAS: DataTableColumn<VentaLegacy>[] = [
  {
    key: 'fecha',
    header: 'Fecha',
    className: 'text-steel-700 whitespace-nowrap',
    render: (v) => formatFechaCorta(v.fecha_hora),
  },
  {
    key: 'cliente',
    header: 'Cliente',
    className: 'font-medium text-steel-900 max-w-[140px] truncate',
    render: (v) => v.cliente_nombre || <span className="text-steel-400 font-normal">Sin cliente</span>,
  },
  {
    key: 'sucursal',
    header: 'Suc.',
    render: (v) => (
      <span className="text-caption bg-steel-100 text-steel-600 px-2 py-0.5 rounded-full">
        {labelSucursal(v.sucursal)}
      </span>
    ),
  },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    className: 'font-medium text-steel-900',
    render: (v) => formatPrecio(v.total),
  },
  {
    key: 'estatus',
    header: 'Estatus',
    render: (v) => (
      <span className={cn(
        'text-caption px-2 py-0.5 rounded-full font-medium',
        ESTATUS_COLORS[v.estatus] ?? 'bg-steel-100 text-steel-600',
      )}>
        {v.estatus}
      </span>
    ),
  },
];

export default function HistorialLegacyPage() {
  const router = useRouter();

  const [ventas, setVentas]           = useState<VentaLegacy[]>([]);
  const [total, setTotal]             = useState(0);
  const [pages, setPages]             = useState(1);
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(true);
  const [q, setQ]                     = useState('');
  const [sucursal, setSucursal]       = useState('');
  const [desde, setDesde]             = useState('');
  const [hasta, setHasta]             = useState('');
  const [sucursales, setSucursales]   = useState<string[]>([]);

  const [selectedIdx, setSelectedIdx]       = useState(-1);
  const [detalle, setDetalle]               = useState<VentaDetalle | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  async function cargar(p = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '30' });
      if (q)       params.set('q', q);
      if (sucursal) params.set('sucursal', sucursal);
      if (desde)   params.set('desde', desde);
      if (hasta)   params.set('hasta', hasta);
      const res = await api.get<ListaResponse>(`/migracion/ventas?${params}`);
      setVentas(res.data);
      setTotal(res.total);
      setPages(res.pages);
      setPage(p);
      setSelectedIdx(-1);
      setDetalle(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar(1);
    api.get<string[]>('/migracion/ventas/sucursales').then(setSucursales).catch(() => {});
  }, []);

  async function seleccionar(idx: number) {
    if (idx < 0 || idx >= ventas.length) return;
    setSelectedIdx(idx);
    const venta = ventas[idx];
    setLoadingDetalle(true);
    try {
      const d = await api.get<VentaDetalle>(`/migracion/ventas/${venta.id}`);
      setDetalle(d);
    } finally {
      setLoadingDetalle(false);
    }
  }

  // Auto-scroll fila seleccionada
  useEffect(() => {
    rowRefs.current[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  // Navegación por teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (ventas.length === 0) return;
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        seleccionar(Math.min(selectedIdx + 1, ventas.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        seleccionar(Math.max(selectedIdx - 1, 0));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ventas, selectedIdx]);

  const descripcionLinea = (l: LineaLegacy) =>
    [l.descripcion_1, l.descripcion_2, l.descripcion_3, l.color, l.material]
      .filter(Boolean).join(' - ');

  return (
    <div className="h-[calc(100vh-56px)] md:h-[calc(100vh-56px)] flex flex-col p-3 md:p-6 gap-3 md:gap-4 overflow-hidden">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-0.5">
          <History className="h-5 w-5 text-steel-500" />
          <h1 className="text-title font-bold text-steel-900">Historial Legacy</h1>
        </div>
        <p className="text-body-sm text-steel-500">
          Solo lectura · Click para ver detalle · ↑↓ para navegar · Doble clic para abrir
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0 bg-white border border-steel-200 rounded-xl px-4 py-3">
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
          <Input
            className="pl-9 h-9"
            placeholder="Buscar cliente…"
            aria-label="Buscar cliente"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cargar(1)}
          />
        </div>

        {/* Sucursal */}
        <select
          className="h-9 px-3 border border-steel-200 rounded-lg text-body-sm text-steel-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          value={sucursal}
          onChange={(e) => setSucursal(e.target.value)}
          aria-label="Filtrar por sucursal"
        >
          <option value="">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s} value={s}>{labelSucursal(s)}</option>
          ))}
        </select>

        {/* Separador */}
        <div className="h-5 w-px bg-steel-200 hidden sm:block" />

        {/* Fechas */}
        <div className="flex items-center gap-1.5">
          <span className="text-meta text-steel-400 hidden sm:block">Desde</span>
          <input
            type="date"
            className="h-9 px-3 border border-steel-200 rounded-lg text-body-sm text-steel-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            aria-label="Fecha desde"
          />
          <span className="text-steel-300">—</span>
          <span className="text-meta text-steel-400 hidden sm:block">Hasta</span>
          <input
            type="date"
            className="h-9 px-3 border border-steel-200 rounded-lg text-body-sm text-steel-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            aria-label="Fecha hasta"
          />
        </div>

        {/* Separador */}
        <div className="h-5 w-px bg-steel-200 hidden sm:block" />

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => cargar(1)} disabled={loading}>
            <Search className="h-3.5 w-3.5 mr-1.5" />
            Buscar
          </Button>
          {(q || sucursal || desde || hasta) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setQ(''); setSucursal(''); setDesde(''); setHasta(''); }}
              disabled={loading}
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Split view — apila en móvil, lado a lado en desktop */}
      <div className="flex flex-col md:flex-row gap-3 md:gap-4 flex-1 min-h-0">

        {/* ── Lista (arriba en móvil, izquierda en desktop) ── */}
        <div className="flex flex-col h-[50%] md:h-auto md:w-[52%] min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-steel-400 text-body-sm">
              Cargando...
            </div>
          ) : ventas.length === 0 ? (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="Sin ventas históricas"
              description="Importa el archivo ventas_detalle.csv desde Configuración → Migración"
            />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-steel-200">
                <DataTable
                  columns={COLUMNAS_VENTAS}
                  rows={ventas}
                  rowKey={(v) => v.id}
                  rowRef={(el, idx) => { rowRefs.current[idx] = el; }}
                  isRowSelected={(_, idx) => selectedIdx === idx}
                  onRowClick={(_, idx) => seleccionar(idx)}
                  onRowDoubleClick={(v) => router.push(`/historial-legacy/${v.id}`)}
                />
              </div>

              {/* Paginación */}
              <div className="flex items-center justify-between pt-2 flex-shrink-0">
                <p className="text-body-sm text-steel-500">
                  {total} ventas · pág {page}/{pages}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => cargar(page - 1)} aria-label="Página anterior">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => cargar(page + 1)} aria-label="Página siguiente">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Detalle derecha ─────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!detalle && !loadingDetalle && (
            <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-steel-200">
              <p className="text-body-sm text-steel-400">Selecciona una venta para ver el detalle</p>
            </div>
          )}

          {loadingDetalle && (
            <div className="h-full flex items-center justify-center">
              <p className="text-body-sm text-steel-400">Cargando...</p>
            </div>
          )}

          {detalle && !loadingDetalle && (
            <div className="flex flex-col gap-3">
              {/* Info general */}
              <div className="bg-white rounded-xl border border-steel-200 p-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-caption text-steel-500">Fecha</p>
                  <p className="text-body font-medium text-steel-900">{formatFechaCorta(detalle.fecha_hora)}</p>
                </div>
                <div>
                  <p className="text-caption text-steel-500">Cliente</p>
                  <p className="text-body font-medium text-steel-900">{detalle.cliente_nombre || '—'}</p>
                </div>
                <div>
                  <p className="text-caption text-steel-500">Estatus</p>
                  <span className={cn(
                    'text-caption px-2 py-0.5 rounded-full font-medium',
                    ESTATUS_COLORS[detalle.estatus] ?? 'bg-steel-100 text-steel-600',
                  )}>
                    {detalle.estatus}
                  </span>
                </div>
                <div>
                  <p className="text-caption text-steel-500">Tipo de pago</p>
                  <p className="text-body font-medium text-steel-900">{detalle.tipo_pago}</p>
                </div>
                <div>
                  <p className="text-caption text-steel-500">Total</p>
                  <p className="text-body font-bold text-steel-900">{formatPrecio(detalle.total)}</p>
                </div>
                <div>
                  <p className="text-caption text-steel-500">Recibido</p>
                  <p className="text-body font-medium text-green-700">{formatPrecio(detalle.recibido)}</p>
                </div>
                {detalle.restan > 0 && (
                  <div>
                    <p className="text-caption text-steel-500">Restan</p>
                    <p className="text-body font-medium text-amber-700">{formatPrecio(detalle.restan)}</p>
                  </div>
                )}
                {detalle.nota && (
                  <div className="col-span-2">
                    <p className="text-caption text-steel-500">Nota</p>
                    <p className="text-body-sm text-steel-700">{detalle.nota}</p>
                  </div>
                )}
                {detalle.incidencia && (
                  <div className="col-span-2">
                    <p className="text-caption text-steel-500">Incidencia</p>
                    <p className="text-body-sm text-steel-700">{detalle.incidencia}</p>
                  </div>
                )}
              </div>

              {/* Líneas */}
              <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                <DataTable<LineaLegacy>
                  columns={[
                    {
                      key: 'descripcion',
                      header: 'Descripción',
                      className: 'px-4 text-steel-900',
                      render: (l) => descripcionLinea(l) || '—',
                    },
                    {
                      key: 'cantidad',
                      header: 'Cant',
                      align: 'right',
                      className: 'text-steel-700',
                      render: (l) => l.cantidad,
                    },
                    {
                      key: 'precio',
                      header: 'Precio',
                      align: 'right',
                      className: 'text-steel-700',
                      render: (l) => formatPrecio(l.precio_neto),
                    },
                    {
                      key: 'sub',
                      header: 'Sub',
                      align: 'right',
                      className: 'px-4 font-medium text-steel-900',
                      render: (l) => formatPrecio(l.total),
                    },
                  ]}
                  rows={detalle.lineas}
                  rowKey={(l) => l.id}
                  footer={
                    <tfoot className="border-t-2 border-steel-200 bg-steel-50">
                      <tr>
                        <td colSpan={3} className="px-4 py-2.5 text-right font-semibold text-steel-900">Total</td>
                        <td className="px-4 py-2.5 text-right font-bold text-steel-900">{formatPrecio(detalle.total)}</td>
                      </tr>
                    </tfoot>
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
