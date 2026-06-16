'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { History, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { formatFechaCorta } from '@/lib/utils';
import { cn } from '@/lib/utils';

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

const ESTATUS_COLORS: Record<string, string> = {
  PAGADA:    'bg-green-50 text-green-700',
  CANCELADA: 'bg-red-50 text-red-600',
  CREDITO:   'bg-amber-50 text-amber-700',
  PENDIENTE: 'bg-blue-50 text-blue-700',
};

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

  useEffect(() => { cargar(1); }, []);

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
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
          <Input
            className="pl-9"
            placeholder="Buscar cliente..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cargar(1)}
          />
        </div>
        <select
          className="px-3 py-2 border border-steel-300 rounded-lg text-body-sm text-steel-700 bg-white"
          value={sucursal}
          onChange={(e) => setSucursal(e.target.value)}
        >
          <option value="">Todas las sucursales</option>
          <option value="virgen">Principal</option>
          <option value="punto_venta">Punto de venta</option>
        </select>
        <Input type="date" className="w-36" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Input type="date" className="w-36" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <Button variant="secondary" onClick={() => cargar(1)} disabled={loading}>Buscar</Button>
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
                <table className="w-full text-body-sm">
                  <thead className="sticky top-0 bg-steel-50 border-b border-steel-200 z-10">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-medium text-steel-600">Fecha</th>
                      <th className="text-left px-3 py-2.5 font-medium text-steel-600">Cliente</th>
                      <th className="text-left px-3 py-2.5 font-medium text-steel-600">Suc.</th>
                      <th className="text-right px-3 py-2.5 font-medium text-steel-600">Total</th>
                      <th className="text-left px-3 py-2.5 font-medium text-steel-600">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {ventas.map((v, idx) => (
                      <tr
                        key={v.id}
                        ref={(el) => { rowRefs.current[idx] = el; }}
                        className={cn(
                          'cursor-pointer transition-colors',
                          selectedIdx === idx
                            ? 'bg-brand-50 border-l-2 border-l-brand-600'
                            : 'hover:bg-steel-50',
                        )}
                        onClick={() => seleccionar(idx)}
                        onDoubleClick={() => router.push(`/historial-legacy/${v.id}`)}
                      >
                        <td className="px-3 py-2.5 text-steel-700 whitespace-nowrap">
                          {formatFechaCorta(v.fecha_hora)}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-steel-900 max-w-[140px] truncate">
                          {v.cliente_nombre || <span className="text-steel-400 font-normal">Sin cliente</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-caption bg-steel-100 text-steel-600 px-2 py-0.5 rounded-full">
                            {v.sucursal === 'virgen' ? 'Princ.' : 'PV'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-steel-900">
                          ${v.total.toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn(
                            'text-caption px-2 py-0.5 rounded-full font-medium',
                            ESTATUS_COLORS[v.estatus] ?? 'bg-steel-100 text-steel-600',
                          )}>
                            {v.estatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              <div className="flex items-center justify-between pt-2 flex-shrink-0">
                <p className="text-body-sm text-steel-500">
                  {total} ventas · pág {page}/{pages}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => cargar(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => cargar(page + 1)}>
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
                  <p className="text-body font-bold text-steel-900">${detalle.total.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-caption text-steel-500">Recibido</p>
                  <p className="text-body font-medium text-green-700">${detalle.recibido.toFixed(2)}</p>
                </div>
                {detalle.restan > 0 && (
                  <div>
                    <p className="text-caption text-steel-500">Restan</p>
                    <p className="text-body font-medium text-amber-700">${detalle.restan.toFixed(2)}</p>
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
                <table className="w-full text-body-sm">
                  <thead className="bg-steel-50 border-b border-steel-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-steel-600">Descripción</th>
                      <th className="text-right px-3 py-2.5 font-medium text-steel-600">Cant</th>
                      <th className="text-right px-3 py-2.5 font-medium text-steel-600">Precio</th>
                      <th className="text-right px-4 py-2.5 font-medium text-steel-600">Sub</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {detalle.lineas.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5 text-steel-900">{descripcionLinea(l) || '—'}</td>
                        <td className="px-3 py-2.5 text-right text-steel-700">{l.cantidad}</td>
                        <td className="px-3 py-2.5 text-right text-steel-700">${l.precio_neto.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-steel-900">${l.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-steel-200 bg-steel-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-2.5 text-right font-semibold text-steel-900">Total</td>
                      <td className="px-4 py-2.5 text-right font-bold text-steel-900">${detalle.total.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
