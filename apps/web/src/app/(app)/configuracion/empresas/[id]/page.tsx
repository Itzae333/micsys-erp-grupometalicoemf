'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Plus,
  ChevronRight,
  Pencil,
  CheckCircle2,
  XCircle,
  Columns3,
  ImagePlus,
  X,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import type { Empresa, Ubicacion } from '@/lib/types/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
import { Button } from '@/components/ui/button';
import { resolveLogoUrl } from '@/components/brand/Logo';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

const EditEmpresaSchema = z.object({
  nombre: z.string().min(2),
  razon_social: z.string().min(5),
  rfc: z.string().regex(RFC_REGEX, 'RFC inválido'),
});

const UbicacionSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  tipo: z.enum(['MATRIZ', 'FABRICA', 'PUNTO_VENTA']),
  razon_social: z.string().optional(),
  rfc: z.string().optional(),
  regimen_fiscal: z.string().optional(),
  calle: z.string().optional(),
  num_ext: z.string().optional(),
  num_int: z.string().optional(),
  colonia: z.string().optional(),
  municipio: z.string().optional(),
  estado: z.string().optional(),
  cp: z.string().optional(),
  telefono: z.string().optional(),
});

type EditEmpresaForm = z.infer<typeof EditEmpresaSchema>;
type UbicacionForm = z.infer<typeof UbicacionSchema>;

const TIPO_LABELS: Record<string, string> = {
  MATRIZ: 'Matriz',
  FABRICA: 'Fábrica',
  PUNTO_VENTA: 'Punto de Venta',
};

const TIPO_COLORS: Record<string, string> = {
  MATRIZ: 'bg-brand-600/10 text-brand-600',
  FABRICA: 'bg-blue-50 text-blue-600',
  PUNTO_VENTA: 'bg-green-50 text-green-700',
};

export default function EmpresaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { usuario } = useAuthStore();
  const { empresa: ctxEmpresa, setEmpresa: setCtxEmpresa } = useContextoStore();

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [ubicacionOpen, setUbicacionOpen] = useState(false);
  const [editingUbicacion, setEditingUbicacion] = useState<Ubicacion | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState<string | null>(null); // entity id being uploaded

  const canEdit = usuario?.rol === 'SUPER_USUARIO' || usuario?.rol === 'ADMIN';
  const isSuperUsuario = usuario?.rol === 'SUPER_USUARIO';

  const empresaForm = useForm<EditEmpresaForm>({ resolver: zodResolver(EditEmpresaSchema) });
  const ubicacionForm = useForm<UbicacionForm>({ resolver: zodResolver(UbicacionSchema) });

  async function load() {
    try {
      const [emp, ubs] = await Promise.all([
        api.get<Empresa>(`/empresas/${params.id}`),
        api.get<Ubicacion[]>(`/empresas/${params.id}/ubicaciones`),
      ]);
      setEmpresa(emp);
      setUbicaciones(ubs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [params.id]);

  function openEditEmpresa() {
    if (!empresa) return;
    empresaForm.reset({
      nombre: empresa.nombre,
      razon_social: empresa.razon_social,
      rfc: empresa.rfc,
    });
    setFormError(null);
    setEditOpen(true);
  }

  function openCreateUbicacion() {
    ubicacionForm.reset({ tipo: 'PUNTO_VENTA' });
    setEditingUbicacion(null);
    setFormError(null);
    setUbicacionOpen(true);
  }

  function openEditUbicacion(ub: Ubicacion) {
    ubicacionForm.reset({
      nombre: ub.nombre,
      tipo: ub.tipo,
      razon_social: ub.razon_social ?? '',
      rfc: ub.rfc ?? '',
      regimen_fiscal: ub.regimen_fiscal ?? '',
      calle: ub.calle ?? '',
      num_ext: ub.num_ext ?? '',
      num_int: ub.num_int ?? '',
      colonia: ub.colonia ?? '',
      municipio: ub.municipio ?? '',
      estado: ub.estado ?? '',
      cp: ub.cp ?? '',
      telefono: ub.telefono ?? '',
    });
    setEditingUbicacion(ub);
    setFormError(null);
    setUbicacionOpen(true);
  }

  async function onSaveEmpresa(data: EditEmpresaForm) {
    setFormError(null);
    try {
      await api.patch(`/empresas/${params.id}`, data);
      setEditOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  async function onSaveUbicacion(data: UbicacionForm) {
    setFormError(null);
    try {
      if (editingUbicacion) {
        await api.patch(`/empresas/${params.id}/ubicaciones/${editingUbicacion.id}`, data);
      } else {
        await api.post(`/empresas/${params.id}/ubicaciones`, data);
      }
      setUbicacionOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  async function onDesactivarUbicacion(ub: Ubicacion) {
    if (!confirm(`¿Desactivar "${ub.nombre}"?`)) return;
    try {
      await api.delete(`/empresas/${params.id}/ubicaciones/${ub.id}`);
      load();
    } catch {
      /* mostrar toast en Fase 2 */
    }
  }

  async function handleLogoUpload(entityPath: string, entityId: string, file: File) {
    setLogoUploading(entityId);
    try {
      const token = useAuthStore.getState().accessToken;
      const { empresa: ctxEmp, ubicacion: ctxUb } = useContextoStore.getState();
      const formData = new FormData();
      formData.append('logo', file);
      const res = await fetch(`${BASE_URL}${entityPath}/logo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          ...(ctxEmp?.id ? { 'x-empresa-id': ctxEmp.id } : {}),
          ...(ctxUb?.id ? { 'x-ubicacion-id': ctxUb.id } : {}),
        },
        body: formData,
      });
      if (!res.ok) throw new Error('Error al subir logo');
      const updated = await res.json() as { logo_url: string | null };
      // Si es el logo de la empresa activa en contexto, actualizarlo
      if (entityId === ctxEmpresa?.id && updated.logo_url !== undefined) {
        setCtxEmpresa({ ...ctxEmpresa, logo_url: updated.logo_url });
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al subir logo');
    } finally {
      setLogoUploading(null);
    }
  }

  if (loading || !empresa) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-48 bg-steel-100 rounded animate-pulse" />
        <div className="h-24 bg-steel-100 rounded-xl animate-pulse" />
        <div className="h-40 bg-steel-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <button
        onClick={() => router.push('/configuracion/empresas')}
        className="flex items-center gap-1.5 text-body-sm text-steel-500 hover:text-steel-900 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Empresas
      </button>

      {/* Card empresa */}
      <div className="bg-white border border-steel-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h1 className="text-display-sm font-bold text-steel-900">{empresa.nombre}</h1>
              <p className="text-body-sm text-steel-500">{empresa.razon_social}</p>
            </div>
          </div>
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={openEditEmpresa}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Editar
            </Button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-body-sm">
          <span className="text-steel-500">
            RFC: <span className="text-steel-900 font-medium">{empresa.rfc}</span>
          </span>
          <span className={`flex items-center gap-1 ${empresa.activa ? 'text-green-600' : 'text-steel-400'}`}>
            {empresa.activa ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {empresa.activa ? 'Activa' : 'Inactiva'}
          </span>
        </div>

        {/* Sección logo empresa */}
        {canEdit && (
          <div className="mt-5 pt-4 border-t border-steel-100">
            <p className="text-table-header text-steel-400 uppercase tracking-widest mb-3">
              Logo de empresa
            </p>
            <div className="flex items-center gap-4">
              {empresa.logo_url ? (
                <div className="w-32 h-14 rounded-lg border border-steel-200 bg-steel-50 flex items-center justify-center p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveLogoUrl(empresa.logo_url)}
                    alt="Logo empresa"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-32 h-14 rounded-lg border border-dashed border-steel-300 bg-steel-50 flex items-center justify-center">
                  <ImagePlus className="h-5 w-5 text-steel-300" />
                </div>
              )}
              <div className="space-y-1">
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-steel-100 hover:bg-steel-200 text-body-sm font-medium text-steel-700 transition-colors">
                    {logoUploading === empresa.id ? (
                      <span className="text-steel-500">Subiendo…</span>
                    ) : (
                      <>
                        <ImagePlus className="h-3.5 w-3.5" />
                        {empresa.logo_url ? 'Cambiar logo' : 'Subir logo'}
                      </>
                    )}
                  </span>
                  <input
                    type="file"
                    accept=".svg,.png,.webp"
                    className="sr-only"
                    disabled={!!logoUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(`/empresas/${empresa.id}`, empresa.id, file);
                      e.target.value = '';
                    }}
                  />
                </label>
                <p className="text-meta text-steel-400">SVG, PNG o WebP · máx. 2 MB</p>
              </div>
              {empresa.logo_url && (
                <button
                  onClick={async () => {
                    if (!confirm('¿Eliminar logo?')) return;
                    await api.delete(`/empresas/${empresa.id}/logo`);
                    if (ctxEmpresa?.id === empresa.id) {
                      setCtxEmpresa({ ...ctxEmpresa, logo_url: null });
                    }
                    load();
                  }}
                  className="text-steel-400 hover:text-brand-600 transition-colors"
                  title="Eliminar logo"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sección ubicaciones */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-display-sm font-bold text-steel-900">Ubicaciones</h2>
          {canEdit && (
            <Button size="sm" onClick={openCreateUbicacion}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nueva ubicación
            </Button>
          )}
        </div>

        {ubicaciones.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-7 w-7" />}
            title="Sin ubicaciones"
            description="Agrega la primera ubicación a esta empresa."
            action={canEdit ? { label: 'Nueva ubicación', onClick: openCreateUbicacion } : undefined}
          />
        ) : (
          <div className="space-y-2">
            {ubicaciones.map((ub) => (
              <div
                key={ub.id}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-steel-200 rounded-xl"
              >
                <div className="w-8 h-8 rounded-lg bg-steel-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-3.5 w-3.5 text-steel-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-body font-medium text-steel-900 truncate">{ub.nombre}</p>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${TIPO_COLORS[ub.tipo]}`}
                    >
                      {TIPO_LABELS[ub.tipo]}
                    </span>
                    {!ub.activa && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide bg-steel-100 text-steel-400">
                        Inactiva
                      </span>
                    )}
                  </div>
                  {ub.municipio && (
                    <p className="text-body-sm text-steel-500 truncate">
                      {ub.municipio}, {ub.estado}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && (
                    <>
                      {/* Logo por ubicación */}
                      <label
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-steel-100 transition-colors cursor-pointer"
                        title="Subir logo de ubicación"
                      >
                        {ub.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={resolveLogoUrl(ub.logo_url)} alt="" className="h-4 w-auto object-contain" />
                        ) : (
                          <ImagePlus className={`h-3.5 w-3.5 text-steel-500 ${logoUploading === ub.id ? 'animate-pulse' : ''}`} />
                        )}
                        <input
                          type="file"
                          accept=".svg,.png,.webp"
                          className="sr-only"
                          disabled={!!logoUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file)
                              handleLogoUpload(
                                `/empresas/${empresa.id}/ubicaciones/${ub.id}`,
                                ub.id,
                                file,
                              );
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          router.push(
                            `/configuracion/columnas/${empresa.id}/${ub.id}`,
                          )
                        }
                        title="Configurar columnas"
                      >
                        <Columns3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditUbicacion(ub)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {isSuperUsuario && ub.activa && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDesactivarUbicacion(ub)}
                      className="text-steel-400 hover:text-brand-600"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-steel-300 ml-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog: editar empresa */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar empresa"
        size="md"
      >
        <form onSubmit={empresaForm.handleSubmit(onSaveEmpresa)} className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Nombre comercial
            </label>
            <Input
              error={empresaForm.formState.errors.nombre?.message}
              {...empresaForm.register('nombre')}
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Razón social
            </label>
            <Input
              error={empresaForm.formState.errors.razon_social?.message}
              {...empresaForm.register('razon_social')}
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">RFC</label>
            <Input
              className="uppercase"
              error={empresaForm.formState.errors.rfc?.message}
              {...empresaForm.register('rfc')}
            />
          </div>
          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={empresaForm.formState.isSubmitting}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Dialog: crear / editar ubicación */}
      <Dialog
        open={ubicacionOpen}
        onClose={() => setUbicacionOpen(false)}
        title={editingUbicacion ? 'Editar ubicación' : 'Nueva ubicación'}
        description="Los datos fiscales son opcionales y se usan para emitir comprobantes."
        size="lg"
      >
        <form onSubmit={ubicacionForm.handleSubmit(onSaveUbicacion)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Nombre
              </label>
              <Input
                placeholder="Ej. Planta Monterrey Norte"
                error={ubicacionForm.formState.errors.nombre?.message}
                {...ubicacionForm.register('nombre')}
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Tipo</label>
              <Select
                error={ubicacionForm.formState.errors.tipo?.message}
                {...ubicacionForm.register('tipo')}
              >
                <option value="MATRIZ">Matriz</option>
                <option value="FABRICA">Fábrica</option>
                <option value="PUNTO_VENTA">Punto de Venta</option>
              </Select>
            </div>
          </div>

          <p className="text-table-header text-steel-400 uppercase tracking-widest border-t border-steel-100 pt-4">
            Datos fiscales (opcional)
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Razón social
              </label>
              <Input placeholder="SA de CV" {...ubicacionForm.register('razon_social')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">RFC</label>
              <Input className="uppercase" placeholder="EMF010101ABC" {...ubicacionForm.register('rfc')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Régimen fiscal
              </label>
              <Input placeholder="601" {...ubicacionForm.register('regimen_fiscal')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Teléfono
              </label>
              <Input placeholder="81 1234 5678" {...ubicacionForm.register('telefono')} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Calle</label>
              <Input placeholder="Av. Industrial" {...ubicacionForm.register('calle')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Núm. ext.
              </label>
              <Input placeholder="100" {...ubicacionForm.register('num_ext')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Núm. int.
              </label>
              <Input placeholder="A" {...ubicacionForm.register('num_int')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Colonia
              </label>
              <Input placeholder="Industrial" {...ubicacionForm.register('colonia')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">CP</label>
              <Input placeholder="64000" {...ubicacionForm.register('cp')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Municipio
              </label>
              <Input placeholder="Monterrey" {...ubicacionForm.register('municipio')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Estado</label>
              <Input placeholder="Nuevo León" {...ubicacionForm.register('estado')} />
            </div>
          </div>

          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setUbicacionOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={ubicacionForm.formState.isSubmitting}>
              {editingUbicacion ? 'Guardar cambios' : 'Crear ubicación'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
