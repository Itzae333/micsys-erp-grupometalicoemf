'use client';

import { useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { useContextoStore } from '@/lib/store/contexto.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Calculator, Printer, RefreshCw,
  Banknote, CreditCard, Building2, Package,
} from 'lucide-react';

// ── tipos ────────────────────────────────────────────────────

interface MetodoResumen { count: number; total: number; }
interface EstatusResumen { count: number; total: number; }
interface NotaCorte {
  id: string; folio: number; estatus: string; total: number;
  cambio: number;
  created_at: string;
  cliente: { nombre: string };
  pagos: { metodo: string; monto: number }[];
}
interface CorteCajaData {
  desde: string | null;
  hasta: string | null;
  total_cobrado: number;
  por_metodo: Record<string, MetodoResumen>;
  por_estatus: Record<string, EstatusResumen>;
  notas: NotaCorte[];
}

// ── helpers ──────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
};
const METODO_ICON: Record<string, React.ReactNode> = {
  EFECTIVO:      <Banknote  className="h-4 w-4 text-green-600" />,
  TARJETA:       <CreditCard className="h-4 w-4 text-blue-600" />,
  TRANSFERENCIA: <Building2  className="h-4 w-4 text-purple-600" />,
  DEPOSITO:      <Package    className="h-4 w-4 text-amber-600" />,
};
const ESTATUS_BADGE: Record<string, string> = {
  PAGADA:    'bg-green-100 text-green-800',
  CREDITO:   'bg-amber-100 text-amber-800',
  REABIERTA: 'bg-blue-100 text-blue-800',
  CANCELADA: 'bg-red-100 text-red-800',
};

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtHour = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

// ── componente ───────────────────────────────────────────────

export default function CorteCajaPage() {
  const { empresa, ubicacion } = useContextoStore();

  const [desde, setDesde] = useState(TODAY);
  const [hasta, setHasta] = useState(TODAY);
  const [data, setData] = useState<CorteCajaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!empresa) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (ubicacion?.id) params.set('ubicacionId', ubicacion.id);
      const res = await api.get<CorteCajaData>(`/ventas/corte-caja?${params}`);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [empresa, ubicacion, desde, hasta]);

  const print = async () => {
    if (!data || !empresa) return;
    try {
      await fetch('http://localhost:7788/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'corte_caja',
          empresa: { nombre: empresa.nombre },
          ubicacion: ubicacion ? { nombre: ubicacion.nombre } : null,
          desde: data.desde,
          hasta: data.hasta,
          total_cobrado: data.total_cobrado,
          por_metodo: data.por_metodo,
          por_estatus: data.por_estatus,
          notas: data.notas,
        }),
      });
    } catch {
      // print bridge offline — silencioso
    }
  };

  const metodos = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-steel-600" />
        <h1 className="text-2xl font-bold text-steel-900">Corte de Caja</h1>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-steel-200 p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-steel-500 uppercase tracking-wide">Desde</label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-steel-500 uppercase tracking-wide">Hasta</label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
        </div>
        <Button onClick={load} disabled={loading} className="gap-2">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Generar corte
        </Button>
        {data && (
          <Button variant="outline" onClick={print} className="gap-2 ml-auto">
            <Printer className="h-4 w-4" /> Imprimir ticket
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {data && (
        <>
          {/* Total cobrado */}
          <div className="bg-steel-900 text-white rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-steel-400 text-sm uppercase tracking-wide">Total cobrado</p>
              <p className="text-3xl font-bold mt-1">{fmt(data.total_cobrado)}</p>
              <p className="text-steel-400 text-xs mt-1">
                {data.notas.length} nota{data.notas.length !== 1 ? 's' : ''} ·{' '}
                {desde === hasta ? desde : `${desde} → ${hasta}`}
              </p>
            </div>
            <Calculator className="h-10 w-10 text-steel-500" />
          </div>

          {/* Por método de pago */}
          <div>
            <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide mb-3">
              Por método de pago
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {metodos.map((m) => {
                const res = data.por_metodo[m] ?? { count: 0, total: 0 };
                return (
                  <div key={m} className="bg-white rounded-xl border border-steel-200 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      {METODO_ICON[m]}
                      <span className="text-sm font-medium text-steel-700">{METODO_LABEL[m]}</span>
                    </div>
                    <p className="text-2xl font-bold text-steel-900">{fmt(res.total)}</p>
                    <p className="text-xs text-steel-400">{res.count} cobro{res.count !== 1 ? 's' : ''}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Por estatus */}
          <div>
            <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide mb-3">
              Por estatus
            </h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.por_estatus).map(([est, res]) => (
                <div key={est} className="bg-white rounded-xl border border-steel-200 px-4 py-3 flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ESTATUS_BADGE[est] ?? 'bg-steel-100 text-steel-800'}`}>
                    {est}
                  </span>
                  <span className="font-semibold text-steel-900">{fmt(res.total)}</span>
                  <span className="text-xs text-steel-400">{res.count} nota{res.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detalle de notas */}
          <div>
            <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide mb-3">
              Detalle de notas
            </h2>
            <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-steel-50 border-b border-steel-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Folio</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Hora</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Estatus</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Métodos</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Cambio</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.notas.map((n, i) => (
                    <tr key={n.id} className={i % 2 === 0 ? 'bg-white' : 'bg-steel-50/40'}>
                      <td className="px-4 py-2.5 font-mono font-semibold text-steel-700">#{String(n.folio).padStart(4, '0')}</td>
                      <td className="px-4 py-2.5 text-steel-500">{fmtHour(n.created_at)}</td>
                      <td className="px-4 py-2.5 text-steel-700 max-w-[160px] truncate">{n.cliente.nombre}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ESTATUS_BADGE[n.estatus] ?? 'bg-steel-100 text-steel-800'}`}>
                          {n.estatus}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          {n.pagos.filter((p) => p.monto > 0).map((p, j) => (
                            <span key={j} className="text-xs bg-steel-100 text-steel-600 px-1.5 py-0.5 rounded">
                              {METODO_LABEL[p.metodo] ?? p.metodo} {fmt(p.monto)}
                            </span>
                          ))}
                          {n.pagos.filter((p) => p.monto > 0).length === 0 && (
                            <span className="text-xs text-steel-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-steel-400">
                        {n.cambio > 0 ? (
                          <span className="text-amber-600 font-medium">{fmt(n.cambio)}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-steel-900">{fmt(n.total)}</td>
                    </tr>
                  ))}
                  {data.notas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-steel-400">
                        Sin notas en el rango seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>
                {data.notas.length > 0 && (
                  <tfoot>
                    <tr className="bg-steel-900">
                      <td colSpan={6} className="px-4 py-3 text-right text-sm font-bold text-white">
                        TOTAL COBRADO
                      </td>
                      <td className="px-4 py-3 text-right text-base font-bold text-white">
                        {fmt(data.total_cobrado)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="bg-white rounded-xl border border-steel-200 py-16 text-center text-steel-400">
          <Calculator className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona un rango de fechas y presiona <strong>Generar corte</strong></p>
        </div>
      )}
    </div>
  );
}
