'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Users, Search, ShoppingCart, FileText, BookOpen, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import type { Cliente, ConfigColumnasSchema } from '@/lib/types/api';
import { useBlockRoles } from '@/lib/hooks/use-block-roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { formatPrecio } from '@/lib/utils';

const ClienteSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  apellidos: z.string().optional(),
  razon_social: z.string().optional(),
  rfc: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  direccion: z.string().optional(),
  precio_num: z.coerce.number().int().min(1).optional(),
  limite_credito: z.coerce.number().min(0).optional(),
});
type ClienteForm = z.infer<typeof ClienteSchema>;

export default function ClientesVentasPage() {
  useBlockRoles(['SUPER_USUARIO']);
  const router = useRouter();
  const { usuario } = useAuthStore();
  const { empresa, ubicacion } = useContextoStore();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [schema, setSchema] = useState<ConfigColumnasSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Cliente | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const canWrite = ['ADMIN', 'ENCARGADO', 'VENDEDOR'].includes(usuario?.rol ?? '');
  const canEdit = ['ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');
  const canVender = ['ADMIN', 'ENCARGADO', 'VENDEDOR'].includes(usuario?.rol ?? '');

  const {
    register, handleSubmit, reset, formState: { errors, isSubmitting },
  } = useForm<ClienteForm>({ resolver: zodResolver(ClienteSchema) });

  const preciosActivos = schema?.precios.filter((p) => p.activa) ?? [];

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<Cliente[]>(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setClientes(data);
    } catch { setClientes([]); } finally { setLoading(false); }
  }

  useEffect(() => {
    if (empresa?.id && ubicacion?.id) {
      api.get<ConfigColumnasSchema>(`/config-columnas/${empresa.id}/${ubicacion.id}/schema`)
        .then(setSchema)
        .catch(() => {});
    }
  }, [empresa?.id, ubicacion?.id]);

  useEffect(() => { load(); }, [q]);
  useEffect(() => { setPage(1); }, [q]);

  const totalPages = Math.max(1, Math.ceil(clientes.length / PAGE_SIZE));
  const clientesPagina = clientes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function precioLabel(num: number | null): string {
    if (!num) return '';
    return preciosActivos.find((p) => p.numero === num)?.label ?? `Precio ${num}`;
  }

  function openCreate() {
    setEditTarget(null);
    reset({});
    setFormError(null);
    setDlgOpen(true);
  }

  function openEdit(c: Cliente) {
    setEditTarget(c);
    reset({
      nombre: c.nombre,
      apellidos: c.apellidos ?? '',
      razon_social: c.razon_social ?? '',
      rfc: c.rfc ?? '',
      telefono: c.telefono ?? '',
      email: c.email ?? '',
      direccion: c.direccion ?? '',
      precio_num: c.precio_num ?? undefined,
      limite_credito: c.limite_credito,
    });
    setFormError(null);
    setDlgOpen(true);
  }

  async function onSubmit(data: ClienteForm) {
    setFormError(null);
    const payload = {
      ...data,
      apellidos:    data.apellidos    || undefined,
      razon_social: data.razon_social || undefined,
      rfc:          data.rfc          || undefined,
      telefono:     data.telefono     || undefined,
      email:        data.email        || undefined,
      direccion:    data.direccion    || undefined,
      precio_num:   data.precio_num   || undefined,
    };
    try {
      if (editTarget) {
        await api.patch(`/clientes/${editTarget.id}`, payload);
      } else {
        await api.post('/clientes', payload);
      }
      setDlgOpen(false);
      reset({});
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  return (
    <div className="p-6 max-w-6xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-steel-500 hover:text-steel-800 text-body-sm mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Ventas
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Ventas</p>
          <h1 className="text-display-md font-bold text-steel-900">Clientes</h1>
        </div>
        {canWrite && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo cliente
          </Button>
        )}
      </div>

      {/* Búsqueda */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
        <input
          className="h-9 w-full rounded-md border border-steel-300 bg-white pl-8 pr-3 text-body text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
          placeholder="Buscar por nombre, RFC, teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-steel-100 rounded-lg animate-pulse" />)}
        </div>
      ) : clientes.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Sin clientes"
          description="Agrega el primer cliente para asignarlo a notas de venta."
          action={canWrite ? { label: 'Nuevo cliente', onClick: openCreate } : undefined}
        />
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {clientesPagina.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-3 px-4 py-3.5 bg-white border border-steel-200 rounded-xl hover:border-steel-300 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-steel-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-steel-600 font-bold text-body-sm">{c.nombre.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-body font-semibold text-steel-900 truncate">
                    {c.razon_social || `${c.nombre} ${c.apellidos ?? ''}`.trim()}
                  </p>
                  <p className="text-body-sm text-steel-500 truncate">
                    {[c.rfc, c.telefono].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {c.precio_num && (
                      <span className="text-meta text-brand-600 font-medium">
                        {precioLabel(c.precio_num)}
                      </span>
                    )}
                    {c.limite_credito > 0 && (
                      <span className="text-meta text-steel-400">
                        límite {formatPrecio(c.limite_credito)}
                        {c.saldo_pendiente > 0 && (
                          <span className="text-brand-600"> · saldo {formatPrecio(c.saldo_pendiente)}</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => router.push(`/credito/${c.id}`)}
                  className="flex items-center gap-1 text-body-sm text-steel-500 hover:text-steel-800 px-2.5 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors"
                  title="Ver cuenta, abonar o agregar un ajuste"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Cuenta
                </button>
                {canVender && (
                  <>
                    <button
                      onClick={() => router.push(`/ventas/cotizaciones?cliente_id=${c.id}`)}
                      className="flex items-center gap-1 text-body-sm text-steel-500 hover:text-steel-800 px-2.5 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors"
                      title="Nueva cotización"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Cotizar
                    </button>
                    <button
                      onClick={() => router.push(`/pedidos?cliente_id=${c.id}`)}
                      className="flex items-center gap-1 text-body-sm text-steel-500 hover:text-steel-800 px-2.5 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors"
                      title="Nuevo pedido con anticipo"
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      Pedido
                    </button>
                    <button
                      onClick={() => router.push(`/ventas?cliente_id=${c.id}`)}
                      className="flex items-center gap-1 text-body-sm text-white bg-brand-600 hover:bg-brand-700 px-2.5 py-1.5 rounded-lg transition-colors"
                      title="Nueva venta"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Vender
                    </button>
                  </>
                )}
                {canEdit && (
                  <button
                    onClick={() => openEdit(c)}
                    className="text-body-sm text-steel-400 hover:text-steel-700 px-3 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors"
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-body-sm text-steel-500">
              Página {page} de {totalPages} · {clientes.length} cliente{clientes.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 text-body-sm text-steel-600 hover:text-steel-900 px-2.5 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 text-body-sm text-steel-600 hover:text-steel-900 px-2.5 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        </>
      )}

      <Dialog
        open={dlgOpen}
        onClose={() => { setDlgOpen(false); reset({}); setFormError(null); }}
        title={editTarget ? `Editar: ${editTarget.nombre}` : 'Nuevo cliente'}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Nombre <span className="text-brand-600">*</span></label>
              <Input placeholder="Juan Carlos" error={errors.nombre?.message} {...register('nombre')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Apellidos</label>
              <Input placeholder="Hernández García" {...register('apellidos')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Razón social</label>
              <Input placeholder="Empresa S.A. de C.V." {...register('razon_social')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">RFC</label>
              <Input placeholder="EMP010101ABC" className="uppercase" {...register('rfc')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Teléfono</label>
              <Input placeholder="8112345678" type="tel" {...register('telefono')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Correo</label>
              <Input placeholder="correo@empresa.com" type="email" error={errors.email?.message} {...register('email')} />
            </div>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Dirección</label>
            <Input placeholder="Av. Industrial 123, Monterrey, NL" {...register('direccion')} />
          </div>

          <div className="border-t border-steel-100 pt-4 space-y-4">
            {/* Tipo de precio */}
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Tipo de precio
              </label>
              {preciosActivos.length === 0 ? (
                <p className="text-body-sm text-steel-400 italic">
                  No hay tipos de precio configurados. El admin debe activar al menos un precio en Configuración → Inventario.
                </p>
              ) : (
                <Select {...register('precio_num', { valueAsNumber: true })}>
                  <option value="">Sin tipo asignado</option>
                  {preciosActivos.map((p) => (
                    <option key={p.numero} value={p.numero}>{p.label}</option>
                  ))}
                </Select>
              )}
              <p className="text-meta text-steel-400 mt-1">
                El precio correspondiente se autocompletará al hacer una venta a este cliente.
              </p>
            </div>

            {/* Límite de crédito */}
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Límite de crédito ($)</label>
              <Input type="number" min="0" step="100" placeholder="0.00" {...register('limite_credito')} />
              <p className="text-meta text-steel-400 mt-1">
                Deja en 0 si el cliente no tiene crédito asignado.
              </p>
            </div>
          </div>

          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setDlgOpen(false); reset({}); setFormError(null); }}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editTarget ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
