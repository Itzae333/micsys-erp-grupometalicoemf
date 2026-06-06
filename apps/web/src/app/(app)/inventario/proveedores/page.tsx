'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import type { Proveedor } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';

const ProveedorSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  razon_social: z.string().optional(),
  rfc: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  direccion: z.string().optional(),
});

type ProveedorForm = z.infer<typeof ProveedorSchema>;

export default function ProveedoresPage() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Proveedor | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const canWrite = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProveedorForm>({ resolver: zodResolver(ProveedorSchema) });

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<Proveedor[]>('/proveedores');
      setProveedores(data);
    } catch {
      setProveedores([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditTarget(null);
    reset({});
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(p: Proveedor) {
    setEditTarget(p);
    reset({
      nombre: p.nombre,
      razon_social: p.razon_social ?? '',
      rfc: p.rfc ?? '',
      telefono: p.telefono ?? '',
      email: p.email ?? '',
      direccion: p.direccion ?? '',
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function onSubmit(data: ProveedorForm) {
    setFormError(null);
    const payload = { ...data, email: data.email || undefined };
    try {
      if (editTarget) {
        await api.patch(`/proveedores/${editTarget.id}`, payload);
      } else {
        await api.post('/proveedores', payload);
      }
      setDialogOpen(false);
      reset({});
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-steel-500 hover:text-steel-800 text-body-sm mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Inventario
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Inventario</p>
          <h1 className="text-display-md font-bold text-steel-900">Proveedores</h1>
        </div>
        {canWrite && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo proveedor
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-steel-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : proveedores.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-8 w-8" />}
          title="Sin proveedores"
          description="Agrega el primer proveedor para asignarlo a tus artículos."
          action={canWrite ? { label: 'Nuevo proveedor', onClick: openCreate } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {proveedores.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-4 px-4 py-3.5 bg-white border border-steel-200 rounded-xl hover:border-steel-300 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-steel-100 flex items-center justify-center flex-shrink-0">
                <Truck className="h-4 w-4 text-steel-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-semibold text-steel-900 truncate">{p.nombre}</p>
                <p className="text-body-sm text-steel-500 truncate">
                  {[p.razon_social, p.rfc].filter(Boolean).join(' · ') || 'Sin razón social'}
                </p>
                {(p.telefono || p.email) && (
                  <p className="text-meta text-steel-400 truncate">
                    {[p.telefono, p.email].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {canWrite && (
                <button
                  onClick={() => openEdit(p)}
                  className="text-body-sm text-steel-400 hover:text-steel-700 px-3 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors flex-shrink-0"
                >
                  Editar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); reset({}); setFormError(null); }}
        title={editTarget ? `Editar: ${editTarget.nombre}` : 'Nuevo proveedor'}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Nombre <span className="text-brand-600">*</span>
            </label>
            <Input placeholder="Aceros del Norte" error={errors.nombre?.message} {...register('nombre')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Razón social</label>
              <Input placeholder="Aceros del Norte S.A. de C.V." {...register('razon_social')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">RFC</label>
              <Input placeholder="ANO010101XYZ" className="uppercase" {...register('rfc')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Teléfono</label>
              <Input placeholder="8112345678" type="tel" {...register('telefono')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Correo</label>
              <Input
                placeholder="ventas@proveedor.com"
                type="email"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Dirección</label>
            <Input placeholder="Av. Industrial 123, Monterrey, NL" {...register('direccion')} />
          </div>

          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setDialogOpen(false); reset({}); setFormError(null); }}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editTarget ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
