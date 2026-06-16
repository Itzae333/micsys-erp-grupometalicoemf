'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, PackageCheck, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface RemisionLinea {
  id: string;
  articulo_clave: string;
  slot_origen: number;
  slot_destino: number;
  cantidad_enviada: number;
  cantidad_recibida: number | null;
  articulo: { clave: string; descripcion_1: string | null };
}

interface Remision {
  id: string;
  folio: string;
  estatus: string;
  empresa_origen:  { nombre: string };
  ub_origen:       { nombre: string };
  empresa_destino: { nombre: string };
  ub_destino:      { nombre: string };
  lineas: RemisionLinea[];
}

function RecibirContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { empresa }  = useContextoStore();

  const [folio, setFolio]         = useState(searchParams.get('folio') ?? '');
  const [rem, setRem]             = useState<Remision | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [searching, setSearching] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [notFound, setNotFound]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [done, setDone]           = useState(false);

  // Auto-buscar si viene folio en query param
  useEffect(() => {
    const f = searchParams.get('folio');
    if (f) {
      setFolio(f);
      void buscar(f);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscar(folioParam?: string) {
    const f = (folioParam ?? folio).trim().toUpperCase();
    if (!f) return;
    setSearching(true);
    setNotFound(false);
    setRem(null);
    setError(null);
    try {
      const data = await api.get<Remision>(`/remisiones/folio/${encodeURIComponent(f)}`);
      setRem(data);
      const init: Record<string, number> = {};
      data.lineas.forEach((l) => { init[l.id] = l.cantidad_enviada; });
      setCantidades(init);
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  }

  async function confirmar() {
    if (!rem || !empresa) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(
        `/remisiones/${rem.id}/recibir`,
        { lineas: rem.lineas.map((l) => ({ linea_id: l.id, cantidad_recibida: cantidades[l.id] ?? l.cantidad_enviada })) },
      );
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? 'Error al confirmar recepción');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const allComplete = rem?.lineas.every(
      (l) => (cantidades[l.id] ?? l.cantidad_enviada) >= l.cantidad_enviada,
    );
    return (
      <div className="p-8 flex flex-col items-center gap-6 text-center">
        {allComplete ? (
          <CheckCircle2 className="h-16 w-16 text-green-500" />
        ) : (
          <AlertCircle className="h-16 w-16 text-orange-500" />
        )}
        <div>
          <h2 className="text-display-sm font-bold text-steel-900">
            {allComplete ? '¡Recepción completa!' : 'Recepción parcial registrada'}
          </h2>
          <p className="text-body-sm text-steel-500 mt-1">
            Folio: <span className="font-mono font-medium text-brand-600">{rem?.folio}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push('/movimientos/remisiones')}>
            Ver remisiones
          </Button>
          <Button onClick={() => {
            setDone(false);
            setRem(null);
            setFolio('');
          }}>
            Nueva recepción
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-display-sm font-bold text-steel-900">Recibir remisión</h1>
        <p className="text-body-sm text-steel-500 mt-0.5">Ingresa el folio o escanea el QR de la remisión</p>
      </div>

      {/* Búsqueda */}
      <div className="bg-white border border-steel-200 rounded-xl p-5 space-y-3">
        <label className="text-body-sm font-medium text-steel-700">Folio de remisión</label>
        <div className="flex gap-2">
          <Input
            value={folio}
            onChange={(e) => setFolio(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') void buscar(); }}
            placeholder="REM-2026-0001"
            className="font-mono"
          />
          <Button onClick={() => void buscar()} disabled={searching || !folio.trim()}>
            <Search className="h-4 w-4 mr-1.5" />
            {searching ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>
        {notFound && (
          <p className="text-body-sm text-red-600">No se encontró ninguna remisión con ese folio.</p>
        )}
      </div>

      {/* Detalle remisión */}
      {rem && (
        <>
          {rem.estatus !== 'EN_TRANSITO' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-body-sm text-yellow-800">
              Esta remisión tiene estatus <strong>{rem.estatus}</strong> y no puede recibirse nuevamente.
            </div>
          )}

          {/* Info */}
          <div className="bg-white border border-steel-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-body-sm text-steel-600">
              <span className="font-semibold">{rem.empresa_origen.nombre}</span>
              <span className="text-steel-400">{rem.ub_origen.nombre}</span>
              <ArrowRight className="h-4 w-4 text-steel-400" />
              <span className="font-semibold">{rem.empresa_destino.nombre}</span>
              <span className="text-steel-400">{rem.ub_destino.nombre}</span>
            </div>
          </div>

          {/* Tabla recepción */}
          <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-steel-100 bg-steel-50">
              <p className="text-body-sm font-medium text-steel-700">
                Artículos a recibir ({rem.lineas.length})
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-steel-100">
                    <th className="text-left px-4 py-3 font-medium text-steel-600">Artículo</th>
                    <th className="text-right px-4 py-3 font-medium text-steel-600">Enviado</th>
                    <th className="text-right px-4 py-3 font-medium text-steel-600">Recibido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100 bg-white">
                  {rem.lineas.map((linea) => {
                    const cant = cantidades[linea.id] ?? linea.cantidad_enviada;
                    const ok   = cant >= linea.cantidad_enviada;
                    return (
                      <tr key={linea.id} className="bg-white">
                        <td className="px-4 py-3">
                          <p className="font-medium text-steel-800">{linea.articulo.clave}</p>
                          <p className="text-meta text-steel-500">{linea.articulo.descripcion_1}</p>
                          <p className="text-meta text-steel-400">Slot {linea.slot_origen} → {linea.slot_destino}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-steel-700">
                          {linea.cantidad_enviada}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step={0.001}
                            value={cant}
                            disabled={rem.estatus !== 'EN_TRANSITO'}
                            onChange={(e) =>
                              setCantidades((p) => ({ ...p, [linea.id]: Number(e.target.value) }))
                            }
                            className={cn(
                              'w-24 border rounded px-2 py-1 text-right text-body-sm focus:outline-none focus:ring-1',
                              ok
                                ? 'border-green-300 bg-green-50 text-green-800 focus:ring-green-400'
                                : 'border-orange-300 bg-orange-50 text-orange-800 focus:ring-orange-400',
                            )}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rem.estatus === 'EN_TRANSITO' && (
              <div className="px-4 py-4 border-t border-steel-100 bg-steel-50 space-y-3">
                {error && (
                  <p className="text-body-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
                )}
                <div className="flex justify-end">
                  <Button onClick={confirmar} disabled={saving}>
                    <PackageCheck className="h-4 w-4 mr-1.5" />
                    {saving ? 'Confirmando…' : 'Confirmar recepción'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function RecibirPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-steel-400">Cargando…</div>}>
      <RecibirContent />
    </Suspense>
  );
}
