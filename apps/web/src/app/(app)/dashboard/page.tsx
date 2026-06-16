'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, FileText, Users, Factory, Truck, CreditCard, RefreshCw, Building2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { StatCard } from '@/components/ui/stat-card';
import { useAuthStore } from '@/lib/store/auth.store';
import type { DashboardData } from '@/lib/types/api';

interface EmpresaKpi {
  empresa_id: string;
  empresa_nombre: string;
  ventas_hoy: { total: number; count: number };
  ventas_mes: { total: number; count: number };
  clientes_con_saldo: number;
}

interface DashboardGlobal {
  total_hoy: number;
  total_mes: number;
  empresas: EmpresaKpi[];
}

const fmt = (n: number) =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDia = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export default function DashboardPage() {
  const { usuario } = useAuthStore();
  const isSuperUsuario = usuario?.rol === 'SUPER_USUARIO';

  const [data, setData]           = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [global, setGlobal]       = useState<DashboardGlobal | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<DashboardData>('/reportes/dashboard');
      setData(d);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  const loadGlobal = useCallback(async () => {
    if (!isSuperUsuario) return;
    setGlobalLoading(true);
    try {
      const d = await api.get<DashboardGlobal>('/reportes/dashboard-global');
      setGlobal(d);
    } catch { /* noop */ }
    finally { setGlobalLoading(false); }
  }, [isSuperUsuario]);

  useEffect(() => { void load(); void loadGlobal(); }, [load, loadGlobal]);

  const d = data;
  const ventasHoy = d?.ventas_hoy.total ?? 0;
  const ventasMes = d?.ventas_mes.total ?? 0;
  const countHoy = d?.ventas_hoy.count ?? 0;
  const countMes = d?.ventas_mes.count ?? 0;

  return (
    <div>
      {/* Page header */}
      <div className="px-6 py-4 border-b border-steel-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-display-sm font-bold text-steel-900">Dashboard</h1>
          <p className="text-body-sm text-steel-500 mt-0.5">Vista general del día</p>
        </div>
        <button
          onClick={() => { void load(); void loadGlobal(); }}
          className="flex items-center gap-1.5 text-body-sm text-steel-500 hover:text-steel-900 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* KPI cards — primera fila */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Ventas hoy"
            value={loading ? '—' : fmt(ventasHoy)}
            description={loading ? '' : `${countHoy} nota${countHoy !== 1 ? 's' : ''} cerrada${countHoy !== 1 ? 's' : ''}`}
            accent
          />
          <StatCard
            label="Ventas este mes"
            value={loading ? '—' : fmt(ventasMes)}
            description={loading ? '' : `${countMes} nota${countMes !== 1 ? 's' : ''}`}
          />
          <StatCard
            label="Notas pendientes"
            value={loading ? '—' : String(d?.notas_pendientes ?? 0)}
            description="Sin cerrar"
          />
          <StatCard
            label="Entradas hoy"
            value={loading ? '—' : String(d?.entradas_hoy ?? 0)}
            description="Movimientos de inventario"
          />
        </div>

        {/* KPI cards — segunda fila */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-white border border-steel-200 rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-eyebrow text-steel-500 uppercase tracking-wide">Clientes con saldo</p>
              <p className="text-display-md font-bold text-steel-900 tabular-nums">
                {loading ? '—' : d?.clientes_con_saldo ?? 0}
              </p>
              <p className="text-body-sm text-steel-500">Cuentas abiertas</p>
            </div>
          </div>

          <div className="bg-white border border-steel-200 rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Factory className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-eyebrow text-steel-500 uppercase tracking-wide">OPs activas</p>
              <p className="text-display-md font-bold text-steel-900 tabular-nums">
                {loading ? '—' : d?.ops_activas ?? 0}
              </p>
              <p className="text-body-sm text-steel-500">Abiertas + en proceso</p>
            </div>
          </div>

          <div className="bg-white border border-steel-200 rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
              <CreditCard className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-eyebrow text-steel-500 uppercase tracking-wide">Prov. con saldo</p>
              <p className="text-display-md font-bold text-steel-900 tabular-nums">
                {loading ? '—' : d?.proveedores_con_saldo ?? 0}
              </p>
              <p className="text-body-sm text-steel-500">Cuentas por pagar</p>
            </div>
          </div>
        </div>

        {/* Tablas inferiores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top artículos del mes */}
          <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-steel-100 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand-600" />
              <h3 className="text-body font-semibold text-steel-900">Top artículos del mes</h3>
            </div>
            {loading ? (
              <div className="p-8 text-center text-body-sm text-steel-400">Cargando…</div>
            ) : !d?.top_articulos_mes.length ? (
              <div className="p-8 text-center text-body-sm text-steel-400">
                Sin ventas este mes
              </div>
            ) : (
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-steel-100">
                    <th className="px-4 py-2 text-left font-medium text-steel-500">Artículo</th>
                    <th className="px-4 py-2 text-right font-medium text-steel-500">Cant.</th>
                    <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-50">
                  {d.top_articulos_mes.map((a) => (
                    <tr key={a.articulo_id} className="hover:bg-steel-50 transition-colors">
                      <td className="px-4 py-2 text-steel-900 truncate max-w-[160px]">{a.clave}</td>
                      <td className="px-4 py-2 text-right text-steel-600 tabular-nums">
                        {a.cantidad.toLocaleString('es-MX')}
                      </td>
                      <td className="px-4 py-2 text-right text-steel-900 font-medium tabular-nums">
                        {fmt(a.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Ventas últimos 7 días */}
          <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-steel-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand-600" />
              <h3 className="text-body font-semibold text-steel-900">Ventas · últimos 7 días</h3>
            </div>
            {loading ? (
              <div className="p-8 text-center text-body-sm text-steel-400">Cargando…</div>
            ) : !d?.ventas_diarias.length ? (
              <div className="p-8 text-center text-body-sm text-steel-400">
                Sin ventas en los últimos 7 días
              </div>
            ) : (
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-steel-100">
                    <th className="px-4 py-2 text-left font-medium text-steel-500">Día</th>
                    <th className="px-4 py-2 text-right font-medium text-steel-500">Notas</th>
                    <th className="px-4 py-2 text-right font-medium text-steel-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-50">
                  {d.ventas_diarias.map((v) => (
                    <tr key={v.dia} className="hover:bg-steel-50 transition-colors">
                      <td className="px-4 py-2 text-steel-600 tabular-nums">{fmtDia(v.dia)}</td>
                      <td className="px-4 py-2 text-right text-steel-600 tabular-nums">{v.count}</td>
                      <td className="px-4 py-2 text-right text-steel-900 font-medium tabular-nums">
                        {fmt(v.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Dashboard global — solo SUPER_USUARIO */}
        {isSuperUsuario && (
          <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-brand-600" />
                <h3 className="text-body font-semibold text-steel-900">Vista consolidada — todas las empresas</h3>
              </div>
              {global && (
                <div className="flex items-center gap-4 text-body-sm">
                  <span className="text-steel-500">Hoy total: <span className="font-semibold text-steel-900">{fmt(global.total_hoy)}</span></span>
                  <span className="text-steel-500">Mes total: <span className="font-semibold text-brand-600">{fmt(global.total_mes)}</span></span>
                </div>
              )}
            </div>
            {globalLoading && !global ? (
              <div className="p-6 text-center text-body-sm text-steel-400">Cargando…</div>
            ) : !global?.empresas.length ? (
              <div className="p-6 text-center text-body-sm text-steel-400">Sin empresas</div>
            ) : (
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-steel-100 bg-steel-50">
                    <th className="px-4 py-2 text-left font-medium text-steel-500">Empresa</th>
                    <th className="px-4 py-2 text-right font-medium text-steel-500">Ventas hoy</th>
                    <th className="px-4 py-2 text-right font-medium text-steel-500">Notas hoy</th>
                    <th className="px-4 py-2 text-right font-medium text-steel-500">Ventas mes</th>
                    <th className="px-4 py-2 text-right font-medium text-steel-500">Notas mes</th>
                    <th className="px-4 py-2 text-right font-medium text-steel-500">Clientes c/saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-50">
                  {global.empresas.map((e) => (
                    <tr key={e.empresa_id} className="hover:bg-steel-50">
                      <td className="px-4 py-2 font-medium text-steel-900 truncate max-w-[180px]">{e.empresa_nombre}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-brand-700">{fmt(e.ventas_hoy.total)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-steel-500">{e.ventas_hoy.count}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-steel-700">{fmt(e.ventas_mes.total)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-steel-500">{e.ventas_mes.count}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-amber-600">{e.clientes_con_saldo}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-steel-200 bg-steel-50">
                    <td className="px-4 py-2 font-semibold text-steel-900">Total</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-brand-700">{fmt(global.total_hoy)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-steel-500">
                      {global.empresas.reduce((s, e) => s + e.ventas_hoy.count, 0)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-steel-900">{fmt(global.total_mes)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-steel-500">
                      {global.empresas.reduce((s, e) => s + e.ventas_mes.count, 0)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-600">
                      {global.empresas.reduce((s, e) => s + e.clientes_con_saldo, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center">
          <p className="text-meta text-steel-400">
            GrupoMetalicoEMF ERP · Todas las fases completadas
          </p>
        </div>
      </div>
    </div>
  );
}
