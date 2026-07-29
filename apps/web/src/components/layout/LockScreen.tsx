'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Users, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { verifyPin, clearPin, PIN_LENGTH } from '@/lib/offline/pin';
import { listCachedUsers, getSessionSnapshot, deleteSessionSnapshot, type CachedUser } from '@/lib/offline/session-cache';
import { refreshAccessToken } from '@/lib/api/client';

function fmtSegundosRestantes(lockedUntil: Date): string {
  const seg = Math.max(0, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  const min = Math.floor(seg / 60);
  const s = seg % 60;
  return min > 0 ? `${min} min ${s}s` : `${s}s`;
}

export function LockScreen() {
  const router = useRouter();
  const usuario = useAuthStore((s) => s.usuario);
  const unlock = useAuthStore((s) => s.unlock);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearContexto = useContextoStore((s) => s.clearContexto);

  const [vista, setVista] = useState<'pin' | 'elegir'>('pin');
  const [pinTarget, setPinTarget] = useState<{ usuarioId: string; nombre: string } | null>(
    usuario ? { usuarioId: usuario.id, nombre: usuario.nombre } : null,
  );
  const [otrosUsuarios, setOtrosUsuarios] = useState<CachedUser[]>([]);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH && !checking) {
      void onSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  async function onSubmit() {
    if (!pinTarget) return;
    setChecking(true);
    setError(null);
    try {
      const result = await verifyPin(pinTarget.usuarioId, pin);
      if (result.ok) {
        if (usuario && pinTarget.usuarioId === usuario.id) {
          unlock();
          // El PIN solo se verifica localmente — no confirma con el
          // servidor que el token guardado siga vivo (pudo morir por un
          // redeploy, por ejemplo). Se fuerza una renovación ya mismo en
          // vez de esperar al próximo timer o a que una petición real
          // falle primero; si el refresh token sí murió de verdad, esto ya
          // dispara el flujo normal de sesión expirada en vez de dejar a
          // medias un token muerto.
          void refreshAccessToken();
          return;
        }
        // Cambiando a otro usuario ya cacheado en este equipo — sin red.
        const snapshot = await getSessionSnapshot(pinTarget.usuarioId);
        if (!snapshot) {
          setPin('');
          setError('No se encontró la sesión de este usuario en el equipo.');
          return;
        }
        setAuth(snapshot.usuario, snapshot.accessToken);
        void refreshAccessToken();
        return;
      }
      setPin('');
      if (result.reason === 'sin-pin') {
        setError('Este usuario no tiene un PIN configurado en este equipo.');
      } else if (result.reason === 'expirado') {
        setError('Pasó demasiado tiempo sin conexión — necesitas conectarte a internet para renovar el acceso.');
      } else if (result.reason === 'bloqueado' && result.lockedUntil) {
        setLockedUntil(result.lockedUntil);
        setError('Demasiados intentos incorrectos.');
      } else {
        setError('PIN incorrecto.');
      }
    } finally {
      setChecking(false);
    }
  }

  async function abrirElegirUsuario() {
    if (!usuario) return;
    const otros = await listCachedUsers(usuario.id);
    setOtrosUsuarios(otros);
    setVista('elegir');
  }

  function elegirUsuario(u: CachedUser) {
    setPinTarget({ usuarioId: u.usuarioId, nombre: u.usuario.nombre });
    setPin('');
    setError(null);
    setLockedUntil(null);
    setVista('pin');
  }

  async function eliminarUsuarioCacheado(usuarioId: string) {
    setEliminando(true);
    try {
      await clearPin(usuarioId);
      await deleteSessionSnapshot(usuarioId);
      setOtrosUsuarios((prev) => prev.filter((u) => u.usuarioId !== usuarioId));
      setConfirmandoEliminar(null);
    } finally {
      setEliminando(false);
    }
  }

  function volverAlActivo() {
    if (usuario) setPinTarget({ usuarioId: usuario.id, nombre: usuario.nombre });
    setPin('');
    setError(null);
    setVista('pin');
  }

  function usarOtraCuenta() {
    // Logout real — solo borra la sesión ACTIVA de este equipo, no los demás
    // usuarios cacheados (ver session-cache.ts). Requiere internet para
    // volver a entrar, porque es un usuario sin caché en este equipo.
    clearAuth();
    clearContexto();
    router.push('/login');
  }

  const bloqueadoAhora = !!lockedUntil && lockedUntil.getTime() > Date.now();
  const esUsuarioActivo = !!usuario && pinTarget?.usuarioId === usuario.id;

  return (
    <div className="fixed inset-0 z-50 bg-steel-950/95 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 text-center">
        {vista === 'pin' ? (
          <>
            <div className="w-12 h-12 rounded-full bg-steel-100 flex items-center justify-center mx-auto mb-4">
              <Lock className="h-5 w-5 text-steel-600" />
            </div>
            <h1 className="text-display-sm font-bold text-steel-900">
              Hola, {pinTarget?.nombre ?? ''}
            </h1>
            <p className="text-body-sm text-steel-500 mt-1 mb-5">
              Ingresa tu PIN para continuar
            </p>

            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={PIN_LENGTH}
              autoFocus
              disabled={checking || bloqueadoAhora}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              className="w-full text-center text-2xl tracking-[0.5em] rounded-md border border-steel-300 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:opacity-50"
              placeholder="••••••"
            />

            {error && (
              <p className="text-body-sm text-brand-600 mb-2">
                {error}
                {bloqueadoAhora && lockedUntil && (
                  <> Intenta de nuevo en {fmtSegundosRestantes(lockedUntil)}.</>
                )}
              </p>
            )}

            <Button
              className="w-full mt-2"
              loading={checking}
              disabled={pin.length !== PIN_LENGTH || bloqueadoAhora}
              onClick={() => void onSubmit()}
            >
              Desbloquear
            </Button>

            {!esUsuarioActivo && (
              <button type="button" onClick={volverAlActivo} className="text-meta text-steel-400 hover:text-steel-600 mt-3 block w-full">
                Cancelar
              </button>
            )}

            <button
              type="button"
              onClick={() => void abrirElegirUsuario()}
              className="text-meta text-steel-400 hover:text-steel-600 mt-4 transition-colors"
            >
              ¿No eres tú? Cambiar de usuario
            </button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-steel-100 flex items-center justify-center mx-auto mb-4">
              <Users className="h-5 w-5 text-steel-600" />
            </div>
            <h1 className="text-display-sm font-bold text-steel-900 mb-1">Cambiar de usuario</h1>
            <p className="text-body-sm text-steel-500 mb-4">
              Usuarios con sesión guardada en este equipo
            </p>

            {otrosUsuarios.length > 0 ? (
              <div className="space-y-1.5 mb-4 text-left">
                {otrosUsuarios.map((u) => (
                  confirmandoEliminar === u.usuarioId ? (
                    <div key={u.usuarioId} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-brand-200 bg-brand-50">
                      <p className="text-body-sm text-brand-700 flex-1">
                        ¿Quitar el acceso sin conexión de {u.usuario.nombre}?
                      </p>
                      <button
                        type="button"
                        disabled={eliminando}
                        onClick={() => void eliminarUsuarioCacheado(u.usuarioId)}
                        className="text-meta font-semibold text-brand-600 hover:text-brand-700 flex-shrink-0"
                      >
                        {eliminando ? '...' : 'Sí, quitar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmandoEliminar(null)}
                        className="text-meta text-steel-400 hover:text-steel-600 flex-shrink-0"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div
                      key={u.usuarioId}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-steel-200 hover:bg-steel-50 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => elegirUsuario(u)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-brand-700 text-meta font-semibold">
                            {u.usuario.nombre.charAt(0)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-body-sm font-semibold text-steel-900 truncate">{u.usuario.nombre} {u.usuario.apellidos}</p>
                          <p className="text-meta text-steel-400 truncate">{u.usuario.email}</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmandoEliminar(u.usuarioId)}
                        title="Quitar de este equipo"
                        aria-label="Quitar de este equipo"
                        className="p-1.5 rounded text-steel-400 hover:text-brand-600 hover:bg-brand-50 flex-shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-steel-400 mb-4">
                No hay otros usuarios guardados en este equipo.
              </p>
            )}

            <Button variant="secondary" className="w-full" onClick={usarOtraCuenta}>
              Usar otra cuenta (necesita internet)
            </Button>

            <button type="button" onClick={volverAlActivo} className="text-meta text-steel-400 hover:text-steel-600 mt-4">
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
