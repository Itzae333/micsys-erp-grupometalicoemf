'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Trash2, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useContextoStore } from '@/lib/store/contexto.store';
import { useBlockRoles } from '@/lib/hooks/use-block-roles';
import { cn, formatCantidad } from '@/lib/utils';
import type {
  Area, Articulo, ArticulosPage, ConfigColumnasSchema, Empleado, EmpleadosPage,
} from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const SELECT_CLS =
  'w-full h-9 border border-steel-300 rounded-lg px-3 text-body-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-steel-50 disabled:text-steel-400';

interface LineaCarrito {
  articulo: Articulo;
  existencia_num: number;
  cantidad: string;
}

function descripcionCompleta(art: Articulo): string {
  return [art.descripcion_1, art.descripcion_2, art.descripcion_3, art.descripcion_4, art.descripcion_5]
    .filter(Boolean).join(' · ');
}

const existenciaDe = (art: Articulo, num: number) =>
  Number(art[`existencia_${num}` as keyof Articulo] ?? 0);

export default function NuevaEntregaMateriaPrimaPage() {
  // Solo ADMIN y ENCARGADO crean entregas (mismo criterio que el backend).
  useBlockRoles(['SUPER_USUARIO', 'ALMACENISTA', 'VENDEDOR', 'JEFE_MANUFACTURA', 'JEFE_RH']);
  const router = useRouter();
  const toast = useToast();
  const { empresa, ubicacion } = useContextoStore();

  const [schema, setSchema] = useState<ConfigColumnasSchema | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [areaId, setAreaId] = useState('');
  const [empleadoId, setEmpleadoId] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catálogo (izquierda)
  const [arts, setArts] = useState<Articulo[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState('');
  const [loadingArts, setLoadingArts] = useState(false);

  const activeDescripciones = schema?.descripciones.filter((d) => d.activa) ?? [];
  const activeExistencias = schema?.existencias.filter((e) => e.activa) ?? [];
  const slotInicial = activeExistencias[0]?.numero ?? 1;

  useEffect(() => {
    api.get<Area[]>('/rh/areas').then(setAreas).catch(() => setAreas([]));
  }, []);

  useEffect(() => {
    if (!empresa?.id || !ubicacion?.id) return;
    api.get<ConfigColumnasSchema>(`/config-columnas/${empresa.id}/${ubicacion.id}/schema`)
      .then(setSchema).catch(() => setSchema(null));
  }, [empresa?.id, ubicacion?.id]);

  // Empleados del área elegida
  useEffect(() => {
    setEmpleadoId('');
    if (!areaId) { setEmpleados([]); return; }
    api.get<EmpleadosPage>(`/rh/empleados?areaId=${areaId}&activo=true&limit=100`)
      .then((r) => setEmpleados(r.data)).catch(() => setEmpleados([]));
  }, [areaId]);

  const cargarArticulos = useCallback(async (p: number, search: string) => {
    setLoadingArts(true);
    try {
      const qp = new URLSearchParams({ page: String(p), limit: '15' });
      if (search) qp.set('q', search);
      const res = await api.get<ArticulosPage>(`/articulos?${qp}`);
      setArts(res.data);
      setPages(res.pages);
      setPage(p);
    } finally {
      setLoadingArts(false);
    }
  }, []);

  // Debounce de búsqueda
  useEffect(() => {
    const t = setTimeout(() => { void cargarArticulos(1, q); }, 300);
    return () => clearTimeout(t);
  }, [q, cargarArticulos]);

  function addLinea(art: Articulo) {
    setLineas((prev) => {
      if (prev.some((l) => l.articulo.id === art.id)) {
        return prev.map((l) =>
          l.articulo.id === art.id ? { ...l, cantidad: String((Number(l.cantidad) || 0) + 1) } : l);
      }
      return [...prev, { articulo: art, existencia_num: slotInicial, cantidad: '1' }];
    });
  }

  const updateLinea = (idx: number, patch: Partial<LineaCarrito>) =>
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLinea = (idx: number) => setLineas((prev) => prev.filter((_, i) => i !== idx));

  async function guardar() {
    setError(null);
    if (!areaId) { setError('Selecciona el área'); return; }
    if (lineas.length === 0) { setError('Agrega al menos un artículo'); return; }
    for (const l of lineas) {
      const c = Number(l.cantidad);
      if (!c || c <= 0) { setError(`Indica la cantidad de ${l.articulo.clave}`); return; }
      const hay = existenciaDe(l.articulo, l.existencia_num);
      if (c > hay) { setError(`${l.articulo.clave}: solo hay ${formatCantidad(hay)} en existencia`); return; }
    }
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>('/entregas-materia-prima', {
        area_id: areaId,
        empleado_id: empleadoId || undefined,
        observaciones: observaciones || undefined,
        lineas: lineas.map((l) => ({
          articulo_id: l.articulo.id, existencia_num: l.existencia_num, cantidad: Number(l.cantidad),
        })),
      });
      toast('Entrega registrada', 'success');
      router.push(`/entregas-materia-prima/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar la entrega');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-steel-200 bg-white flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.back()} className="text-steel-500 hover:text-steel-900 transition-colors">←</button>
        <div>
          <h1 className="text-display-sm font-bold text-steel-900">Nueva entrega de materia prima</h1>
          <p className="text-body-sm text-steel-500">
            Sale del inventario de {ubicacion?.nombre ?? '—'} y se descuenta al registrar
          </p>
        </div>
      </div>

      {/* Área, quién recibe y observaciones */}
      <div className="px-4 md:px-6 py-4 bg-white border-b border-steel-200 flex-shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <p className="text-meta font-medium text-steel-500 uppercase tracking-wide">Área</p>
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={SELECT_CLS}>
              <option value="">Selecciona…</option>
              {areas.filter((a) => a.activa).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-meta font-medium text-steel-500 uppercase tracking-wide">Quién recibe</p>
            <select
              value={empleadoId}
              onChange={(e) => setEmpleadoId(e.target.value)}
              disabled={!areaId}
              className={SELECT_CLS}
            >
              <option value="">Sin indicar</option>
              {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre} {e.apellidos}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-meta font-medium text-steel-500 uppercase tracking-wide">Observaciones</p>
            <Input
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Opcional"
              className="h-9"
            />
          </div>
        </div>
      </div>

      {/* Split-view: catálogo | carrito */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Catálogo */}
        <div className="h-[45%] md:h-auto md:w-[62%] flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-steel-200">
          <div className="px-4 py-3 bg-steel-50 border-b border-steel-100 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
              <input
                className="h-9 w-full rounded-md border border-steel-300 bg-white pl-9 pr-3 text-body text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                placeholder="Buscar artículo por clave o descripción…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loadingArts ? (
              <div className="flex items-center justify-center h-32 text-body-sm text-steel-400">Cargando…</div>
            ) : arts.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-body-sm text-steel-400">Sin resultados</div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-steel-50 border-b border-steel-200 z-10">
                  <tr>
                    {activeDescripciones.map((d) => (
                      <th key={d.numero} className="px-4 py-2.5 text-eyebrow text-steel-500 tracking-widest uppercase">
                        {d.label}
                      </th>
                    ))}
                    {activeExistencias.map((e) => (
                      <th key={e.numero} className="px-3 py-2.5 text-eyebrow text-steel-500 tracking-widest uppercase text-right w-24">
                        {e.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100 bg-white">
                  {arts.map((art) => {
                    const enCarrito = lineas.find((l) => l.articulo.id === art.id);
                    return (
                      <tr
                        key={art.id}
                        onClick={() => addLinea(art)}
                        className={cn('cursor-pointer transition-colors hover:bg-brand-50', enCarrito && 'bg-green-50')}
                      >
                        {activeDescripciones.map((d) => (
                          <td key={d.numero} className="px-4 py-2.5">
                            <span className="text-table text-steel-900 block max-w-[200px] truncate">
                              {(art[`descripcion_${d.numero}` as keyof Articulo] as string | null) ?? '—'}
                            </span>
                          </td>
                        ))}
                        {activeExistencias.map((e, i) => {
                          const val = art[`existencia_${e.numero}` as keyof Articulo] as number | null;
                          return (
                            <td key={e.numero} className="px-3 py-2.5 text-right whitespace-nowrap">
                              <span className={cn(
                                'text-table tabular-nums font-medium',
                                val !== null && val !== undefined && val <= 0 ? 'text-brand-600' : 'text-steel-800',
                              )}>
                                {val !== null && val !== undefined ? val.toFixed(0) : '—'}
                              </span>
                              {i === 0 && enCarrito && (
                                <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                                  x{enCarrito.cantidad}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-2 bg-white border-t border-steel-100 flex-shrink-0">
            <Button variant="secondary" size="sm" disabled={page <= 1}
              onClick={() => void cargarArticulos(page - 1, q)} aria-label="Página anterior">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-body-sm text-steel-500">Pág {page}/{pages}</span>
            <Button variant="secondary" size="sm" disabled={page >= pages}
              onClick={() => void cargarArticulos(page + 1, q)} aria-label="Página siguiente">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Carrito */}
        <div className="flex-1 flex flex-col min-h-0 min-h-[200px]">
          <div className="flex-1 overflow-y-auto">
            {lineas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-steel-400 p-8">
                <p className="text-body-sm text-center">Sin artículos — haz clic en un producto del catálogo</p>
              </div>
            ) : (
              <table className="w-full text-body-sm">
                <thead className="sticky top-0 bg-steel-50 border-b border-steel-200 z-10">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-steel-600">Artículo</th>
                    <th className="text-left px-2 py-2.5 font-medium text-steel-600">Sale de</th>
                    <th className="text-right px-2 py-2.5 font-medium text-steel-600 w-20">Cant</th>
                    <th className="px-2 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {lineas.map((l, idx) => {
                    const hay = existenciaDe(l.articulo, l.existencia_num);
                    const excede = Number(l.cantidad) > hay;
                    return (
                      <tr key={l.articulo.id} className="bg-white">
                        <td className="px-4 py-2.5 min-w-0">
                          <p className="font-semibold text-steel-900 leading-tight break-words">
                            {descripcionCompleta(l.articulo) || l.articulo.clave}
                          </p>
                          <p className="text-meta text-steel-400">{l.articulo.clave}</p>
                        </td>
                        <td className="px-2 py-2.5">
                          <select
                            value={l.existencia_num}
                            onChange={(e) => updateLinea(idx, { existencia_num: Number(e.target.value) })}
                            className="h-8 border border-steel-300 rounded px-2 text-body-sm bg-white"
                            aria-label="Existencia de origen"
                          >
                            {activeExistencias.map((e) => <option key={e.numero} value={e.numero}>{e.label}</option>)}
                          </select>
                          <p className={cn('text-meta mt-0.5', excede ? 'text-brand-600' : 'text-steel-400')}>
                            hay {formatCantidad(hay)}
                          </p>
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <input
                            type="number" min={0} step="any" value={l.cantidad}
                            onChange={(e) => updateLinea(idx, { cantidad: e.target.value })}
                            className={cn(
                              'w-16 border rounded px-2 py-1 text-body-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-500',
                              excede ? 'border-brand-600' : 'border-steel-300',
                            )}
                            aria-label="Cantidad"
                          />
                        </td>
                        <td className="px-2 py-2.5">
                          <button onClick={() => removeLinea(idx)}
                            className="text-steel-300 hover:text-brand-600 transition-colors" aria-label="Quitar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer carrito */}
          <div className="border-t border-steel-200 bg-steel-50 flex-shrink-0">
            <div className="px-4 py-3">
              <span className="text-body-sm text-steel-500">
                {lineas.length} artículo{lineas.length !== 1 ? 's' : ''}
              </span>
            </div>
            {error && (
              <div className="mx-4 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-body-sm text-red-700">
                {error}
              </div>
            )}
            <div className="px-4 pb-4 flex gap-2">
              <Button variant="ghost" onClick={() => router.back()} disabled={saving} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={saving} className="flex-1">
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? 'Guardando…' : 'Registrar entrega'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
