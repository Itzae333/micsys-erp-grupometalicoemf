'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Package, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { useContextoStore } from '@/lib/store/contexto.store';
import { useAuthStore } from '@/lib/store/auth.store';
import type { Articulo, ConfigColumnasSchema, Proveedor } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { formatFecha } from '@/lib/utils';

const PreciosSchema = z.object({
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
});

const ExistenciasSchema = z.object({
  existencia_1: z.coerce.number().min(0).optional(),
  existencia_2: z.coerce.number().min(0).optional(),
  existencia_3: z.coerce.number().min(0).optional(),
  existencia_4: z.coerce.number().min(0).optional(),
  existencia_5: z.coerce.number().min(0).optional(),
});

const InfoSchema = z.object({
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
  unidad_medida: z.string().min(1),
  proveedor_id: z.string().optional(),
});

const UNIDADES = ['PZA', 'KG', 'MT', 'LT', 'M2', 'TON', 'ROLLO', 'CAJA', 'PAR', 'JGO'];

export default function ArticuloDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { empresa, ubicacion } = useContextoStore();
  const { usuario } = useAuthStore();

  const id = params.id as string;
  const [articulo, setArticulo] = useState<Articulo | null>(null);
  const [schema, setSchema] = useState<ConfigColumnasSchema | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [preciosOpen, setPreciosOpen] = useState(false);
  const [existenciasOpen, setExistenciasOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canWrite = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA'].includes(usuario?.rol ?? '');
  const canEditPrecios = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');

  const infoForm = useForm<z.infer<typeof InfoSchema>>({ resolver: zodResolver(InfoSchema) });
  const preciosForm = useForm<z.infer<typeof PreciosSchema>>({ resolver: zodResolver(PreciosSchema) });
  const existenciasForm = useForm<z.infer<typeof ExistenciasSchema>>({ resolver: zodResolver(ExistenciasSchema) });

  async function load() {
    if (!empresa?.id || !ubicacion?.id) return;
    setLoading(true);
    try {
      const [art, s, provs] = await Promise.all([
        api.get<Articulo>(`/articulos/${id}`),
        api.get<ConfigColumnasSchema>(`/config-columnas/${empresa.id}/${ubicacion.id}`),
        api.get<Proveedor[]>('/proveedores'),
      ]);
      setArticulo(art);
      setSchema(s);
      setProveedores(provs);
    } catch {
      router.replace('/inventario');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id, empresa?.id, ubicacion?.id]);

  function openInfo() {
    if (!articulo) return;
    infoForm.reset({
      nombre: articulo.descripcion_1 ?? '',
      descripcion: articulo.descripcion_2 ?? '',
      unidad_medida: '',
      proveedor_id: articulo.proveedor_id ?? '',
    });
    setSaveError(null);
    setInfoOpen(true);
  }

  function openPrecios() {
    if (!articulo) return;
    preciosForm.reset({
      precio_1: articulo.precio_1 ?? undefined,
      precio_2: articulo.precio_2 ?? undefined,
      precio_3: articulo.precio_3 ?? undefined,
      precio_4: articulo.precio_4 ?? undefined,
      precio_5: articulo.precio_5 ?? undefined,
      precio_6: articulo.precio_6 ?? undefined,
      precio_7: articulo.precio_7 ?? undefined,
      precio_8: articulo.precio_8 ?? undefined,
      precio_9: articulo.precio_9 ?? undefined,
      precio_10: articulo.precio_10 ?? undefined,
    });
    setSaveError(null);
    setPreciosOpen(true);
  }

  function openExistencias() {
    if (!articulo) return;
    existenciasForm.reset({
      existencia_1: articulo.existencia_1 ?? undefined,
      existencia_2: articulo.existencia_2 ?? undefined,
      existencia_3: articulo.existencia_3 ?? undefined,
      existencia_4: articulo.existencia_4 ?? undefined,
      existencia_5: articulo.existencia_5 ?? undefined,
    });
    setSaveError(null);
    setExistenciasOpen(true);
  }

  async function saveInfo(data: z.infer<typeof InfoSchema>) {
    setSaveError(null);
    try {
      await api.patch(`/articulos/${id}`, data);
      setInfoOpen(false);
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  async function savePrecios(data: z.infer<typeof PreciosSchema>) {
    setSaveError(null);
    try {
      await api.patch(`/articulos/${id}/precios`, data);
      setPreciosOpen(false);
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  async function saveExistencias(data: z.infer<typeof ExistenciasSchema>) {
    setSaveError(null);
    try {
      await api.patch(`/articulos/${id}/existencias`, data);
      setExistenciasOpen(false);
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  async function toggleActivo() {
    if (!articulo) return;
    await api.patch(`/articulos/${id}`, { activo: !articulo.activo });
    load();
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-48 bg-steel-100 rounded animate-pulse" />
        <div className="h-40 bg-steel-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!articulo) return null;

  const activePrices = schema?.precios.filter((p) => p.activa) ?? [];
  const activeExistencias = schema?.existencias.filter((e) => e.activa) ?? [];

  return (
    <div className="p-6 max-w-4xl">
      {/* Nav */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-steel-500 hover:text-steel-800 text-body-sm mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Inventario
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-600/10 flex items-center justify-center flex-shrink-0">
            <Package className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-display-sm font-bold text-steel-900">{articulo.clave}</h1>
              <Badge variant={articulo.activo ? 'paid' : 'default'}>
                {articulo.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <p className="text-body text-steel-600">{articulo.descripcion_1 ?? ''}</p>
            {articulo.proveedor && (
              <p className="text-body-sm text-steel-400 mt-0.5">{articulo.proveedor.nombre}</p>
            )}
          </div>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openInfo}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Editar info
            </Button>
            <button
              onClick={toggleActivo}
              className="flex items-center gap-1.5 text-body-sm text-steel-500 hover:text-steel-800 px-3 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors"
            >
              {articulo.activo ? (
                <><ToggleRight className="h-4 w-4 text-green-500" /> Desactivar</>
              ) : (
                <><ToggleLeft className="h-4 w-4 text-steel-400" /> Activar</>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Precios */}
        <div className="bg-white border border-steel-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body font-semibold text-steel-900">Precios</h2>
            {canEditPrecios && (
              <button
                onClick={openPrecios}
                className="text-body-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                Editar
              </button>
            )}
          </div>
          {activePrices.length === 0 ? (
            <p className="text-body-sm text-steel-400">Sin columnas de precio configuradas.</p>
          ) : (
            <dl className="space-y-2.5">
              {activePrices.map((p) => {
                const val = articulo[`precio_${p.numero}` as keyof Articulo] as number | null;
                return (
                  <div key={p.numero} className="flex items-center justify-between">
                    <dt className="text-body-sm text-steel-600">{p.label}</dt>
                    <dd className="text-body font-semibold text-steel-900 tabular-nums">
                      {val !== null && val !== undefined ? `$${val.toFixed(2)}` : '—'}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </div>

        {/* Existencias */}
        <div className="bg-white border border-steel-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body font-semibold text-steel-900">Existencias</h2>
            {canWrite && (
              <button
                onClick={openExistencias}
                className="text-body-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                Editar
              </button>
            )}
          </div>
          {activeExistencias.length === 0 ? (
            <p className="text-body-sm text-steel-400">Sin columnas de existencia configuradas.</p>
          ) : (
            <dl className="space-y-2.5">
              {activeExistencias.map((e) => {
                const val = articulo[`existencia_${e.numero}` as keyof Articulo] as number | null;
                return (
                  <div key={e.numero} className="flex items-center justify-between">
                    <dt className="text-body-sm text-steel-600">{e.label}</dt>
                    <dd className={`text-body font-semibold tabular-nums ${val !== null && val !== undefined && val <= 0 ? 'text-brand-600' : 'text-steel-900'}`}>
                      {val !== null && val !== undefined ? val.toFixed(0) : '—'}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </div>

        {/* Info */}
        <div className="bg-white border border-steel-200 rounded-xl p-5 md:col-span-2">
          <h2 className="text-body font-semibold text-steel-900 mb-4">Información</h2>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <dt className="text-meta text-steel-500 mb-0.5">Unidad de medida</dt>
              <dd className="text-body text-steel-900 font-medium">—</dd>
            </div>
            <div>
              <dt className="text-meta text-steel-500 mb-0.5">Proveedor</dt>
              <dd className="text-body text-steel-900">{articulo.proveedor?.nombre ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-meta text-steel-500 mb-0.5">Alta</dt>
              <dd className="text-body text-steel-900">{formatFecha(articulo.created_at)}</dd>
            </div>
            <div>
              <dt className="text-meta text-steel-500 mb-0.5">Última modificación</dt>
              <dd className="text-body text-steel-900">{formatFecha(articulo.updated_at)}</dd>
            </div>
            {articulo.descripcion_1 && (
              <div className="col-span-2 md:col-span-4">
                <dt className="text-meta text-steel-500 mb-0.5">Descripción</dt>
                <dd className="text-body text-steel-700">{articulo.descripcion_1}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Dialog: editar info */}
      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} title="Editar información" size="md">
        <form onSubmit={infoForm.handleSubmit(saveInfo)} className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Nombre</label>
            <Input error={infoForm.formState.errors.nombre?.message} {...infoForm.register('nombre')} />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Unidad de medida</label>
            <Select {...infoForm.register('unidad_medida')}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Proveedor</label>
            <Select {...infoForm.register('proveedor_id')}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Descripción</label>
            <Textarea rows={2} {...infoForm.register('descripcion')} />
          </div>
          {saveError && <p className="text-body-sm text-brand-600">{saveError}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setInfoOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={infoForm.formState.isSubmitting}>Guardar</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Dialog: editar precios */}
      <Dialog open={preciosOpen} onClose={() => setPreciosOpen(false)} title="Editar precios" size="md">
        <form onSubmit={preciosForm.handleSubmit(savePrecios)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {activePrices.map((p) => (
              <div key={p.numero}>
                <label className="block text-body-sm font-medium text-steel-900 mb-1.5">{p.label}</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...preciosForm.register(`precio_${p.numero}` as keyof z.infer<typeof PreciosSchema>)}
                />
              </div>
            ))}
          </div>
          {saveError && <p className="text-body-sm text-brand-600">{saveError}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPreciosOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={preciosForm.formState.isSubmitting}>Guardar precios</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Dialog: editar existencias */}
      <Dialog open={existenciasOpen} onClose={() => setExistenciasOpen(false)} title="Editar existencias" size="md">
        <form onSubmit={existenciasForm.handleSubmit(saveExistencias)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {activeExistencias.map((e) => (
              <div key={e.numero}>
                <label className="block text-body-sm font-medium text-steel-900 mb-1.5">{e.label}</label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="0"
                  {...existenciasForm.register(`existencia_${e.numero}` as keyof z.infer<typeof ExistenciasSchema>)}
                />
              </div>
            ))}
          </div>
          {saveError && <p className="text-body-sm text-brand-600">{saveError}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setExistenciasOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={existenciasForm.formState.isSubmitting}>Guardar existencias</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
