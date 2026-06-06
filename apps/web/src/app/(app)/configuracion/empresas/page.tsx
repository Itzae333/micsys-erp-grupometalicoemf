'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Building2, CheckCircle2, XCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import type { Empresa } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { formatFecha } from '@/lib/utils';

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

const CreateEmpresaSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  razon_social: z.string().min(5, 'Mínimo 5 caracteres'),
  rfc: z.string().regex(RFC_REGEX, 'RFC inválido (ej. EMF010101ABC)'),
});

type CreateEmpresaForm = z.infer<typeof CreateEmpresaSchema>;

export default function EmpresasPage() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperUsuario = usuario?.rol === 'SUPER_USUARIO';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateEmpresaForm>({ resolver: zodResolver(CreateEmpresaSchema) });

  async function load() {
    try {
      const data = await api.get<Empresa[]>('/empresas');
      setEmpresas(data);
      // ADMIN solo tiene una empresa — ir directo al detalle sin pasar por la lista
      if (!isSuperUsuario && data.length === 1) {
        router.replace(`/configuracion/empresas/${data[0].id}`);
        return;
      }
    } catch {
      /* silencioso — lista vacía */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(data: CreateEmpresaForm) {
    setError(null);
    try {
      await api.post('/empresas', data);
      setDialogOpen(false);
      reset();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear empresa');
    }
  }

  if (loading) {
    return (
      <div className="p-8 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-steel-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">
            Configuración
          </p>
          <h1 className="text-display-md font-bold text-steel-900">Empresas</h1>
        </div>
        {isSuperUsuario && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva empresa
          </Button>
        )}
      </div>

      {/* Lista */}
      {empresas.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="Sin empresas"
          description="Crea la primera empresa del grupo."
          action={
            isSuperUsuario
              ? { label: 'Nueva empresa', onClick: () => setDialogOpen(true) }
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {empresas.map((emp) => (
            <button
              key={emp.id}
              onClick={() => router.push(`/configuracion/empresas/${emp.id}`)}
              className="w-full flex items-center gap-4 px-4 py-3.5 bg-white border border-steel-200 rounded-xl hover:border-steel-300 hover:shadow-sm transition-all text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-600/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-4 w-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-semibold text-steel-900 truncate">{emp.nombre}</p>
                <p className="text-body-sm text-steel-500 truncate">
                  {emp.razon_social} · RFC: {emp.rfc}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-meta text-steel-400 hidden sm:block">
                  Alta: {formatFecha(emp.created_at)}
                </span>
                {emp.activa ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-steel-300" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Dialog: crear empresa */}
      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); reset(); setError(null); }}
        title="Nueva empresa"
        description="Agrega una empresa al grupo EMF."
        size="md"
      >
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Nombre comercial
            </label>
            <Input placeholder="Ej. EMFIMIFAR" error={errors.nombre?.message} {...register('nombre')} />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Razón social
            </label>
            <Input
              placeholder="Ej. Estructuras Metálicas del Norte SA de CV"
              error={errors.razon_social?.message}
              {...register('razon_social')}
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              RFC
            </label>
            <Input
              placeholder="EMF010101ABC"
              className="uppercase"
              error={errors.rfc?.message}
              {...register('rfc')}
            />
          </div>

          {error && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setDialogOpen(false); reset(); setError(null); }}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Crear empresa
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
