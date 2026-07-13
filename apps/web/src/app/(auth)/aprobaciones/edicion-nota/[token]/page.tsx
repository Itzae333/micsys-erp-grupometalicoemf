'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/brand/Logo';
import { formatPrecio } from '@/lib/utils';

interface SolicitudPublica {
  valido: boolean;
  estatus: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  motivo: string;
  folio: number;
  total: number;
  solicitante: { id: string; nombre: string; apellidos: string } | null;
  admins_disponibles: { id: string; nombre: string; apellidos: string }[];
}

const ESTATUS_MENSAJE: Record<string, string> = {
  APROBADA: 'Esta solicitud ya fue autorizada anteriormente.',
  RECHAZADA: 'Esta solicitud ya fue rechazada anteriormente.',
  PENDIENTE: 'El enlace de esta solicitud ya expiró.',
};

export default function AprobarEdicionNotaPage() {
  const { token } = useParams<{ token: string }>();

  const [data, setData] = useState<SolicitudPublica | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [aprobadorId, setAprobadorId] = useState('');
  const [comentario, setComentario] = useState('');
  const [procesando, setProcesando] = useState<'aprobar' | 'rechazar' | null>(null);
  const [resultado, setResultado] = useState<'aprobada' | 'rechazada' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<SolicitudPublica>(`/solicitudes-edicion/token/${token}`, { skipAuth: true })
      .then((res) => {
        setData(res);
        if (res.admins_disponibles.length === 1) setAprobadorId(res.admins_disponibles[0].id);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function onAprobar() {
    if (!aprobadorId) {
      setError('Selecciona quién autoriza la edición.');
      return;
    }
    setError(null);
    setProcesando('aprobar');
    try {
      await api.post(`/solicitudes-edicion/token/${token}/aprobar`, { aprobador_usuario_id: aprobadorId }, { skipAuth: true });
      setResultado('aprobada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al autorizar la solicitud');
    } finally {
      setProcesando(null);
    }
  }

  async function onRechazar() {
    setError(null);
    setProcesando('rechazar');
    try {
      await api.post(`/solicitudes-edicion/token/${token}/rechazar`, {
        aprobador_usuario_id: aprobadorId || undefined,
        comentario_admin: comentario || undefined,
      }, { skipAuth: true });
      setResultado('rechazada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al rechazar la solicitud');
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center mb-3">
          <span className="text-white font-bold text-lg tracking-tight">EMF</span>
        </div>
        <Wordmark />
      </div>

      <div className="bg-white border border-steel-200 rounded-xl p-6 shadow-sm">
        {loading && (
          <p className="text-body text-steel-500 text-center py-6">Cargando solicitud…</p>
        )}

        {!loading && notFound && (
          <div className="text-center py-4">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <p className="text-body font-semibold text-steel-900">Solicitud no encontrada</p>
            <p className="text-body-sm text-steel-500 mt-1">Verifica que el enlace esté completo.</p>
          </div>
        )}

        {!loading && data && resultado === 'aprobada' && (
          <div className="text-center py-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-body font-semibold text-steel-900">Edición autorizada</p>
            <p className="text-body-sm text-steel-500 mt-1">
              La nota #{String(data.folio).padStart(4, '0')} ya puede editarse desde el sistema.
            </p>
          </div>
        )}

        {!loading && data && resultado === 'rechazada' && (
          <div className="text-center py-4">
            <XCircle className="h-8 w-8 text-brand-600 mx-auto mb-2" />
            <p className="text-body font-semibold text-steel-900">Solicitud rechazada</p>
          </div>
        )}

        {!loading && data && !resultado && (
          <>
            <h1 className="text-display-sm font-bold text-steel-900 mb-1">
              Nota #{String(data.folio).padStart(4, '0')}
            </h1>
            <p className="text-body-sm text-steel-500 mb-4">
              {data.solicitante ? `${data.solicitante.nombre} ${data.solicitante.apellidos}` : 'Un usuario'} solicitó editar esta venta ya cobrada.
            </p>

            <div className="bg-steel-50 rounded-lg px-3 py-2.5 mb-4 space-y-1">
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-steel-500">Total de la venta</span>
                <span className="font-semibold text-steel-900">{formatPrecio(data.total)}</span>
              </div>
              <p className="text-body-sm text-steel-700 pt-1 border-t border-steel-200 mt-1">
                <span className="text-steel-500">Motivo: </span>{data.motivo}
              </p>
            </div>

            {!data.valido ? (
              <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">
                <p className="text-body-sm text-amber-700">
                  {ESTATUS_MENSAJE[data.estatus] ?? 'Esta solicitud ya no está disponible.'}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                    Autorizando como
                  </label>
                  <select
                    className="flex h-9 w-full rounded-md border border-steel-300 bg-white px-3 py-1 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    value={aprobadorId}
                    onChange={(e) => setAprobadorId(e.target.value)}
                  >
                    <option value="">Selecciona tu nombre…</option>
                    {data.admins_disponibles.map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre} {a.apellidos}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                    Comentario (opcional, para rechazo)
                  </label>
                  <textarea
                    className="flex w-full rounded-md border border-steel-300 bg-white px-3 py-2 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    rows={2}
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                  />
                </div>

                {error && (
                  <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2 mb-4">
                    <p className="text-body-sm text-brand-600">{error}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    loading={procesando === 'rechazar'}
                    disabled={procesando !== null}
                    onClick={onRechazar}
                  >
                    Rechazar
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    loading={procesando === 'aprobar'}
                    disabled={procesando !== null}
                    onClick={onAprobar}
                  >
                    Autorizar
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
