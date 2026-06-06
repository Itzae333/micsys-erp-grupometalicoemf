'use client';

import { useEffect, useState } from 'react';
import { Plus, Users, Pencil, KeyRound, UserX, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import type { Usuario, Ubicacion, RolUsuario } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { formatFechaCorta } from '@/lib/utils';

const ROL_LABELS: Record<RolUsuario, string> = {
  SUPER_USUARIO: 'Super Usuario',
  ADMIN: 'Administrador',
  ENCARGADO: 'Encargado',
  VENDEDOR: 'Vendedor',
  ALMACENISTA: 'Almacenista',
  JEFE_MANUFACTURA: 'Jefe Manufactura',
  JEFE_RH: 'Jefe RH',
};

const ROL_COLORS: Record<RolUsuario, string> = {
  SUPER_USUARIO: 'bg-brand-600/10 text-brand-600',
  ADMIN: 'bg-blue-50 text-blue-600',
  ENCARGADO: 'bg-purple-50 text-purple-600',
  VENDEDOR: 'bg-green-50 text-green-700',
  ALMACENISTA: 'bg-amber-50 text-amber-700',
  JEFE_MANUFACTURA: 'bg-sky-50 text-sky-700',
  JEFE_RH: 'bg-pink-50 text-pink-700',
};

const UsuarioSchema = z.object({
  nombre: z.string().min(2, 'Requerido'),
  apellidos: z.string().min(2, 'Requerido'),
  email: z.string().email('Email inválido'),
  rol: z.enum([
    'SUPER_USUARIO',
    'ADMIN',
    'ENCARGADO',
    'VENDEDOR',
    'ALMACENISTA',
    'JEFE_MANUFACTURA',
    'JEFE_RH',
  ]),
  password: z.string().min(8, 'Mínimo 8 caracteres').optional().or(z.literal('')),
  ubicacion_ids: z.array(z.string()),
});

const ResetPasswordSchema = z.object({
  nueva_password: z.string().min(8, 'Mínimo 8 caracteres'),
});

type UsuarioForm = z.infer<typeof UsuarioSchema>;
type ResetForm = z.infer<typeof ResetPasswordSchema>;

export default function UsuariosPage() {
  const { usuario: me } = useAuthStore();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isSuperUsuario = me?.rol === 'SUPER_USUARIO';

  const userForm = useForm<UsuarioForm>({
    resolver: zodResolver(UsuarioSchema),
    defaultValues: { ubicacion_ids: [] },
  });

  const resetForm = useForm<ResetForm>({ resolver: zodResolver(ResetPasswordSchema) });

  async function load() {
    try {
      const [usrs, ubs] = await Promise.all([
        api.get<Usuario[]>('/usuarios'),
        me?.empresa_id
          ? api.get<Ubicacion[]>(`/empresas/${me.empresa_id}/ubicaciones`)
          : Promise.resolve([]),
      ]);
      setUsuarios(usrs);
      setUbicaciones(ubs as Ubicacion[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    userForm.reset({ ubicacion_ids: [], rol: 'VENDEDOR' as RolUsuario });
    setEditing(null);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(u: Usuario) {
    userForm.reset({
      nombre: u.nombre,
      apellidos: u.apellidos,
      email: u.email,
      rol: u.rol,
      password: '',
      ubicacion_ids: u.ubicaciones.map((ub) => ub.id),
    });
    setEditing(u);
    setFormError(null);
    setDialogOpen(true);
  }

  function openReset(id: string) {
    resetForm.reset();
    setResettingId(id);
    setFormError(null);
    setResetOpen(true);
  }

  async function onSave(data: UsuarioForm) {
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        nombre: data.nombre,
        apellidos: data.apellidos,
        email: data.email,
        rol: data.rol,
        ubicacion_ids: data.ubicacion_ids,
      };
      if (!editing && data.password) {
        payload.password = data.password;
      }
      if (editing) {
        await api.patch(`/usuarios/${editing.id}`, payload);
      } else {
        await api.post('/usuarios', payload);
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  async function onResetPassword(data: ResetForm) {
    if (!resettingId) return;
    setFormError(null);
    try {
      await api.post(`/usuarios/${resettingId}/reset-password`, {
        nueva_password: data.nueva_password,
      });
      setResetOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al resetear');
    }
  }

  async function onDesactivar(u: Usuario) {
    if (u.id === me?.id) return;
    if (!confirm(`¿Desactivar a ${u.nombre} ${u.apellidos}?`)) return;
    try {
      await api.delete(`/usuarios/${u.id}`);
      load();
    } catch {
      /* toast en Fase 2 */
    }
  }

  const selectedUbicaciones = userForm.watch('ubicacion_ids') ?? [];

  function toggleUbicacion(id: string) {
    const current = selectedUbicaciones;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    userForm.setValue('ubicacion_ids', next, { shouldValidate: true });
  }

  if (loading) {
    return (
      <div className="p-8 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-steel-100 rounded-lg animate-pulse" />
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
          <h1 className="text-display-md font-bold text-steel-900">Usuarios</h1>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nuevo usuario
        </Button>
      </div>

      {/* Tabla */}
      {usuarios.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Sin usuarios"
          description="Crea el primer usuario del sistema."
          action={{ label: 'Nuevo usuario', onClick: openCreate }}
        />
      ) : (
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-steel-100">
                <th className="px-4 py-3 text-left text-table-header text-steel-400 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-4 py-3 text-left text-table-header text-steel-400 uppercase tracking-wider">
                  Rol
                </th>
                <th className="px-4 py-3 text-left text-table-header text-steel-400 uppercase tracking-wider hidden md:table-cell">
                  Último acceso
                </th>
                <th className="px-4 py-3 text-left text-table-header text-steel-400 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-steel-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-steel-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-meta font-semibold">
                          {u.nombre.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="text-body font-medium text-steel-900">
                          {u.nombre} {u.apellidos}
                        </p>
                        <p className="text-body-sm text-steel-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${ROL_COLORS[u.rol]}`}
                    >
                      {ROL_LABELS[u.rol]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-body-sm text-steel-500 hidden md:table-cell">
                    {u.ultimo_acceso ? formatFechaCorta(u.ultimo_acceso) : 'Nunca'}
                  </td>
                  <td className="px-4 py-3">
                    {u.activo ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <span className="text-body-sm text-steel-400">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openReset(u.id)}
                        title="Resetear contraseña"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      {u.activo && u.id !== me?.id && (isSuperUsuario || u.rol !== 'SUPER_USUARIO') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDesactivar(u)}
                          className="text-steel-400 hover:text-brand-600"
                          title="Desactivar"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog: crear / editar usuario */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Editar usuario' : 'Nuevo usuario'}
        size="md"
      >
        <form onSubmit={userForm.handleSubmit(onSave)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Nombre</label>
              <Input
                error={userForm.formState.errors.nombre?.message}
                {...userForm.register('nombre')}
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Apellidos
              </label>
              <Input
                error={userForm.formState.errors.apellidos?.message}
                {...userForm.register('apellidos')}
              />
            </div>
          </div>

          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Correo electrónico
            </label>
            <Input
              type="email"
              placeholder="usuario@empresa.com"
              disabled={!!editing}
              error={userForm.formState.errors.email?.message}
              {...userForm.register('email')}
            />
          </div>

          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Rol</label>
            <Select error={userForm.formState.errors.rol?.message} {...userForm.register('rol')}>
              {(Object.keys(ROL_LABELS) as RolUsuario[])
                .filter((r) => isSuperUsuario || r !== 'SUPER_USUARIO')
                .map((r) => (
                  <option key={r} value={r}>
                    {ROL_LABELS[r]}
                  </option>
                ))}
            </Select>
          </div>

          {!editing && (
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Contraseña inicial
              </label>
              <Input
                type="password"
                placeholder="Mínimo 8 caracteres"
                error={userForm.formState.errors.password?.message}
                {...userForm.register('password')}
              />
            </div>
          )}

          {/* Asignación de ubicaciones */}
          {ubicaciones.length > 0 && (
            <div>
              <p className="text-body-sm font-medium text-steel-900 mb-2">Ubicaciones asignadas</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {ubicaciones.map((ub) => (
                  <label
                    key={ub.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-steel-200 cursor-pointer hover:bg-steel-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-steel-300 text-brand-600 focus:ring-brand-600/20"
                      checked={selectedUbicaciones.includes(ub.id)}
                      onChange={() => toggleUbicacion(ub.id)}
                    />
                    <span className="text-body text-steel-900 flex-1">{ub.nombre}</span>
                    <span className="text-[10px] text-steel-400 uppercase">{ub.tipo}</span>
                  </label>
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
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={userForm.formState.isSubmitting}>
              {editing ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Dialog: resetear contraseña */}
      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Resetear contraseña"
        description="Establece una nueva contraseña para el usuario."
        size="sm"
      >
        <form onSubmit={resetForm.handleSubmit(onResetPassword)} className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Nueva contraseña
            </label>
            <Input
              type="password"
              placeholder="Mínimo 8 caracteres"
              error={resetForm.formState.errors.nueva_password?.message}
              {...resetForm.register('nueva_password')}
            />
          </div>
          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setResetOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={resetForm.formState.isSubmitting}>
              Resetear
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
