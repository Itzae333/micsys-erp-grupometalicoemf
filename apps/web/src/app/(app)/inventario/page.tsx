'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Package, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Metadata } from 'next';
import { api, ApiError } from '@/lib/api/client';
import { useContextoStore } from '@/lib/store/contexto.store';
import { useAuthStore } from '@/lib/store/auth.store';
import type { Articulo, ArticulosPage, ConfigColumnasSchema, Proveedor } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const ArticuloSchema = z.object({
  clave: z.string().min(1, 'Requerido').max(40),
  proveedor_id: z.string().optional(),
  precio_1: z.coerce.number().min(0).optional(),
  precio_2: z.coerce.number().min(0).optional(),
  precio_3: z.coerce.number().min(0).optional(),
  precio_4: z.coerce.number().min(0).optional(),
  precio_5: z.coerce.number().min(0).optional(),
  precio_6: z.coerce.number().min(0).optional(),
  precio_7: z.coerce.number().min(0).optional(),
  precio_8: z.coerce.number().min(0).optional(),
  precio_9: z.coerce.number().min(0).optional(),
  precio_10: z.coerce.number().min(0).optional(),
  existencia_1: z.coerce.number().min(0).optional(),
  existencia_2: z.coerce.number().min(0).optional(),
  existencia_3: z.coerce.number().min(0).optional(),
  existencia_4: z.coerce.number().min(0).optional(),
  existencia_5: z.coerce.number().min(0).optional(),
  descripcion_1: z.string().min(1, 'Requerido'),
  descripcion_2: z.string().min(1, 'Requerido'),
  descripcion_3: z.string().optional(),
  descripcion_4: z.string().optional(),
  descripcion_5: z.string().optional(),
});

type ArticuloForm = z.infer<typeof ArticuloSchema>;


function generarClave(d1: string, d2: string): string {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ' ');
  const palabras = norm(`${d1} ${d2}`).split(/\s+/).filter(Boolean);
  const base = palabras.map((p) => p.slice(0, 4)).join('-').slice(0, 24);
  return `${base}-001`;
}

function incrementarClave(clave: string): string {
  const match = clave.match(/^(.*-)(\d+)$/);
  if (!match) return `${clave}-002`;
  const siguiente = String(parseInt(match[2]) + 1).padStart(match[2].length, '0');
  return `${match[1]}${siguiente}`;
}

export default function InventarioPage() {
  const router = useRouter();
  const { empresa, ubicacion } = useContextoStore();
  const { usuario } = useAuthStore();

  const [result, setResult] = useState<ArticulosPage | null>(null);
  const [schema, setSchema] = useState<ConfigColumnasSchema | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Articulo | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const claveEditada = useRef(false);

  const canWrite = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA'].includes(usuario?.rol ?? '');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ArticuloForm>({ resolver: zodResolver(ArticuloSchema) });

  const desc1 = watch('descripcion_1');
  const desc2 = watch('descripcion_2');

  useEffect(() => {
    if (!editTarget && !claveEditada.current && (desc1 || desc2)) {
      setValue('clave', generarClave(desc1 ?? '', desc2 ?? ''));
    }
  }, [desc1, desc2, editTarget, setValue]);

  const loadSchema = useCallback(async () => {
    if (!empresa?.id || !ubicacion?.id) return;
    try {
      const s = await api.get<ConfigColumnasSchema>(
        `/config-columnas/${empresa.id}/${ubicacion.id}/schema`,
      );
      setSchema(s);
    } catch {
      setSchema({ precios: [], existencias: [], descripciones: [] });
    }
  }, [empresa?.id, ubicacion?.id]);

  const loadArticulos = useCallback(async () => {
    if (!empresa?.id || !ubicacion?.id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (q) params.set('q', q);
      const data = await api.get<ArticulosPage>(`/articulos?${params}`);
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, ubicacion?.id, page, q]);

  const loadProveedores = useCallback(async () => {
    if (!empresa?.id || !ubicacion?.id) return;
    try {
      const data = await api.get<Proveedor[]>('/proveedores');
      setProveedores(data);
    } catch {
      setProveedores([]);
    }
  }, [empresa?.id, ubicacion?.id]);

  useEffect(() => {
    loadSchema();
    loadProveedores();
  }, [loadSchema, loadProveedores]);

  useEffect(() => {
    loadArticulos();
  }, [loadArticulos]);

  function openCreate() {
    setEditTarget(null);
    claveEditada.current = false;
    reset({});
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(art: Articulo) {
    setEditTarget(art);
    claveEditada.current = true;
    reset({
      clave: art.clave,
      proveedor_id: art.proveedor_id ?? '',
      descripcion_1: art.descripcion_1 ?? '',
      descripcion_2: art.descripcion_2 ?? '',
      descripcion_3: art.descripcion_3 ?? undefined,
      descripcion_4: art.descripcion_4 ?? undefined,
      descripcion_5: art.descripcion_5 ?? undefined,
      precio_1: art.precio_1 ?? undefined,
      precio_2: art.precio_2 ?? undefined,
      precio_3: art.precio_3 ?? undefined,
      precio_4: art.precio_4 ?? undefined,
      precio_5: art.precio_5 ?? undefined,
      precio_6: art.precio_6 ?? undefined,
      precio_7: art.precio_7 ?? undefined,
      precio_8: art.precio_8 ?? undefined,
      precio_9: art.precio_9 ?? undefined,
      precio_10: art.precio_10 ?? undefined,
      existencia_1: art.existencia_1 ?? undefined,
      existencia_2: art.existencia_2 ?? undefined,
      existencia_3: art.existencia_3 ?? undefined,
      existencia_4: art.existencia_4 ?? undefined,
      existencia_5: art.existencia_5 ?? undefined,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function onSubmit(data: ArticuloForm) {
    setFormError(null);
    const payload = {
      ...data,
      proveedor_id: data.proveedor_id || undefined,
    };
    try {
      if (editTarget) {
        await api.patch(`/articulos/${editTarget.id}`, payload);
      } else {
        await api.post('/articulos', payload);
      }
      setDialogOpen(false);
      reset({});
      loadArticulos();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const siguiente = incrementarClave(data.clave);
        setValue('clave', siguiente);
        setFormError(`Clave "${data.clave}" ya existe — se sugiere "${siguiente}"`);
      } else {
        setFormError(err instanceof Error ? err.message : 'Error al guardar');
      }
    }
  }

  const activePrices = schema?.precios.filter((p) => p.activa) ?? [];
  const activeExistencias = schema?.existencias.filter((e) => e.activa) ?? [];
  const activeDescripciones = schema?.descripciones.filter((d) => d.activa) ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-steel-200 bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">
            {empresa?.nombre} · {ubicacion?.nombre}
          </p>
          <h1 className="text-display-md font-bold text-steel-900">Inventario</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => router.push('/inventario/proveedores')}
          >
            Proveedores
          </Button>
          {canWrite && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo artículo
            </Button>
          )}
        </div>
      </div>

      {/* Barra de búsqueda */}
      <div className="px-6 py-3 border-b border-steel-100 bg-white flex-shrink-0">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
          <input
            type="text"
            placeholder="Buscar por clave o nombre…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-8 py-2 text-body-sm border border-steel-200 rounded-lg bg-steel-50 focus:bg-white focus:border-brand-600 focus:outline-none transition-colors"
          />
          {q && (
            <button
              onClick={() => { setQ(''); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-10 bg-steel-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !result || result.data.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title={q ? 'Sin resultados' : 'Sin artículos'}
              description={q ? `No hay artículos que coincidan con "${q}"` : 'Agrega el primer artículo al inventario.'}
              action={canWrite && !q ? { label: 'Nuevo artículo', onClick: openCreate } : undefined}
            />
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-steel-50 border-b border-steel-200 z-10">
              <tr>
                <th className="px-4 py-2.5 text-eyebrow text-steel-500 tracking-widest uppercase w-32">Clave</th>
                {activeDescripciones.map((d) => (
                  <th key={d.numero} className="px-4 py-2.5 text-eyebrow text-steel-500 tracking-widest uppercase">
                    {d.label}
                  </th>
                ))}
                {activePrices.map((p) => (
                  <th key={p.numero} className="px-3 py-2.5 text-eyebrow text-steel-500 tracking-widest uppercase text-right w-24">
                    {p.label}
                  </th>
                ))}
                {activeExistencias.map((e) => (
                  <th key={e.numero} className="px-3 py-2.5 text-eyebrow text-steel-500 tracking-widest uppercase text-right w-24">
                    {e.label}
                  </th>
                ))}
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {result.data.map((art) => (
                <tr
                  key={art.id}
                  className={cn(
                    'hover:bg-steel-50 transition-colors cursor-pointer',
                    !art.activo && 'opacity-50',
                  )}
                  onDoubleClick={() => canWrite ? openEdit(art) : router.push(`/inventario/${art.id}`)}
                >
                  <td className="px-4 py-2.5">
                    <span className="text-table font-mono text-steel-700 font-medium">{art.clave}</span>
                  </td>
                  {activeDescripciones.map((d) => (
                    <td key={d.numero} className="px-4 py-2.5">
                      <span className="text-table text-steel-900 truncate block max-w-[200px]">
                        {(art[`descripcion_${d.numero}` as keyof Articulo] as string | null) ?? '—'}
                      </span>
                    </td>
                  ))}
                  {activePrices.map((p) => {
                    const val = art[`precio_${p.numero}` as keyof Articulo] as number | null;
                    return (
                      <td key={p.numero} className="px-3 py-2.5 text-right">
                        <span className="text-table text-steel-800 font-medium tabular-nums">
                          {val !== null && val !== undefined ? `$${val.toFixed(2)}` : '—'}
                        </span>
                      </td>
                    );
                  })}
                  {activeExistencias.map((e) => {
                    const val = art[`existencia_${e.numero}` as keyof Articulo] as number | null;
                    return (
                      <td key={e.numero} className="px-3 py-2.5 text-right">
                        <span className={cn(
                          'text-table tabular-nums font-medium',
                          val !== null && val !== undefined && val <= 0
                            ? 'text-brand-600'
                            : 'text-steel-800',
                        )}>
                          {val !== null && val !== undefined ? val.toFixed(0) : '—'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {canWrite && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(art); }}
                        className="text-steel-400 hover:text-steel-700 text-body-sm px-2 py-1 rounded hover:bg-steel-100"
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {result && result.pages > 1 && (
        <div className="px-6 py-3 border-t border-steel-200 bg-white flex items-center justify-between flex-shrink-0">
          <span className="text-body-sm text-steel-500">
            {result.total} artículos · página {result.page} de {result.pages}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="p-1.5 rounded hover:bg-steel-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= result.pages}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded hover:bg-steel-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); reset({}); setFormError(null); }}
        title={editTarget ? `Editar: ${editTarget.clave}` : 'Nuevo artículo'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Descripciones obligatorias */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                {activeDescripciones[0]?.label ?? 'Descripción 1'} <span className="text-brand-600">*</span>
              </label>
              <Input
                placeholder="Ej. Lámina Galvanizada"
                error={errors.descripcion_1?.message}
                {...register('descripcion_1')}
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                {activeDescripciones[1]?.label ?? 'Descripción 2'} <span className="text-brand-600">*</span>
              </label>
              <Input
                placeholder="Ej. Cal.14"
                error={errors.descripcion_2?.message}
                {...register('descripcion_2')}
              />
            </div>
          </div>

          {/* Descripciones opcionales */}
          {activeDescripciones.slice(2).length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {activeDescripciones.slice(2).map((d) => (
                <div key={d.numero}>
                  <label className="block text-body-sm font-medium text-steel-900 mb-1.5">{d.label}</label>
                  <Input
                    placeholder={d.label}
                    {...register(`descripcion_${d.numero}` as keyof ArticuloForm)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Clave */}
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Clave <span className="text-brand-600">*</span>
            </label>
            <Input
              placeholder="AUTO"
              className="uppercase"
              error={errors.clave?.message}
              {...register('clave', {
                onChange: () => { claveEditada.current = true; },
              })}
            />
          </div>

          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Proveedor
            </label>
            <Select {...register('proveedor_id')}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </Select>
          </div>

          {/* Precios activos */}
          {activePrices.length > 0 && (
            <div>
              <p className="text-body-sm font-semibold text-steel-700 mb-3">Precios</p>
              <div className="grid grid-cols-2 gap-3">
                {activePrices.map((p) => (
                  <div key={p.numero}>
                    <label className="block text-meta text-steel-600 mb-1">{p.label}</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...register(`precio_${p.numero}` as keyof ArticuloForm)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existencias activas */}
          {activeExistencias.length > 0 && (
            <div>
              <p className="text-body-sm font-semibold text-steel-700 mb-3">Existencias</p>
              <div className="grid grid-cols-3 gap-3">
                {activeExistencias.map((e) => (
                  <div key={e.numero}>
                    <label className="block text-meta text-steel-600 mb-1">{e.label}</label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="0"
                      {...register(`existencia_${e.numero}` as keyof ArticuloForm)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setDialogOpen(false); reset({}); setFormError(null); }}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editTarget ? 'Guardar cambios' : 'Crear artículo'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
