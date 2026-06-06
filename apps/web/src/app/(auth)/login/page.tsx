'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wordmark } from '@/components/brand/Logo';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';

const LoginSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

type LoginForm = z.infer<typeof LoginSchema>;

interface LoginResponse {
  access_token: string;
  usuario: {
    id: string;
    nombre: string;
    apellidos: string;
    email: string;
    rol: string;
    empresa_id: string;
    ubicacion_ids: string[];
  };
}

interface MeResponse {
  empresa: { id: string; nombre: string; logo_url: string | null };
  ubicaciones: { ubicacion: { id: string; nombre: string; tipo: string } }[];
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const { setContexto } = useContextoStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(LoginSchema) });

  async function onSubmit(data: LoginForm) {
    setError(null);
    try {
      const result = await api.post<LoginResponse>('/auth/login', data, {
        skipAuth: true,
        credentials: 'include',
      });

      setAuth(
        {
          id: result.usuario.id,
          nombre: result.usuario.nombre,
          apellidos: result.usuario.apellidos,
          email: result.usuario.email,
          rol: result.usuario.rol as never,
          empresa_id: result.usuario.empresa_id,
          ubicacion_ids: result.usuario.ubicacion_ids,
        },
        result.access_token,
      );

      // Resolver empresa y ubicación por defecto llamando a /auth/me
      const me = await api.get<MeResponse>('/auth/me', {
        headers: { Authorization: `Bearer ${result.access_token}` },
      });

      if (me.empresa && me.ubicaciones.length > 0) {
        setContexto(
          { id: me.empresa.id, nombre: me.empresa.nombre, logo_url: me.empresa.logo_url },
          {
            id: me.ubicaciones[0].ubicacion.id,
            nombre: me.ubicaciones[0].ubicacion.nombre,
            tipo: me.ubicaciones[0].ubicacion.tipo as never,
          },
        );
        router.push('/dashboard');
      } else if (me.empresa) {
        // Sin ubicaciones asignadas → ir al selector de contexto
        router.push('/seleccionar-contexto');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo + wordmark */}
      <div className="flex flex-col items-center mb-8">
        {/* Isotipo placeholder — SVG se agrega en Fase 1 día 7 */}
        <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center mb-3">
          <span className="text-white font-bold text-lg tracking-tight">EMF</span>
        </div>
        <div className="text-center">
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Grupo</p>
          <Wordmark />
          <p className="text-body-sm text-steel-500 mt-1">Sistema de Gestión Industrial</p>
        </div>
      </div>

      {/* Card de login */}
      <div className="bg-white border border-steel-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-display-sm font-bold text-steel-900 mb-1">Iniciar sesión</h1>
        <p className="text-body-sm text-steel-500 mb-5">
          Ingresa tus credenciales para continuar
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
              <Input
                type="email"
                placeholder="usuario@empresa.com"
                className="pl-9"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>
          </div>

          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="pl-9 pr-9"
                error={errors.password?.message}
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-600"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            loading={isSubmitting}
          >
            Iniciar sesión
          </Button>
        </form>
      </div>

      <p className="text-center text-meta text-steel-400 mt-6">
        GrupoMetalicoEMF · v1.0.0
      </p>
    </div>
  );
}
