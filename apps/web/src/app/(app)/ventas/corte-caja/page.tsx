'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { EMPRESA_METALICOS_LYEVA_ID, EMPRESA_EMFIMIFAR_ID } from '@/lib/empresas';
import { getTicketLogoUrl, logoToEscPosBase64, buildTicketUbicacionFiscal } from '@/lib/utils/ticket-logo';
import { getPendingCount } from '@/lib/db/sync-queue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Calculator, Printer, RefreshCw, AlertTriangle,
  Banknote, CreditCard, Building2, Package, CalendarCheck,
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
  pedido_origen: { folio: number; primer_anticipo: string | null } | null;
}
interface GastoCorte {
  id: string; concepto: string; categoria: string; monto: number;
  metodo_pago: string; usuario: string; created_at: string;
}
interface PagoCreditoDetalle { folio: number; metodo: string; monto: number; fecha: string; }
interface PagoCreditoPorUsuario {
  usuario_id: string;
  nombre: string;
  total: number;
  detalle: { folio: number; monto: number; fecha: string }[];
}
interface PagosCreditoResumen {
  total: number; count: number;
  por_metodo: Record<string, MetodoResumen>;
  detalle: PagoCreditoDetalle[];
  por_usuario?: PagoCreditoPorUsuario[];
}
interface AnticipoDetalle {
  pedido_folio: number; cliente: string; metodo: string; monto: number;
  referencia: string | null; fecha: string;
}
interface AnticiposPedidoResumen {
  total: number; total_pendiente?: number; count: number;
  por_metodo: Record<string, MetodoResumen>;
  detalle: AnticipoDetalle[];
}
interface PorUsuarioResumen {
  usuario_id: string;
  nombre: string;
  notas: NotaCorte[];
  total_efectivo: number;
}
interface CorteCajaData {
  desde: string | null;
  hasta: string | null;
  total_ventas: number;
  total_cobrado: number;
  total_gastos: number;
  total_gastos_efectivo: number;
  total_neto: number;
  total_entregar_efectivo: number;
  por_metodo: Record<string, MetodoResumen>;
  por_estatus: Record<string, EstatusResumen>;
  pagos_credito: PagosCreditoResumen;
  anticipos_pedido?: AnticiposPedidoResumen;
  notas: NotaCorte[];
  gastos: GastoCorte[];
  por_usuario?: PorUsuarioResumen[];
}

// ── helpers ──────────────────────────────────────────────────

// Fecha del día en hora de México — toISOString() da UTC y en horario de México
// (UTC-6) ya rueda al día siguiente desde las 6pm hora local, aunque localmente
// siga siendo el mismo día hasta medianoche.
function hoyMx(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

const TODAY = hoyMx();

// Resta `n` días hábiles (lunes a viernes) a hoy (hora de México). Usado para
// limitar al rol ENCARGADO qué tan atrás puede generar un corte de caja — el
// backend aplica el mismo límite, esto solo evita el viaje redondo al servidor.
function restarDiasHabilesMx(n: number): string {
  const fecha = new Date(`${TODAY}T00:00:00-06:00`);
  let restantes = n;
  while (restantes > 0) {
    fecha.setUTCDate(fecha.getUTCDate() - 1);
    const diaSemana = fecha.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes--;
  }
  return fecha.toISOString().slice(0, 10);
}

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
const fmtDiaCorto = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

// ── componente ───────────────────────────────────────────────

export default function CorteCajaPage() {
  const { empresa, ubicacion } = useContextoStore();
  const { usuario } = useAuthStore();

  const minDesde = usuario?.rol === 'ENCARGADO' ? restarDiasHabilesMx(7) : undefined;

  const [desde, setDesde] = useState(TODAY);
  const [hasta, setHasta] = useState(TODAY);
  const [data, setData] = useState<CorteCajaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingSync, setPendingSync] = useState(0);
  const [desgloseMultipago, setDesgloseMultipago] = useState(false);

  useEffect(() => {
    getPendingCount().then(setPendingSync).catch(() => {});
    const onFocus = () => { getPendingCount().then(setPendingSync).catch(() => {}); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const load = useCallback(async (desdeOverride?: string, hastaOverride?: string) => {
    if (!empresa) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        desde: desdeOverride ?? desde,
        hasta: hastaOverride ?? hasta,
      });
      if (ubicacion?.id) params.set('ubicacionId', ubicacion.id);
      const res = await api.get<CorteCajaData>(`/ventas/corte-caja?${params}`);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [empresa, ubicacion, desde, hasta]);

  // Botón "Corte del Día": fija ambas fechas a hoy (hora de México) y dispara la
  // carga con esos valores directo, sin esperar al próximo render (setDesde/setHasta
  // son async y `load` seguiría usando los valores viejos si se llamara sin overrides).
  const corteDelDia = () => {
    const hoy = hoyMx();
    setDesde(hoy);
    setHasta(hoy);
    load(hoy, hoy);
  };

  const agruparPorUsuario = empresa?.id === EMPRESA_METALICOS_LYEVA_ID && (data?.por_usuario?.length ?? 0) > 0;

  const print = async () => {
    if (!data || !empresa) return;
    try {
      // Se piden frescos (no el store persistido) para que logo/dirección/RFC reflejen
      // cambios hechos después de la última selección de sucursal en este navegador.
      const [empresaFresca, ubicacionFresca] = await Promise.all([
        api.get<typeof empresa>(`/empresas/${empresa.id}`),
        ubicacion ? api.get<typeof ubicacion>(`/empresas/${empresa.id}/ubicaciones/${ubicacion.id}`) : Promise.resolve(null),
      ]);

      const logoUrl = getTicketLogoUrl(empresaFresca, ubicacionFresca);
      const logo_escpos_b64 = logoUrl ? await logoToEscPosBase64(logoUrl) : null;
      if (logoUrl && !logo_escpos_b64) {
        console.warn('[corte-caja] No se pudo rasterizar el logo para el ticket:', logoUrl);
      }

      await fetch('http://localhost:7788/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'corte_caja',
          logo_escpos_b64,
          empresa: { nombre: empresaFresca.nombre },
          ubicacion: ubicacionFresca
            ? { nombre: ubicacionFresca.nombre, ...buildTicketUbicacionFiscal(ubicacionFresca) }
            : null,
          desde: data.desde,
          hasta: data.hasta,
          desglose_multipago: desgloseMultipago,
          total_ventas: data.total_ventas ?? data.total_cobrado,
          total_cobrado: data.total_cobrado,
          total_gastos: data.total_gastos,
          total_gastos_efectivo: data.total_gastos_efectivo ?? data.total_gastos,
          total_neto: data.total_neto,
          total_entregar_efectivo: data.total_entregar_efectivo ?? data.por_metodo?.['EFECTIVO']?.total ?? 0,
          // EMFIMIFAR pidió que el ticket resalte el efectivo arriba en vez de "Total
          // de ventas" — personalización puntual de esa empresa, ver EMPRESA_EMFIMIFAR_ID.
          resaltar_efectivo: empresa.id === EMPRESA_EMFIMIFAR_ID,
          por_metodo: data.por_metodo,
          por_estatus: data.por_estatus,
          pagos_credito: {
            ...(data.pagos_credito ?? { total: 0, count: 0, por_metodo: {}, detalle: [] }),
            por_usuario: agruparPorUsuario ? data.pagos_credito?.por_usuario : undefined,
          },
          anticipos_pedido: data.anticipos_pedido ?? { total: 0, count: 0, por_metodo: {}, detalle: [] },
          notas: data.notas,
          gastos: data.gastos,
          por_usuario: agruparPorUsuario ? data.por_usuario : undefined,
        }),
      });
    } catch {
      // print bridge offline — silencioso
    }
  };

  const metodos = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'];

  const notaRow = (n: NotaCorte, i: number) => (
    <tr key={n.id} className={i % 2 === 0 ? 'bg-white' : 'bg-steel-50/40'}>
      <td className="px-4 py-2.5 font-mono font-semibold text-steel-700">
        #{String(n.folio).padStart(4, '0')}
        {n.pedido_origen && (
          <span
            title={
              `Viene del pedido #${String(n.pedido_origen.folio).padStart(4, '0')}`
              + (n.pedido_origen.primer_anticipo
                ? ` · anticipo desde ${fmtDiaCorto(n.pedido_origen.primer_anticipo)}`
                : '')
            }
            className="ml-1 text-amber-500 cursor-help"
          >
            *
          </span>
        )}
        {n.pedido_origen && (
          <p className="text-[10px] font-normal text-steel-400 normal-case">
            Pedido #{String(n.pedido_origen.folio).padStart(4, '0')}
            {n.pedido_origen.primer_anticipo && ` · anticipo ${fmtDiaCorto(n.pedido_origen.primer_anticipo)}`}
          </p>
        )}
      </td>
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
  );

  const totalesFooterRows = (data: CorteCajaData) => (
    <>
      <tr className="bg-steel-900">
        <td colSpan={6} className="px-4 py-3 text-right text-sm font-bold text-white">
          TOTAL COBRADO
        </td>
        <td className="px-4 py-3 text-right text-base font-bold text-white">
          {fmt(data.total_cobrado)}
        </td>
      </tr>
      {metodos.map((m) => {
        const res = data.por_metodo[m] ?? { count: 0, total: 0 };
        if (res.total === 0) return null;
        return (
          <tr key={m} className="bg-steel-800/60">
            <td colSpan={6} className="px-4 py-1.5 text-right text-xs font-medium text-steel-300">
              Total en {METODO_LABEL[m]}
            </td>
            <td className="px-4 py-1.5 text-right text-sm font-semibold text-steel-100">
              {fmt(res.total)}
            </td>
          </tr>
        );
      })}
      {data.total_gastos > 0 && (
        <tr className="bg-steel-800">
          <td colSpan={6} className="px-4 py-2.5 text-right text-sm font-bold text-emerald-300">
            TOTAL NETO (tras gastos)
          </td>
          <td className="px-4 py-2.5 text-right text-base font-bold text-emerald-300">
            {fmt(data.total_neto)}
          </td>
        </tr>
      )}
    </>
  );

  const notaTableHead = (
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
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-steel-600" />
        <h1 className="text-2xl font-bold text-steel-900">Corte de Caja</h1>
      </div>

      {pendingSync > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {pendingSync} {pendingSync === 1 ? 'venta pendiente' : 'ventas pendientes'} de sincronizar — este corte
          puede no incluirlas todavía.
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-steel-200 p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-steel-500 uppercase tracking-wide">Desde</label>
          <Input
            type="date"
            value={desde}
            min={minDesde}
            onChange={(e) => {
              const val = e.target.value;
              // El navegador solo bloquea las fechas fuera de rango en el calendario
              // desplegable — si el encargado la teclea a mano, hay que recortarla igual.
              setDesde(minDesde && val < minDesde ? minDesde : val);
            }}
            className="w-40"
          />
          {minDesde && (
            <span className="text-[11px] text-steel-400">Máximo 7 días hábiles atrás</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-steel-500 uppercase tracking-wide">Hasta</label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
        </div>
        <Button onClick={() => load()} disabled={loading} className="gap-2">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Generar corte
        </Button>
        <Button onClick={corteDelDia} disabled={loading} variant="outline" className="gap-2">
          <CalendarCheck className="h-4 w-4" />
          Corte del Día
        </Button>
        {data && (
          <div className="flex items-center gap-3 ml-auto">
            <label className="flex items-center gap-1.5 text-xs font-medium text-steel-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={desgloseMultipago}
                onChange={(e) => setDesgloseMultipago(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-steel-300 text-brand-600 focus:ring-brand-500"
              />
              Desglosar multipagos en el ticket
            </label>
            <Button variant="outline" onClick={print} className="gap-2">
              <Printer className="h-4 w-4" /> Imprimir ticket
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {data && (() => {
        const pagosCredito = data.pagos_credito ?? { total: 0, count: 0, por_metodo: {}, detalle: [] };
        const anticipos = data.anticipos_pedido ?? { total: 0, count: 0, por_metodo: {}, detalle: [] };
        const totalVentas = data.total_ventas ?? data.total_cobrado;
        const totalEntregarEfectivo = data.total_entregar_efectivo ?? (data.por_metodo?.['EFECTIVO']?.total ?? 0);
        return (
        <>
          {/* Total de ventas / cobrado / neto */}
          <div className="bg-steel-900 text-white rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-steel-400 text-sm uppercase tracking-wide">Total de ventas</p>
              <p className="text-3xl font-bold mt-1">{fmt(totalVentas)}</p>
              <p className="text-steel-400 text-xs mt-1">
                {data.notas.length} nota{data.notas.length !== 1 ? 's' : ''} ·{' '}
                {desde === hasta ? desde : `${desde} → ${hasta}`}
              </p>
              {data.total_gastos > 0 && (
                <p className="text-xs mt-2">
                  <span className="text-red-300">− {fmt(data.total_gastos)} gastos</span>
                  {' '}=&nbsp;
                  <span className="text-emerald-300 font-semibold">{fmt(data.total_neto)} neto</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-steel-400 text-xs uppercase tracking-wide">Total a entregar</p>
              <p className="text-2xl font-bold text-emerald-300">{fmt(totalEntregarEfectivo)}</p>
              <p className="text-steel-400 text-xs">en efectivo</p>
            </div>
            <Calculator className="h-10 w-10 text-steel-500 ml-4" />
          </div>

          {/* Por método de pago */}
          <div>
            <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide mb-3">
              Por método de pago <span className="normal-case text-steel-400">(sin incluir pagos de crédito)</span>
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

          {/* Pagos de crédito (abonos de notas abiertas en días anteriores) */}
          {pagosCredito.count > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide mb-3">
                Pagos de crédito
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {metodos.map((m) => {
                  const res = pagosCredito.por_metodo[m] ?? { count: 0, total: 0 };
                  if (res.count === 0) return null;
                  return (
                    <div key={m} className="bg-white rounded-xl border border-steel-200 p-3 space-y-1">
                      <div className="flex items-center gap-1.5">
                        {METODO_ICON[m]}
                        <span className="text-xs font-medium text-steel-600">{METODO_LABEL[m]}</span>
                      </div>
                      <p className="text-lg font-bold text-steel-900">{fmt(res.total)}</p>
                      <p className="text-xs text-steel-400">{res.count} pago{res.count !== 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
              {agruparPorUsuario && (pagosCredito.por_usuario?.length ?? 0) > 0 ? (
                <div className="space-y-4">
                  {pagosCredito.por_usuario!.map((grupo) => (
                    <div key={grupo.usuario_id} className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-steel-100 border-b border-steel-200">
                        <span className="text-sm font-bold text-steel-900">{grupo.nombre}</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-steel-50 border-b border-steel-200">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Folio</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.detalle.map((p, i) => (
                            <tr key={`${p.folio}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-steel-50/40'}>
                              <td className="px-4 py-2.5 font-mono font-semibold text-steel-700">#{String(p.folio).padStart(4, '0')}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{fmt(p.monto)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-steel-900">
                            <td className="px-4 py-3 text-right text-sm font-bold text-white">TOTAL</td>
                            <td className="px-4 py-3 text-right text-base font-bold text-white">{fmt(grupo.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ))}
                  <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <tfoot>
                        <tr className="bg-steel-900">
                          <td className="px-4 py-3 text-right text-sm font-bold text-white">TOTAL PAGOS DE CREDITO</td>
                          <td className="px-4 py-3 text-right text-base font-bold text-white w-40">{fmt(pagosCredito.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-steel-50 border-b border-steel-200">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Folio</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Método</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagosCredito.detalle.map((p, i) => (
                        <tr key={`${p.folio}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-steel-50/40'}>
                          <td className="px-4 py-2.5 font-mono font-semibold text-steel-700">#{String(p.folio).padStart(4, '0')}</td>
                          <td className="px-4 py-2.5 text-steel-500">{METODO_LABEL[p.metodo] ?? p.metodo}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{fmt(p.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-steel-900">
                        <td colSpan={2} className="px-4 py-3 text-right text-sm font-bold text-white">TOTAL PAGOS DE CREDITO</td>
                        <td className="px-4 py-3 text-right text-base font-bold text-white">{fmt(pagosCredito.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Anticipos de pedidos (dinero recibido hoy que no es una nota de venta) */}
          {anticipos.count > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide mb-3">
                Anticipos de pedidos
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {metodos.map((m) => {
                  const res = anticipos.por_metodo[m] ?? { count: 0, total: 0 };
                  if (res.count === 0) return null;
                  return (
                    <div key={m} className="bg-white rounded-xl border border-steel-200 p-3 space-y-1">
                      <div className="flex items-center gap-1.5">
                        {METODO_ICON[m]}
                        <span className="text-xs font-medium text-steel-600">{METODO_LABEL[m]}</span>
                      </div>
                      <p className="text-lg font-bold text-steel-900">{fmt(res.total)}</p>
                      <p className="text-xs text-steel-400">{res.count} anticipo{res.count !== 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
              <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-steel-50 border-b border-steel-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Pedido</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Cliente</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Método</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anticipos.detalle.map((a, i) => (
                      <tr key={`${a.pedido_folio}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-steel-50/40'}>
                        <td className="px-4 py-2.5 font-mono font-semibold text-steel-700">#{String(a.pedido_folio).padStart(4, '0')}</td>
                        <td className="px-4 py-2.5 text-steel-700 max-w-[160px] truncate">{a.cliente}</td>
                        <td className="px-4 py-2.5 text-steel-500">{METODO_LABEL[a.metodo] ?? a.metodo}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{fmt(a.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-steel-900">
                      <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold text-white">TOTAL ANTICIPOS</td>
                      <td className="px-4 py-3 text-right text-base font-bold text-white">{fmt(anticipos.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Gastos del día */}
          {data.gastos.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide mb-3">
                Gastos del período
              </h2>
              <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-steel-50 border-b border-steel-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Concepto</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Categoría</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Método</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Usuario</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.gastos.map((g, i) => (
                      <tr key={g.id} className={i % 2 === 0 ? 'bg-white' : 'bg-steel-50/40'}>
                        <td className="px-4 py-2.5 text-steel-700">{g.concepto}</td>
                        <td className="px-4 py-2.5 text-steel-500">{g.categoria}</td>
                        <td className="px-4 py-2.5 text-steel-500">{METODO_LABEL[g.metodo_pago] ?? g.metodo_pago}</td>
                        <td className="px-4 py-2.5 text-steel-500">{g.usuario}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-red-600">− {fmt(g.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-steel-900">
                      <td colSpan={4} className="px-4 py-3 text-right text-sm font-bold text-white">TOTAL GASTOS</td>
                      <td className="px-4 py-3 text-right text-base font-bold text-white">{fmt(data.total_gastos)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Detalle de notas */}
          <div>
            <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide mb-3">
              Detalle de notas
              {data.notas.some((n) => n.pedido_origen) && (
                <span className="ml-2 normal-case text-steel-400 font-normal">
                  <span className="text-amber-500">*</span> viene de un pedido con anticipo — parte de ese dinero ya se contó en un corte anterior
                </span>
              )}
            </h2>
            {agruparPorUsuario ? (
              <div className="space-y-4">
                {(data.por_usuario ?? []).map((grupo) => (
                  <div key={grupo.usuario_id} className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-steel-100 border-b border-steel-200">
                      <span className="text-sm font-bold text-steel-900">{grupo.nombre}</span>
                    </div>
                    <table className="w-full text-sm">
                      {notaTableHead}
                      <tbody>
                        {grupo.notas.map((n, i) => notaRow(n, i))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-steel-900">
                          <td colSpan={6} className="px-4 py-3 text-right text-sm font-bold text-white">
                            TOTAL EFECTIVO
                          </td>
                          <td className="px-4 py-3 text-right text-base font-bold text-white">
                            {fmt(grupo.total_efectivo)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}
                <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <tfoot>{totalesFooterRows(data)}</tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
                <table className="w-full text-sm">
                  {notaTableHead}
                  <tbody>
                    {data.notas.map((n, i) => notaRow(n, i))}
                    {data.notas.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-steel-400">
                          Sin notas en el rango seleccionado
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {data.notas.length > 0 && (
                    <tfoot>{totalesFooterRows(data)}</tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </>
        );
      })()}

      {!data && !loading && (
        <div className="bg-white rounded-xl border border-steel-200 py-16 text-center text-steel-400">
          <Calculator className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona un rango de fechas y presiona <strong>Generar corte</strong></p>
        </div>
      )}
    </div>
  );
}
