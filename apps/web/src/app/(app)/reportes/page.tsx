'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3, ShoppingCart, Package, Users, Truck, Factory, UserCog,
  Download, RefreshCw, TrendingUp, AlertTriangle, Printer, Landmark,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  ReporteVentasData, ReporteInventarioData, ReporteCreditoData,
  ReporteComprasData, ReporteProduccionData, ReporteAsistenciaData,
  EstatusNota, EstatusOrdenCompra, EstatusProduccion, EstatusAsistencia,
} from '@/lib/types/api';

// ── Formateadores ─────────────────────────────────────────────

const fmt = (n: number) =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 3 });
const fmtDia = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// ── Badge configs ─────────────────────────────────────────────

const NOTA_CFG: Record<string, { label: string; variant: 'paid' | 'credit' | 'pending' | 'cancelled' | 'incomplete' | 'default' }> = {
  PAGADA:    { label: 'Pagada',    variant: 'paid'      },
  CREDITO:   { label: 'Crédito',   variant: 'credit'    },
  ABIERTA:   { label: 'Abierta',   variant: 'pending'   },
  PENDIENTE: { label: 'Pendiente', variant: 'incomplete'},
  CANCELADA: { label: 'Cancelada', variant: 'cancelled' },
};

const OC_CFG: Record<string, { label: string; variant: 'paid' | 'credit' | 'pending' | 'cancelled' | 'incomplete' | 'default' }> = {
  BORRADOR:         { label: 'Borrador', variant: 'incomplete'},
  APROBADA:         { label: 'Aprobada', variant: 'pending'   },
  RECIBIDA_PARCIAL: { label: 'Parcial',  variant: 'credit'    },
  RECIBIDA:         { label: 'Recibida', variant: 'paid'      },
  CANCELADA:        { label: 'Cancelada',variant: 'cancelled' },
};

const OP_CFG: Record<string, { label: string; variant: 'paid' | 'credit' | 'pending' | 'cancelled' | 'incomplete' | 'default' }> = {
  ABIERTA:    { label: 'Abierta',    variant: 'pending'   },
  EN_PROCESO: { label: 'En proceso', variant: 'credit'    },
  COMPLETADA: { label: 'Completada', variant: 'paid'      },
  CANCELADA:  { label: 'Cancelada',  variant: 'cancelled' },
};

const AS_CFG: Record<string, { label: string; variant: 'paid' | 'credit' | 'pending' | 'cancelled' | 'incomplete' | 'default' }> = {
  PRESENTE:   { label: 'Presente',  variant: 'paid'       },
  AUSENTE:    { label: 'Ausente',   variant: 'cancelled'  },
  TARDANZA:   { label: 'Tardanza',  variant: 'credit'     },
  PERMISO:    { label: 'Permiso',   variant: 'pending'    },
  VACACIONES: { label: 'Vacaciones',variant: 'incomplete' },
};

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
};

const MOV_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada', SALIDA: 'Salida',
  TRANSFERENCIA_OUT: 'Transf. Salida', TRANSFERENCIA_IN: 'Transf. Entrada',
  AJUSTE_POSITIVO: 'Ajuste +', AJUSTE_NEGATIVO: 'Ajuste -',
};

// ── CSV export ────────────────────────────────────────────────

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers de UI ─────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-body font-semibold text-steel-700 mb-3">{children}</h3>;
}

function StatMini({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  if (accent) {
    return (
      <div className="bg-brand-600 rounded-xl p-4">
        <p className="text-eyebrow text-brand-200 uppercase tracking-wide">{label}</p>
        <p className="text-display-md font-bold text-white mt-1 tabular-nums">{value}</p>
        {sub && <p className="text-body-sm text-brand-200 mt-0.5">{sub}</p>}
      </div>
    );
  }
  return (
    <div className="bg-white border border-steel-200 rounded-xl p-4">
      <p className="text-eyebrow text-steel-500 uppercase tracking-wide">{label}</p>
      <p className="text-display-md font-bold text-steel-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-body-sm text-steel-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function DateRangeBar({
  desde, hasta, onDesde, onHasta, onLoad, loading,
}: {
  desde: string; hasta: string;
  onDesde: (v: string) => void; onHasta: (v: string) => void;
  onLoad: () => void; loading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      <div>
        <label className="block text-meta text-steel-500 mb-1">Desde</label>
        <input
          type="date"
          value={desde}
          onChange={(e) => onDesde(e.target.value)}
          className="border border-steel-200 rounded-lg px-3 py-2 text-body-sm text-steel-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-meta text-steel-500 mb-1">Hasta</label>
        <input
          type="date"
          value={hasta}
          onChange={(e) => onHasta(e.target.value)}
          className="border border-steel-200 rounded-lg px-3 py-2 text-body-sm text-steel-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <Button size="sm" onClick={onLoad} disabled={loading}>
        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
        Aplicar
      </Button>
    </div>
  );
}

// ── Tab helpers ───────────────────────────────────────────────

const TABS = [
  { id: 'ventas',      label: 'Ventas',       icon: <ShoppingCart className="h-4 w-4" /> },
  { id: 'inventario',  label: 'Inventario',   icon: <Package className="h-4 w-4" /> },
  { id: 'credito',     label: 'Crédito',      icon: <Users className="h-4 w-4" /> },
  { id: 'compras',     label: 'Compras',      icon: <Truck className="h-4 w-4" /> },
  { id: 'produccion',  label: 'Producción',   icon: <Factory className="h-4 w-4" /> },
  { id: 'asistencia',  label: 'RH',           icon: <UserCog className="h-4 w-4" /> },
  { id: 'corte_caja',  label: 'Corte de Caja',icon: <Landmark className="h-4 w-4" /> },
] as const;
type TabId = typeof TABS[number]['id'];

function iniMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function hoy() {
  return new Date().toISOString().slice(0, 10);
}

// ── Tabs ──────────────────────────────────────────────────────

function TabVentas({ desde, hasta }: { desde: string; hasta: string }) {
  const [data, setData] = useState<ReporteVentasData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<ReporteVentasData>(
        `/reportes/ventas?desde=${desde}&hasta=${hasta}`,
      );
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { void load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    exportCSV('ventas_diarias', ['Día', 'Notas', 'Total'],
      data.ventas_diarias.map((v) => [fmtDia(v.dia), v.count, v.total]));
  };

  if (loading) return <div className="p-8 text-center text-steel-400">Cargando…</div>;
  if (!data) return <div className="p-8 text-center text-steel-400">Sin datos</div>;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatMini label="Total ventas" value={fmt(data.resumen.total)} sub={`${data.resumen.count} notas`} />
        <StatMini label="Subtotal" value={fmt(data.resumen.subtotal)} />
        <StatMini label="Descuentos" value={fmt(data.resumen.descuento)} />
        <StatMini label="Notas cerradas" value={String(data.resumen.count)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Por estatus */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100">
            <SectionTitle>Por estatus</SectionTitle>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-steel-100">
                <th className="px-4 py-2 text-left font-medium text-steel-500">Estatus</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">Notas</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {data.por_estatus.map((e) => (
                <tr key={e.estatus} className="hover:bg-steel-50">
                  <td className="px-4 py-2">
                    <Badge variant={NOTA_CFG[e.estatus]?.variant ?? 'default'}>
                      {NOTA_CFG[e.estatus]?.label ?? e.estatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{e.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(e.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Por método de pago */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100">
            <SectionTitle>Por método de pago</SectionTitle>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-steel-100">
                <th className="px-4 py-2 text-left font-medium text-steel-500">Método</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">Pagos</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {data.por_metodo_pago.map((m) => (
                <tr key={m.metodo} className="hover:bg-steel-50">
                  <td className="px-4 py-2 text-steel-700">{METODO_LABEL[m.metodo] ?? m.metodo}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{m.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top clientes */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100">
            <SectionTitle>Top clientes</SectionTitle>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-steel-100">
                <th className="px-4 py-2 text-left font-medium text-steel-500">Cliente</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {data.top_clientes.slice(0, 8).map((c) => (
                <tr key={c.cliente_id ?? 'pub'} className="hover:bg-steel-50">
                  <td className="px-4 py-2 truncate max-w-[160px] text-steel-700">
                    {c.cliente
                      ? c.cliente.razon_social ?? `${c.cliente.nombre} ${c.cliente.apellidos ?? ''}`.trim()
                      : 'Público general'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ventas diarias */}
      <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
          <SectionTitle>Ventas por día</SectionTitle>
          <Button size="sm" variant="ghost" onClick={doExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV
          </Button>
        </div>
        {data.ventas_diarias.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-steel-400">Sin ventas en el período</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Fecha</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Notas</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {data.ventas_diarias.map((v) => (
                  <tr key={v.dia} className="hover:bg-steel-50">
                    <td className="px-4 py-2 text-steel-600 tabular-nums">{fmtDia(v.dia)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{v.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TabInventario() {
  const [data, setData] = useState<ReporteInventarioData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<ReporteInventarioData>('/reportes/inventario');
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    exportCSV('bajo_stock',
      ['Clave', 'Nombre', 'Unidad', 'Exist.1', 'Exist.2', 'Exist.3'],
      data.bajo_stock.map((a) => [
        a.clave, a.descripcion_1 ?? '', '',
        a.existencia_1 ?? 0, a.existencia_2 ?? 0, a.existencia_3 ?? 0,
      ]),
    );
  };

  if (loading) return <div className="p-8 text-center text-steel-400">Cargando…</div>;
  if (!data) return <div className="p-8 text-center text-steel-400">Sin datos</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatMini label="Artículos activos" value={String(data.articulos_total)} />
        <StatMini label="Bajo stock" value={String(data.bajo_stock.length)} sub="≤ 10 unidades" />
        {data.movimientos_por_tipo.slice(0, 2).map((m) => (
          <StatMini key={m.tipo} label={MOV_LABEL[m.tipo] ?? m.tipo} value={String(m.count)} sub={`${fmtNum(m.cantidad)} u.`} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bajo stock */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <SectionTitle>Bajo stock (≤ 10)</SectionTitle>
            </div>
            <Button size="sm" variant="ghost" onClick={doExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" />CSV
            </Button>
          </div>
          {data.bajo_stock.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-steel-400">Todo en stock</div>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Artículo</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">E1</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">E2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {data.bajo_stock.map((a) => (
                  <tr key={a.id} className="hover:bg-steel-50">
                    <td className="px-4 py-2">
                      <p className="text-steel-900 truncate max-w-[180px]">{a.descripcion_1 ?? a.clave}</p>
                      <p className="text-meta text-steel-400">{a.clave}</p>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-600 font-medium">
                      {fmtNum(a.existencia_1 ?? 0)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-steel-600">
                      {fmtNum(a.existencia_2 ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top más movidos */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-600" />
            <SectionTitle>Más movidos este mes</SectionTitle>
          </div>
          {data.top_movidos.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-steel-400">Sin movimientos</div>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Artículo</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Movs.</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Cant.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {data.top_movidos.map((m) => (
                  <tr key={m.articulo_id} className="hover:bg-steel-50">
                    <td className="px-4 py-2 truncate max-w-[180px] text-steel-700">
                      {m.articulo?.descripcion_1 ?? m.articulo_id}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.movimientos}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNum(m.cantidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Movimientos por tipo */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden md:col-span-2">
          <div className="px-4 py-3 border-b border-steel-100">
            <SectionTitle>Movimientos por tipo (mes actual)</SectionTitle>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-steel-100">
                <th className="px-4 py-2 text-left font-medium text-steel-500">Tipo</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">Movimientos</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">Cantidad total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {data.movimientos_por_tipo.map((m) => (
                <tr key={m.tipo} className="hover:bg-steel-50">
                  <td className="px-4 py-2 text-steel-700">{MOV_LABEL[m.tipo] ?? m.tipo}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{m.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNum(m.cantidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TabCredito() {
  const [data, setData] = useState<ReporteCreditoData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<ReporteCreditoData>('/reportes/credito');
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    exportCSV('cartera_credito',
      ['Nombre', 'Razón social', 'Saldo pendiente', 'Límite crédito', 'Días crédito'],
      data.top_deudores.map((c) => [
        `${c.nombre} ${c.apellidos ?? ''}`.trim(),
        c.razon_social ?? '',
        c.saldo_pendiente,
        c.limite_credito,
        '',
      ]),
    );
  };

  if (loading) return <div className="p-8 text-center text-steel-400">Cargando…</div>;
  if (!data) return <div className="p-8 text-center text-steel-400">Sin datos</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatMini label="Cartera total" value={fmt(data.cartera_total)} accent />
        <StatMini label="Clientes con saldo" value={String(data.clientes_con_saldo)} />
        <StatMini label="Cuentas vencidas" value={String(data.cuentas_vencidas.length)} sub="Superaron fecha límite" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top deudores */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
            <SectionTitle>Top deudores</SectionTitle>
            <Button size="sm" variant="ghost" onClick={doExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" />CSV
            </Button>
          </div>
          {data.top_deudores.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-steel-400">Sin cartera</div>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Cliente</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {data.top_deudores.map((c) => (
                  <tr key={c.id} className="hover:bg-steel-50">
                    <td className="px-4 py-2">
                      <p className="text-steel-900 truncate max-w-[200px]">
                        {c.razon_social ?? `${c.nombre} ${c.apellidos ?? ''}`.trim()}
                      </p>
                      <p className="text-meta text-steel-400">límite {fmt(c.limite_credito)}</p>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-red-600">
                      {fmt(c.saldo_pendiente)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Cuentas vencidas */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <SectionTitle>Cuentas vencidas</SectionTitle>
          </div>
          {data.cuentas_vencidas.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-steel-400">Sin cuentas vencidas</div>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Cliente</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Nota</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {data.cuentas_vencidas.map((n) => (
                  <tr key={n.id} className="hover:bg-steel-50">
                    <td className="px-4 py-2 truncate max-w-[150px] text-steel-700">
                      {n.cliente
                        ? n.cliente.razon_social ?? `${n.cliente.nombre} ${n.cliente.apellidos ?? ''}`.trim()
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-steel-600">
                      NV-{String(n.folio).padStart(5, '0')}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-red-600">
                      {fmt(n.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function TabCompras({ desde, hasta }: { desde: string; hasta: string }) {
  const [data, setData] = useState<ReporteComprasData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<ReporteComprasData>(`/reportes/compras?desde=${desde}&hasta=${hasta}`);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { void load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    exportCSV('cuentas_por_pagar',
      ['Proveedor', 'Razón social', 'Saldo pendiente'],
      data.cuentas_por_pagar.proveedores.map((p) => [p.nombre, p.razon_social ?? '', p.saldo_pendiente]),
    );
  };

  if (loading) return <div className="p-8 text-center text-steel-400">Cargando…</div>;
  if (!data) return <div className="p-8 text-center text-steel-400">Sin datos</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatMini label="Total compras" value={fmt(data.resumen.total)} sub={`${data.resumen.ordenes} OC`} />
        <StatMini label="Cuentas por pagar" value={fmt(data.cuentas_por_pagar.total)} sub="Saldo con proveedores" />
        <StatMini label="Proveedores activos" value={String(data.cuentas_por_pagar.proveedores.length)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Por estatus */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100"><SectionTitle>Por estatus</SectionTitle></div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-steel-100">
                <th className="px-4 py-2 text-left font-medium text-steel-500">Estatus</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">OCs</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {data.por_estatus.map((e) => (
                <tr key={e.estatus} className="hover:bg-steel-50">
                  <td className="px-4 py-2">
                    <Badge variant={OC_CFG[e.estatus]?.variant ?? 'default'}>
                      {OC_CFG[e.estatus]?.label ?? e.estatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{e.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(e.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top proveedores */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100"><SectionTitle>Top proveedores</SectionTitle></div>
          {data.top_proveedores.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-steel-400">Sin órdenes</div>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Proveedor</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {data.top_proveedores.map((p) => (
                  <tr key={p.proveedor_id} className="hover:bg-steel-50">
                    <td className="px-4 py-2 truncate max-w-[160px] text-steel-700">
                      {p.proveedor?.nombre ?? p.proveedor_id}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* CxP */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
            <SectionTitle>Cuentas por pagar</SectionTitle>
            <Button size="sm" variant="ghost" onClick={doExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" />CSV
            </Button>
          </div>
          {data.cuentas_por_pagar.proveedores.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-steel-400">Sin saldo pendiente</div>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Proveedor</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {data.cuentas_por_pagar.proveedores.map((p) => (
                  <tr key={p.id} className="hover:bg-steel-50">
                    <td className="px-4 py-2 truncate max-w-[160px] text-steel-700">{p.nombre}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-red-600">
                      {fmt(p.saldo_pendiente)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function TabProduccion({ desde, hasta }: { desde: string; hasta: string }) {
  const [data, setData] = useState<ReporteProduccionData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<ReporteProduccionData>(`/reportes/produccion?desde=${desde}&hasta=${hasta}`);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { void load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    exportCSV('produccion_por_estatus',
      ['Estatus', 'OPs', 'Objetivo', 'Producido'],
      data.por_estatus.map((e) => [e.estatus, e.ops, e.objetivo, e.producida]),
    );
  };

  if (loading) return <div className="p-8 text-center text-steel-400">Cargando…</div>;
  if (!data) return <div className="p-8 text-center text-steel-400">Sin datos</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatMini label="OPs totales" value={String(data.total_ops)} />
        <StatMini label="Cantidad objetivo" value={fmtNum(data.cantidad_objetivo)} />
        <StatMini label="Cantidad producida" value={fmtNum(data.cantidad_producida)} />
        <StatMini label="Eficiencia" value={`${data.eficiencia}%`} sub="producido / objetivo" />
      </div>

      {/* Barra de eficiencia */}
      {data.cantidad_objetivo > 0 && (
        <div className="bg-white border border-steel-200 rounded-xl p-4">
          <div className="flex justify-between text-body-sm text-steel-600 mb-2">
            <span>Eficiencia de producción</span>
            <span className="font-medium tabular-nums">{data.eficiencia}%</span>
          </div>
          <div className="h-3 bg-steel-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${data.eficiencia >= 100 ? 'bg-green-500' : 'bg-brand-500'}`}
              style={{ width: `${Math.min(data.eficiencia, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-meta text-steel-400 mt-1">
            <span>0</span>
            <span>{fmtNum(data.cantidad_objetivo)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Por estatus */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
            <SectionTitle>Por estatus</SectionTitle>
            <Button size="sm" variant="ghost" onClick={doExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" />CSV
            </Button>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-steel-100">
                <th className="px-4 py-2 text-left font-medium text-steel-500">Estatus</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">OPs</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">Producido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {data.por_estatus.map((e) => (
                <tr key={e.estatus} className="hover:bg-steel-50">
                  <td className="px-4 py-2">
                    <Badge variant={OP_CFG[e.estatus]?.variant ?? 'default'}>
                      {OP_CFG[e.estatus]?.label ?? e.estatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{e.ops}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNum(e.producida)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top artículos */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100"><SectionTitle>Top artículos producidos</SectionTitle></div>
          {data.top_articulos.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-steel-400">Sin producción</div>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Artículo</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">OPs</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Producido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {data.top_articulos.map((a) => (
                  <tr key={a.articulo_id} className="hover:bg-steel-50">
                    <td className="px-4 py-2 truncate max-w-[180px] text-steel-700">
                      {a.articulo?.descripcion_1 ?? a.articulo_id}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{a.ops}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtNum(a.producida)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function TabAsistencia({ desde, hasta }: { desde: string; hasta: string }) {
  const [data, setData] = useState<ReporteAsistenciaData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<ReporteAsistenciaData>(`/reportes/asistencia?desde=${desde}&hasta=${hasta}`);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { void load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    exportCSV('ausencias',
      ['Empleado', 'Apellidos', 'Puesto', 'Ausencias'],
      data.top_ausencias.map((a) => [
        a.empleado?.nombre ?? '', a.empleado?.apellidos ?? '',
        a.empleado?.puesto ?? '', a.ausencias,
      ]),
    );
  };

  if (loading) return <div className="p-8 text-center text-steel-400">Cargando…</div>;
  if (!data) return <div className="p-8 text-center text-steel-400">Sin datos</div>;

  const presente = data.por_estatus.find((e) => e.estatus === 'PRESENTE')?.count ?? 0;
  const ausente = data.por_estatus.find((e) => e.estatus === 'AUSENTE')?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatMini label="Empleados activos" value={String(data.empleados_activos)} />
        <StatMini label="Total registros" value={String(data.total_registros)} />
        <StatMini label="Presentes" value={String(presente)} />
        <StatMini label="Ausentes" value={String(ausente)} sub="En el período" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Por estatus */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100"><SectionTitle>Por estatus</SectionTitle></div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-steel-100">
                <th className="px-4 py-2 text-left font-medium text-steel-500">Estatus</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">Registros</th>
                <th className="px-4 py-2 text-right font-medium text-steel-500">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {data.por_estatus.map((e) => (
                <tr key={e.estatus} className="hover:bg-steel-50">
                  <td className="px-4 py-2">
                    <Badge variant={AS_CFG[e.estatus]?.variant ?? 'default'}>
                      {AS_CFG[e.estatus]?.label ?? e.estatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{e.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-steel-500">
                    {data.total_registros > 0
                      ? `${Math.round((e.count / data.total_registros) * 100)}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top ausencias */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <SectionTitle>Empleados con más ausencias</SectionTitle>
            </div>
            <Button size="sm" variant="ghost" onClick={doExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" />CSV
            </Button>
          </div>
          {data.top_ausencias.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-steel-400">Sin ausencias</div>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Empleado</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Ausencias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {data.top_ausencias.map((a) => (
                  <tr key={a.empleado_id} className="hover:bg-steel-50">
                    <td className="px-4 py-2">
                      <p className="text-steel-900">
                        {a.empleado
                          ? `${a.empleado.apellidos}, ${a.empleado.nombre}`
                          : a.empleado_id}
                      </p>
                      <p className="text-meta text-steel-400">{a.empleado?.puesto ?? ''}</p>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-amber-600">
                      {a.ausencias}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Corte de Caja ─────────────────────────────────────────────

interface CorteCajaData {
  desde: string;
  hasta: string;
  total_cobrado: number;
  total_abonos: number;
  notas_count: number;
  abonos_count: number;
  por_metodo: Record<string, { count: number; total: number }>;
  por_estatus: Record<string, { count: number; total: number }>;
  notas: {
    id: string;
    folio: string | null;
    estatus: string;
    total: number;
    created_at: string;
    cliente?: { nombre: string; apellidos: string; razon_social: string | null } | null;
    pagos: { metodo: string; monto: number }[];
  }[];
}

function TabCorteCaja({ desde, hasta }: { desde: string; hasta: string }) {
  const [data, setData] = useState<CorteCajaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<CorteCajaData>(`/reportes/corte-caja?desde=${desde}&hasta=${hasta}`);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { void load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    exportCSV('corte_caja',
      ['Folio', 'Estatus', 'Cliente', 'Total', 'Métodos', 'Fecha'],
      data.notas.map((n) => [
        n.folio ?? n.id.slice(-6),
        n.estatus,
        n.cliente
          ? n.cliente.razon_social ?? `${n.cliente.nombre} ${n.cliente.apellidos}`
          : 'Público general',
        n.total,
        n.pagos.map((p) => `${METODO_LABEL[p.metodo] ?? p.metodo} $${p.monto}`).join(' | '),
        fmtDia(n.created_at.slice(0, 10)),
      ]),
    );
  };

  const printCorte = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      const cfg = typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('print_bridge_config') ?? '{}')
        : {};
      const lines: string[] = [
        '='.repeat(32),
        '     CORTE DE CAJA',
        `Desde: ${fmtDia(data.desde)}  Hasta: ${fmtDia(data.hasta)}`,
        '='.repeat(32),
        ...Object.entries(data.por_metodo).map(
          ([m, v]) => `${(METODO_LABEL[m] ?? m).padEnd(14)} ${fmt(v.total).padStart(12)} (${v.count})`,
        ),
        '-'.repeat(32),
        `TOTAL COBRADO   ${fmt(data.total_cobrado).padStart(12)}`,
        `Abonos cta.     ${fmt(data.total_abonos).padStart(12)}`,
        `Notas           ${String(data.notas_count).padStart(12)}`,
        '='.repeat(32),
      ];
      await fetch('http://localhost:7788/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'texto', texto: lines.join('\n'), copias: cfg.copias ?? 1 }),
        signal: AbortSignal.timeout(6000),
      });
    } catch { /* ticketera puede no estar disponible */ }
    finally { setPrinting(false); }
  };

  if (loading) return <div className="p-8 text-center text-steel-400">Cargando…</div>;
  if (!data)   return <div className="p-8 text-center text-steel-400">Sin datos</div>;

  const metodos = Object.entries(data.por_metodo).filter(([, v]) => v.count > 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatMini label="Total cobrado" value={fmt(data.total_cobrado)} accent />
        <StatMini label="Abonos a crédito" value={fmt(data.total_abonos)} sub={`${data.abonos_count} movimientos`} />
        <StatMini label="Notas cerradas" value={String(data.notas_count)} />
        <StatMini label="Promedio por nota"
          value={data.notas_count > 0 ? fmt(data.total_cobrado / data.notas_count) : '$0.00'} />
      </div>

      {/* Por método + acciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
            <SectionTitle>Por método de pago</SectionTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => void printCorte()} disabled={printing}>
                <Printer className={`h-3.5 w-3.5 mr-1.5 ${printing ? 'animate-pulse' : ''}`} />
                {printing ? 'Imprimiendo…' : 'Imprimir corte'}
              </Button>
              <Button size="sm" variant="ghost" onClick={doExport}>
                <Download className="h-3.5 w-3.5 mr-1.5" />CSV
              </Button>
            </div>
          </div>
          {metodos.length === 0 ? (
            <div className="p-8 text-center text-body-sm text-steel-400">Sin pagos en el período</div>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Método</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Notas</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {metodos.map(([m, v]) => (
                  <tr key={m} className="hover:bg-steel-50">
                    <td className="px-4 py-2 text-steel-700">{METODO_LABEL[m] ?? m}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-steel-500">{v.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-steel-900">{fmt(v.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-steel-200 bg-steel-50">
                  <td className="px-4 py-2 font-semibold text-steel-900">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-steel-900">{data.notas_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-steel-900">{fmt(data.total_cobrado)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Por estatus */}
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-100"><SectionTitle>Por estatus</SectionTitle></div>
          {Object.keys(data.por_estatus).length === 0 ? (
            <div className="p-8 text-center text-body-sm text-steel-400">Sin datos</div>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Estatus</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Notas</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {Object.entries(data.por_estatus).map(([e, v]) => (
                  <tr key={e} className="hover:bg-steel-50">
                    <td className="px-4 py-2">
                      <Badge variant={NOTA_CFG[e]?.variant ?? 'default'}>
                        {NOTA_CFG[e]?.label ?? e}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-steel-500">{v.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-steel-900">{fmt(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detalle notas */}
      <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-steel-100">
          <SectionTitle>Detalle de notas ({data.notas_count})</SectionTitle>
        </div>
        {data.notas.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-steel-400">Sin notas en el período</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100 bg-steel-50">
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Folio</th>
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Cliente</th>
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Estatus</th>
                  <th className="px-4 py-2 text-left font-medium text-steel-500">Métodos</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
                  <th className="px-4 py-2 text-right font-medium text-steel-500">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {data.notas.map((n) => (
                  <tr key={n.id} className="hover:bg-steel-50">
                    <td className="px-4 py-2 font-mono text-meta text-steel-500">
                      {n.folio ?? n.id.slice(-8)}
                    </td>
                    <td className="px-4 py-2 text-steel-700 truncate max-w-[160px]">
                      {n.cliente
                        ? n.cliente.razon_social ?? `${n.cliente.nombre} ${n.cliente.apellidos}`
                        : <span className="text-steel-400">Público general</span>}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={NOTA_CFG[n.estatus]?.variant ?? 'default'}>
                        {NOTA_CFG[n.estatus]?.label ?? n.estatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-meta text-steel-500">
                      {n.pagos.map((p) => `${METODO_LABEL[p.metodo] ?? p.metodo}`).join(', ')}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-steel-900">
                      {fmt(n.total)}
                    </td>
                    <td className="px-4 py-2 text-right text-meta text-steel-400 tabular-nums whitespace-nowrap">
                      {fmtDia(n.created_at.slice(0, 10))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-steel-200 bg-steel-50">
                  <td colSpan={4} className="px-4 py-2 font-semibold text-steel-900">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-brand-700">
                    {fmt(data.total_cobrado)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────

export default function ReportesPage() {
  const [tab, setTab] = useState<TabId>('ventas');
  const [desde, setDesde] = useState(iniMes);
  const [hasta, setHasta] = useState(hoy);
  const [applied, setApplied] = useState({ desde: iniMes(), hasta: hoy() });

  const needsRange = tab === 'ventas' || tab === 'compras' || tab === 'produccion' || tab === 'asistencia' || tab === 'corte_caja';

  const handleApply = () => setApplied({ desde, hasta });

  return (
    <div>
      {/* Page header */}
      <div className="px-6 py-4 border-b border-steel-200 bg-white flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-brand-600" />
        <div>
          <h1 className="text-display-sm font-bold text-steel-900">Reportes</h1>
          <p className="text-body-sm text-steel-500 mt-0.5">Análisis y métricas operacionales</p>
        </div>
      </div>

      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-body-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Date range filter — only for ranged tabs */}
        {needsRange && (
          <DateRangeBar
            desde={desde}
            hasta={hasta}
            onDesde={setDesde}
            onHasta={setHasta}
            onLoad={handleApply}
            loading={false}
          />
        )}

        {/* Tab content */}
        {tab === 'ventas'      && <TabVentas     desde={applied.desde} hasta={applied.hasta} />}
        {tab === 'inventario'  && <TabInventario />}
        {tab === 'credito'     && <TabCredito />}
        {tab === 'compras'     && <TabCompras    desde={applied.desde} hasta={applied.hasta} />}
        {tab === 'produccion'  && <TabProduccion desde={applied.desde} hasta={applied.hasta} />}
        {tab === 'asistencia'  && <TabAsistencia desde={applied.desde} hasta={applied.hasta} />}
        {tab === 'corte_caja'  && <TabCorteCaja  desde={applied.desde} hasta={applied.hasta} />}
      </div>
    </div>
  );
}
