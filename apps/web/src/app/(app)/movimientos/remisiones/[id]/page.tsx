'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, Truck, CheckCircle2, AlertCircle, XCircle,
  Clock, Printer, QrCode, Send, PackageCheck,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EstatusRemision = 'BORRADOR' | 'EN_TRANSITO' | 'RECIBIDA_COMPLETA' | 'RECIBIDA_PARCIAL' | 'CANCELADA';

interface RemisionLinea {
  id: string;
  articulo_clave: string;
  slot_origen: number;
  slot_destino: number;
  cantidad_enviada: number;
  cantidad_recibida: number | null;
  notas: string | null;
  articulo: { id: string; clave: string; descripcion_1: string | null; descripcion_2: string | null };
}

interface Remision {
  id: string;
  folio: string;
  estatus: EstatusRemision;
  concepto: string | null;
  notas: string | null;
  created_at: string;
  fecha_envio: string | null;
  fecha_recepcion: string | null;
  empresa_origen:  { id: string; nombre: string };
  ub_origen:       { id: string; nombre: string };
  empresa_destino: { id: string; nombre: string };
  ub_destino:      { id: string; nombre: string };
  creado_por:      { nombre: string; apellidos: string };
  enviado_por:     { nombre: string; apellidos: string } | null;
  recibido_por:    { nombre: string; apellidos: string } | null;
  lineas: RemisionLinea[];
}

const ESTATUS_CFG: Record<EstatusRemision, {
  label: string; icon: React.ReactNode; cls: string;
}> = {
  BORRADOR:          { label: 'Borrador',    icon: <Clock className="h-4 w-4" />,        cls: 'bg-steel-100 text-steel-600' },
  EN_TRANSITO:       { label: 'En tránsito', icon: <Truck className="h-4 w-4" />,        cls: 'bg-yellow-100 text-yellow-700' },
  RECIBIDA_COMPLETA: { label: 'Completa',    icon: <CheckCircle2 className="h-4 w-4" />, cls: 'bg-green-100 text-green-700' },
  RECIBIDA_PARCIAL:  { label: 'Parcial',     icon: <AlertCircle className="h-4 w-4" />,  cls: 'bg-orange-100 text-orange-700' },
  CANCELADA:         { label: 'Cancelada',   icon: <XCircle className="h-4 w-4" />,      cls: 'bg-red-100 text-red-600' },
};

const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';
const APP_URL  = typeof window !== 'undefined' ? window.location.origin : '';

export default function RemisionDetallePage({ params }: { params: { id: string } }) {
  const router    = useRouter();
  const { usuario } = useAuthStore();
  const { empresa }  = useContextoStore();

  const [rem, setRem]     = useState<Remision | null>(null);
  const [loading, setLoading]   = useState(true);
  const [action, setAction]     = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [qrUrl, setQrUrl]       = useState<string | null>(null);
  const qrCanvasRef             = useRef<HTMLCanvasElement>(null);

  // Recepción inline
  const [showRecibir, setShowRecibir]   = useState(false);
  const [cantidades, setCantidades]     = useState<Record<string, number>>({});

  const canManage  = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');
  const canReceive = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA'].includes(usuario?.rol ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Remision>(`/remisiones/${params.id}`);
      setRem(data);
      // Init cantidades con los valores enviados
      const init: Record<string, number> = {};
      data.lineas.forEach((l) => { init[l.id] = l.cantidad_enviada; });
      setCantidades(init);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  // Generar QR cuando tengamos el folio
  useEffect(() => {
    if (!rem) return;
    const url = `${APP_URL}/movimientos/recibir?folio=${rem.folio}`;
    import('qrcode').then((QRCode) => {
      QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setQrUrl).catch(console.error);
    }).catch(console.error);
  }, [rem]);

  async function doEnviar() {
    if (!rem || !empresa) return;
    setAction('enviar');
    setError(null);
    try {
      await api.patch(`/remisiones/${rem.id}/enviar`, {});
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Error al enviar');
    } finally {
      setAction(null);
    }
  }

  async function doCancelar() {
    if (!rem || !empresa) return;
    if (!confirm('¿Cancelar esta remisión? No se puede deshacer.')) return;
    setAction('cancelar');
    try {
      await api.delete(`/remisiones/${rem.id}`);
      router.push('/movimientos/remisiones');
    } catch (err: any) {
      setError(err?.message ?? 'Error al cancelar');
    } finally {
      setAction(null);
    }
  }

  async function doRecibir() {
    if (!rem || !empresa) return;
    setAction('recibir');
    setError(null);
    try {
      await api.patch(
        `/remisiones/${rem.id}/recibir`,
        { lineas: rem.lineas.map((l) => ({ linea_id: l.id, cantidad_recibida: cantidades[l.id] ?? l.cantidad_enviada })) },
      );
      await load();
      setShowRecibir(false);
    } catch (err: any) {
      setError(err?.message ?? 'Error al recibir');
    } finally {
      setAction(null);
    }
  }

  function printTicket() {
    if (!rem) return;
    const lines = [
      '================================',
      '       REMISIÓN DE ALMACÉN',
      `       ${rem.folio}`,
      '================================',
      `Origen:  ${rem.empresa_origen.nombre}`,
      `         ${rem.ub_origen.nombre}`,
      `Destino: ${rem.empresa_destino.nombre}`,
      `         ${rem.ub_destino.nombre}`,
      `Fecha:   ${new Date(rem.fecha_envio ?? rem.created_at).toLocaleString('es-MX')}`,
      '--------------------------------',
      'ARTÍCULO                   CANT',
      '--------------------------------',
      ...rem.lineas.map((l) => {
        const nombre = (l.articulo.clave + ' ' + (l.articulo.descripcion_1 ?? '')).slice(0, 28);
        const cant   = String(l.cantidad_enviada).padStart(6);
        return `${nombre.padEnd(29)}${cant}`;
      }),
      '--------------------------------',
      `Total artículos: ${rem.lineas.length}`,
      '',
      `Escanea para recibir:`,
      `${APP_URL}/movimientos/recibir?folio=${rem.folio}`,
      '================================',
    ].join('\n');

    fetch('http://localhost:7788/print', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: lines,
    }).catch(console.error);
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return <div className="p-8 text-center text-steel-400">Cargando…</div>;
  }
  if (!rem) {
    return <div className="p-8 text-center text-steel-500">Remisión no encontrada</div>;
  }

  const cfg = ESTATUS_CFG[rem.estatus];
  const isDestino = empresa?.id === rem.empresa_destino.id;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-steel-500 hover:text-steel-900 transition-colors">
            ←
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-display-sm font-bold text-steel-900 font-mono">{rem.folio}</h1>
              <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-body-sm font-medium', cfg.cls)}>
                {cfg.icon}
                {cfg.label}
              </span>
            </div>
            {rem.concepto && <p className="text-body-sm text-steel-500 mt-0.5">{rem.concepto}</p>}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={printTicket}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Imprimir
          </Button>
          {rem.estatus === 'BORRADOR' && canManage && (
            <>
              <Button variant="outline" size="sm" onClick={doCancelar} disabled={!!action}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Cancelar
              </Button>
              <Button size="sm" onClick={doEnviar} disabled={!!action}>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {action === 'enviar' ? 'Enviando…' : 'Enviar'}
              </Button>
            </>
          )}
          {rem.estatus === 'EN_TRANSITO' && (isDestino || canManage) && canReceive && !showRecibir && (
            <Button size="sm" onClick={() => setShowRecibir(true)}>
              <PackageCheck className="h-3.5 w-3.5 mr-1.5" />
              Recibir
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-body-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-6">
        <div className="space-y-5">
          {/* Info ruta */}
          <div className="bg-white border border-steel-200 rounded-xl p-5">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
              <div>
                <p className="text-meta text-steel-500 uppercase tracking-wide font-medium mb-1">Origen</p>
                <p className="text-body font-semibold text-steel-800">{rem.empresa_origen.nombre}</p>
                <p className="text-body-sm text-steel-500">{rem.ub_origen.nombre}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-steel-400 hidden md:block" />
              <div>
                <p className="text-meta text-steel-500 uppercase tracking-wide font-medium mb-1">Destino</p>
                <p className="text-body font-semibold text-steel-800">{rem.empresa_destino.nombre}</p>
                <p className="text-body-sm text-steel-500">{rem.ub_destino.nombre}</p>
              </div>
            </div>

            <div className="border-t border-steel-100 mt-4 pt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-body-sm">
              <div>
                <p className="text-meta text-steel-400">Creado</p>
                <p className="text-steel-700">{fmt(rem.created_at)}</p>
                <p className="text-meta text-steel-500">{rem.creado_por.nombre} {rem.creado_por.apellidos}</p>
              </div>
              {rem.enviado_por && (
                <div>
                  <p className="text-meta text-steel-400">Enviado</p>
                  <p className="text-steel-700">{fmt(rem.fecha_envio!)}</p>
                  <p className="text-meta text-steel-500">{rem.enviado_por.nombre} {rem.enviado_por.apellidos}</p>
                </div>
              )}
              {rem.recibido_por && (
                <div>
                  <p className="text-meta text-steel-400">Recibido</p>
                  <p className="text-steel-700">{fmt(rem.fecha_recepcion!)}</p>
                  <p className="text-meta text-steel-500">{rem.recibido_por.nombre} {rem.recibido_por.apellidos}</p>
                </div>
              )}
            </div>
          </div>

          {/* Tabla de líneas */}
          <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-steel-100 bg-steel-50">
              <p className="text-body-sm font-medium text-steel-700">Artículos ({rem.lineas.length})</p>
            </div>
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="text-left px-4 py-3 font-medium text-steel-600">Artículo</th>
                  <th className="text-center px-3 py-3 font-medium text-steel-600 hidden md:table-cell">Slots</th>
                  <th className="text-right px-4 py-3 font-medium text-steel-600">Enviado</th>
                  <th className="text-right px-4 py-3 font-medium text-steel-600">Recibido</th>
                  {['RECIBIDA_COMPLETA', 'RECIBIDA_PARCIAL'].includes(rem.estatus) && (
                    <th className="text-right px-4 py-3 font-medium text-steel-600">Dif.</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100 bg-white">
                {rem.lineas.map((linea) => {
                  const dif = linea.cantidad_recibida != null
                    ? linea.cantidad_recibida - linea.cantidad_enviada
                    : null;
                  return (
                    <tr key={linea.id} className="bg-white hover:bg-steel-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-steel-800">{linea.articulo.clave}</p>
                        <p className="text-meta text-steel-500">{linea.articulo.descripcion_1}</p>
                      </td>
                      <td className="px-3 py-3 text-center text-steel-500 hidden md:table-cell">
                        <span className="text-meta">{linea.slot_origen} → {linea.slot_destino}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-steel-800">
                        {linea.cantidad_enviada}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {showRecibir ? (
                          <input
                            type="number"
                            min={0}
                            step={0.001}
                            value={cantidades[linea.id] ?? linea.cantidad_enviada}
                            onChange={(e) => setCantidades((p) => ({ ...p, [linea.id]: Number(e.target.value) }))}
                            className="w-20 border border-steel-300 rounded px-2 py-1 text-right text-body-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        ) : (
                          <span className={cn(
                            'font-medium',
                            linea.cantidad_recibida == null ? 'text-steel-400' : 'text-steel-800',
                          )}>
                            {linea.cantidad_recibida ?? '—'}
                          </span>
                        )}
                      </td>
                      {['RECIBIDA_COMPLETA', 'RECIBIDA_PARCIAL'].includes(rem.estatus) && (
                        <td className="px-4 py-3 text-right">
                          {dif !== null && (
                            <span className={cn(
                              'font-medium',
                              dif < 0 ? 'text-red-600' : dif > 0 ? 'text-green-600' : 'text-steel-400',
                            )}>
                              {dif >= 0 ? '+' : ''}{dif}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {showRecibir && (
              <div className="px-4 py-3 border-t border-steel-100 bg-steel-50 flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowRecibir(false)} disabled={!!action}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={doRecibir} disabled={!!action}>
                  <PackageCheck className="h-3.5 w-3.5 mr-1.5" />
                  {action === 'recibir' ? 'Confirmando…' : 'Confirmar recepción'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* QR panel */}
        {rem.estatus !== 'BORRADOR' && rem.estatus !== 'CANCELADA' && (
          <div className="bg-white border border-steel-200 rounded-xl p-5 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-body-sm font-medium text-steel-700">
              <QrCode className="h-4 w-4" />
              Código QR
            </div>
            {qrUrl ? (
              <img src={qrUrl} alt={`QR ${rem.folio}`} className="w-40 h-40" />
            ) : (
              <div className="w-40 h-40 bg-steel-100 rounded flex items-center justify-center text-steel-400 text-meta">
                Generando…
              </div>
            )}
            <p className="text-meta text-steel-500 text-center">
              El almacenista escanea para recibir
            </p>
            <p className="font-mono text-meta text-brand-600 text-center break-all">{rem.folio}</p>
          </div>
        )}
      </div>
    </div>
  );
}
