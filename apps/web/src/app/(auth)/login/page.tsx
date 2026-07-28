'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Wordmark } from '@/components/brand/Logo';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { hasPin, setPin, verifyPin, bumpExpiry, isPinFormatValid, PIN_LENGTH } from '@/lib/offline/pin';
import { saveSessionSnapshot, getSessionSnapshotByEmail, type CachedUser } from '@/lib/offline/session-cache';

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
  ubicaciones: {
    ubicacion: {
      id: string;
      nombre: string;
      tipo: string;
      logo_url: string | null;
      razon_social: string | null;
      rfc: string | null;
      regimen_fiscal: string | null;
      calle: string | null;
      num_ext: string | null;
      num_int: string | null;
      colonia: string | null;
      municipio: string | null;
      estado: string | null;
      cp: string | null;
      telefono: string | null;
    };
  }[];
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();
  const { setContexto } = useContextoStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get('motivo') === 'sesion_expirada' ? 'Tu sesión expiró, vuelve a iniciar sesión.' : null,
  );

  const [pendingUsuarioId, setPendingUsuarioId] = useState<string | null>(null);
  const [pendingMe, setPendingMe] = useState<MeResponse | null>(null);
  const [dlgPin, setDlgPin] = useState(false);
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirmar, setPinConfirmar] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [guardandoPin, setGuardandoPin] = useState(false);

  // Sin internet, pero el correo escrito ya tiene sesión guardada en este
  // equipo — se ofrece entrar con el PIN en vez del correo/contraseña.
  const [offlineCandidate, setOfflineCandidate] = useState<CachedUser | null>(null);
  const [offlinePin, setOfflinePin] = useState('');
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [verificandoOffline, setVerificandoOffline] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(LoginSchema) });

  function goToDestination(me: MeResponse) {
    if (me.empresa && me.ubicaciones.length > 0) {
      setContexto(
        { id: me.empresa.id, nombre: me.empresa.nombre, logo_url: me.empresa.logo_url },
        {
          id: me.ubicaciones[0].ubicacion.id,
          nombre: me.ubicaciones[0].ubicacion.nombre,
          tipo: me.ubicaciones[0].ubicacion.tipo as never,
          logo_url: me.ubicaciones[0].ubicacion.logo_url,
          razon_social: me.ubicaciones[0].ubicacion.razon_social,
          rfc: me.ubicaciones[0].ubicacion.rfc,
          regimen_fiscal: me.ubicaciones[0].ubicacion.regimen_fiscal,
          calle: me.ubicaciones[0].ubicacion.calle,
          num_ext: me.ubicaciones[0].ubicacion.num_ext,
          num_int: me.ubicaciones[0].ubicacion.num_int,
          colonia: me.ubicaciones[0].ubicacion.colonia,
          municipio: me.ubicaciones[0].ubicacion.municipio,
          estado: me.ubicaciones[0].ubicacion.estado,
          cp: me.ubicaciones[0].ubicacion.cp,
          telefono: me.ubicaciones[0].ubicacion.telefono,
        },
      );
      router.push('/dashboard');
    } else if (me.empresa) {
      // Sin ubicaciones asignadas → ir al selector de contexto
      router.push('/seleccionar-contexto');
    } else {
      router.push('/dashboard');
    }
  }

  async function onSubmit(data: LoginForm) {
    setError(null);
    setOfflineCandidate(null);
    try {
      const result = await api.post<LoginResponse>('/auth/login', data, {
        skipAuth: true,
        credentials: 'include',
      });

      const usuario = {
        id: result.usuario.id,
        nombre: result.usuario.nombre,
        apellidos: result.usuario.apellidos,
        email: result.usuario.email,
        rol: result.usuario.rol as never,
        empresa_id: result.usuario.empresa_id,
        ubicacion_ids: result.usuario.ubicacion_ids,
      };
      setAuth(usuario, result.access_token);
      void bumpExpiry(result.usuario.id);
      void saveSessionSnapshot(usuario, result.access_token);

      // Resolver empresa y ubicación por defecto llamando a /auth/me
      const me = await api.get<MeResponse>('/auth/me', {
        headers: { Authorization: `Bearer ${result.access_token}` },
      });

      // Si este equipo aún no tiene PIN offline para este usuario, se ofrece
      // configurarlo ahora — es el único momento en que ya se demostró la
      // contraseña, y evita que el próximo corte de internet deje a este
      // usuario sin poder trabajar (ver docs/fases/00-PROYECTO-MAESTRO.md §9).
      const yaTienePin = await hasPin(result.usuario.id);
      if (!yaTienePin) {
        setPendingUsuarioId(result.usuario.id);
        setPendingMe(me);
        setDlgPin(true);
        // goToDestination se llama al cerrar el diálogo (guardado o "Más tarde")
        return;
      }

      goToDestination(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        // Sin red — si este correo ya tiene sesión guardada en este equipo
        // (de un login anterior), se ofrece entrar con su PIN en vez de
        // fallar directo (ver lib/offline/session-cache.ts).
        const cached = await getSessionSnapshotByEmail(data.email);
        if (cached) {
          setOfflineCandidate(cached);
          setOfflinePin('');
          setOfflineError(null);
          return;
        }
        setError('Sin conexión y este equipo no tiene una sesión guardada para este correo. Conéctate a internet al menos una vez para poder trabajar sin conexión después.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    }
  }

  async function onDesbloquearOffline() {
    if (!offlineCandidate) return;
    setVerificandoOffline(true);
    setOfflineError(null);
    try {
      const result = await verifyPin(offlineCandidate.usuarioId, offlinePin);
      if (!result.ok) {
        setOfflinePin('');
        if (result.reason === 'expirado') {
          setOfflineError('Pasaron más de 7 días sin conexión — necesitas conectarte a internet para renovar el acceso.');
        } else if (result.reason === 'bloqueado') {
          setOfflineError('Demasiados intentos incorrectos. Espera unos minutos.');
        } else {
          setOfflineError('PIN incorrecto.');
        }
        return;
      }
      setAuth(offlineCandidate.usuario, offlineCandidate.accessToken);
      router.push('/dashboard');
    } finally {
      setVerificandoOffline(false);
    }
  }

  function cerrarDlgPin() {
    setDlgPin(false);
    setPinNuevo('');
    setPinConfirmar('');
    setPinError(null);
    if (pendingMe) goToDestination(pendingMe);
  }

  async function onGuardarPin() {
    if (!pendingUsuarioId) return;
    setPinError(null);
    if (!isPinFormatValid(pinNuevo)) {
      setPinError(`El PIN debe tener ${PIN_LENGTH} dígitos.`);
      return;
    }
    if (pinNuevo !== pinConfirmar) {
      setPinError('Los PIN no coinciden.');
      return;
    }
    setGuardandoPin(true);
    try {
      await setPin(pendingUsuarioId, pinNuevo);
      cerrarDlgPin();
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Error al guardar el PIN');
    } finally {
      setGuardandoPin(false);
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
        {offlineCandidate ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-display-sm font-bold text-steel-900 mb-1">
                Hola, {offlineCandidate.usuario.nombre}
              </h1>
              <p className="text-body-sm text-steel-500">
                Sin conexión, pero este equipo tiene tu sesión guardada — ingresa tu PIN para entrar.
              </p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              autoFocus
              value={offlinePin}
              onChange={(e) => setOfflinePin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              className="w-full text-center text-2xl tracking-[0.5em] rounded-md border border-steel-300 py-3 focus:outline-none focus:ring-2 focus:ring-brand-600"
              placeholder="••••••"
            />
            {offlineError && (
              <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
                <p className="text-body-sm text-brand-600">{offlineError}</p>
              </div>
            )}
            <Button
              className="w-full"
              loading={verificandoOffline}
              disabled={offlinePin.length !== PIN_LENGTH}
              onClick={() => void onDesbloquearOffline()}
            >
              Entrar
            </Button>
            <button
              type="button"
              onClick={() => setOfflineCandidate(null)}
              className="w-full text-center text-meta text-steel-400 hover:text-steel-600 transition-colors"
            >
              Usar otro correo
            </button>
          </div>
        ) : (
        <>
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
        </>
        )}
      </div>

      <p className="text-center text-meta text-steel-400 mt-6">
        GrupoMetalicoEMF · v1.0.0
      </p>

      <Dialog open={dlgPin} onClose={cerrarDlgPin} title="Configura tu PIN de acceso sin conexión" size="sm">
        <div className="space-y-4">
          <p className="text-body-sm text-steel-500">
            Con un PIN puedes seguir trabajando en este equipo aunque no haya internet — sin él, tendrás que volver a conectarte cada vez.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              placeholder={`PIN de ${PIN_LENGTH} dígitos`}
              value={pinNuevo}
              onChange={(e) => setPinNuevo(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
            />
            <Input
              type="password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              placeholder="Confirmar PIN"
              value={pinConfirmar}
              onChange={(e) => setPinConfirmar(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
            />
          </div>
          {pinError && <p className="text-body-sm text-brand-600">{pinError}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={cerrarDlgPin}>Más tarde</Button>
            <Button type="button" loading={guardandoPin} onClick={() => void onGuardarPin()}>
              Guardar PIN
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
