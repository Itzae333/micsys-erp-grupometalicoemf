'use client';

import { useState, useEffect, useCallback } from 'react';
import { User, Shield, LogOut, RefreshCw, KeyRound } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/store/auth.store';
import { useRouter } from 'next/navigation';
import { useContextoStore } from '@/lib/store/contexto.store';
import { hasPin, setPin, clearPin, isPinFormatValid, PIN_LENGTH } from '@/lib/offline/pin';
import { deleteSessionSnapshot } from '@/lib/offline/session-cache';

interface Session {
  id: string;
  created_at: string;
  expires_at: string;
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function PerfilPage() {
  const { usuario, clearAuth } = useAuthStore();
  const { clearContexto } = useContextoStore();
  const router = useRouter();

  const [sessions, setSessions]       = useState<Session[]>([]);
  const [loadingSess, setLoadingSess] = useState(false);
  const [revoking, setRevoking]       = useState(false);
  const [revoked, setRevoked]         = useState(false);

  const [pinConfigurado, setPinConfigurado] = useState(false);
  const [pinNuevo, setPinNuevo]             = useState('');
  const [pinConfirmar, setPinConfirmar]     = useState('');
  const [pinError, setPinError]             = useState<string | null>(null);
  const [pinOk, setPinOk]                   = useState(false);
  const [guardandoPin, setGuardandoPin]     = useState(false);

  const loadSessions = useCallback(async () => {
    setLoadingSess(true);
    try {
      const data = await api.get<Session[]>('/auth/sessions');
      setSessions(data);
    } catch { /* noop */ }
    finally { setLoadingSess(false); }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (!usuario) return;
    void hasPin(usuario.id).then(setPinConfigurado);
  }, [usuario]);

  async function onGuardarPin() {
    if (!usuario) return;
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
      await setPin(usuario.id, pinNuevo);
      setPinConfigurado(true);
      setPinOk(true);
      setPinNuevo('');
      setPinConfirmar('');
      setTimeout(() => setPinOk(false), 2500);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Error al guardar el PIN');
    } finally {
      setGuardandoPin(false);
    }
  }

  async function revokeAll() {
    setRevoking(true);
    try {
      await api.delete('/auth/sessions');
      if (usuario) {
        await clearPin(usuario.id);
        await deleteSessionSnapshot(usuario.id);
      }
      setRevoked(true);
      setSessions([]);
      setTimeout(() => {
        clearAuth();
        clearContexto();
        router.push('/login');
      }, 1500);
    } catch { /* noop */ }
    finally { setRevoking(false); }
  }

  const nombreCompleto = usuario ? `${usuario.nombre} ${usuario.apellidos}` : '—';
  const rolLabel = usuario?.rol?.toLowerCase().replace(/_/g, ' ') ?? '';

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center">
          <User className="h-6 w-6 text-brand-700" />
        </div>
        <div>
          <h1 className="text-display-sm font-bold text-steel-900">{nombreCompleto}</h1>
          <p className="text-body-sm text-steel-500 capitalize">{rolLabel}</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white border border-steel-200 rounded-xl p-5 space-y-3">
        <h2 className="text-body font-semibold text-steel-700">Información de cuenta</h2>
        <dl className="space-y-2 text-body-sm">
          <div className="flex justify-between">
            <dt className="text-steel-500">Correo</dt>
            <dd className="text-steel-900">{usuario?.email ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-steel-500">Rol</dt>
            <dd className="text-steel-900 capitalize">{rolLabel}</dd>
          </div>
        </dl>
      </div>

      {/* PIN de acceso sin conexión */}
      <div className="bg-white border border-steel-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-steel-500" />
          <h2 className="text-body font-semibold text-steel-700">PIN de acceso sin conexión</h2>
        </div>
        <p className="text-body-sm text-steel-500">
          {pinConfigurado
            ? 'Ya tienes un PIN configurado en este equipo — te permite reanudar tu sesión sin internet cuando cierres sesión.'
            : 'Configura un PIN para poder seguir trabajando en este equipo aunque no haya internet.'}
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
        {pinOk && <p className="text-body-sm text-green-700 font-medium">PIN guardado.</p>}
        <Button
          size="sm"
          onClick={() => void onGuardarPin()}
          disabled={guardandoPin || !pinNuevo || !pinConfirmar}
        >
          {guardandoPin ? 'Guardando…' : pinConfigurado ? 'Cambiar PIN' : 'Configurar PIN'}
        </Button>
      </div>

      {/* Sesiones activas */}
      <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-steel-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-steel-500" />
            <h2 className="text-body font-semibold text-steel-700">
              Sesiones activas ({sessions.length})
            </h2>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void loadSessions()}
            disabled={loadingSess}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingSess ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {loadingSess ? (
          <div className="p-6 text-center text-body-sm text-steel-400">Cargando…</div>
        ) : sessions.length === 0 ? (
          <div className="p-6 text-center text-body-sm text-steel-400">Sin sesiones activas</div>
        ) : (
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-steel-100 bg-steel-50">
                <th className="px-4 py-2 text-left font-medium text-steel-500">Iniciada</th>
                <th className="px-4 py-2 text-left font-medium text-steel-500">Expira</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {sessions.map((s, i) => (
                <tr key={s.id} className="hover:bg-steel-50">
                  <td className="px-4 py-2 text-steel-700 tabular-nums">
                    {fmtFecha(s.created_at)}
                    {i === 0 && (
                      <span className="ml-2 text-meta bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                        actual
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-steel-400 tabular-nums">{fmtFecha(s.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="px-5 py-4 border-t border-steel-100 bg-steel-50">
          {revoked ? (
            <p className="text-body-sm text-green-700 font-medium">
              Sesiones cerradas. Redirigiendo al login…
            </p>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void revokeAll()}
              disabled={revoking || sessions.length === 0}
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              {revoking ? 'Cerrando sesiones…' : 'Cerrar todas las sesiones'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
