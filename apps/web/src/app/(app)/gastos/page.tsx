'use client';

import { useCallback, useEffect, useState } from 'react';
import { Receipt, Trash2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import type { Gasto, MetodoPago } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const CATEGORIAS = ['Limpieza', 'Servicios', 'Papelería', 'Mantenimiento', 'Entrega de Efectivo', 'Otro'];
const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
};
const METODOS: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'];

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TODAY = new Date().toISOString().slice(0, 10);

export default function GastosPage() {
  const { usuario } = useAuthStore();
  const canVerListado = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');

  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [categoriaOtro, setCategoriaOtro] = useState('');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState(0);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('EFECTIVO');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [desde, setDesde] = useState(TODAY);
  const [hasta, setHasta] = useState(TODAY);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!canVerListado) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      const res = await api.get<Gasto[]>(`/gastos?${params}`);
      setGastos(res);
    } catch {
      setGastos([]);
    } finally {
      setLoading(false);
    }
  }, [canVerListado, desde, hasta]);

  useEffect(() => { load(); }, [load]);

  async function onRegistrar() {
    setError(null);
    if (!concepto.trim()) { setError('Describe qué se compró o pagó.'); return; }
    if (monto <= 0) { setError('El monto debe ser mayor a cero.'); return; }

    setGuardando(true);
    try {
      await api.post('/gastos', {
        concepto: concepto.trim(),
        categoria: categoria === 'Otro' ? (categoriaOtro.trim() || 'Otro') : categoria,
        monto,
        metodo_pago: metodoPago,
      });
      setConcepto(''); setMonto(0); setCategoriaOtro('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el gasto');
    } finally {
      setGuardando(false);
    }
  }

  async function onEliminar(id: string) {
    try {
      await api.delete(`/gastos/${id}`);
      setGastos((prev) => prev.filter((g) => g.id !== id));
    } catch { /* silencioso */ }
  }

  const total = gastos.reduce((s, g) => s + g.monto, 0);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6 text-steel-600" />
        <h1 className="text-2xl font-bold text-steel-900">Gastos</h1>
      </div>

      {/* Formulario de captura */}
      <div className="bg-white rounded-xl border border-steel-200 p-4 space-y-3">
        <p className="text-body-sm font-semibold text-steel-900">Registrar gasto</p>
        <div>
          <label className="block text-xs font-medium text-steel-500 uppercase tracking-wide mb-1">Concepto</label>
          <Input
            placeholder="Ej: Jabón y cloro para el aseo…"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-steel-500 uppercase tracking-wide mb-1">Categoría</label>
            <select
              className="flex h-9 w-full rounded-md border border-steel-300 bg-white px-3 py-1 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-steel-500 uppercase tracking-wide mb-1">Método</label>
            <select
              className="flex h-9 w-full rounded-md border border-steel-300 bg-white px-3 py-1 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
            >
              {METODOS.map((m) => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
            </select>
          </div>
        </div>
        {categoria === 'Otro' && (
          <Input
            placeholder="Especifica la categoría…"
            value={categoriaOtro}
            onChange={(e) => setCategoriaOtro(e.target.value)}
          />
        )}
        <div>
          <label className="block text-xs font-medium text-steel-500 uppercase tracking-wide mb-1">Monto</label>
          <Input
            type="number" step="0.01" min="0"
            value={monto}
            onChange={(e) => setMonto(parseFloat(e.target.value) || 0)}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
        )}

        <Button onClick={onRegistrar} loading={guardando} className="w-full">
          Registrar gasto
        </Button>
      </div>

      {/* Listado (solo ADMIN/ENCARGADO) */}
      {canVerListado && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-steel-200 p-4 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-steel-500 uppercase tracking-wide">Desde</label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-steel-500 uppercase tracking-wide">Hasta</label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
            </div>
            <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-steel-50 border-b border-steel-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Concepto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Categoría</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Método</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Usuario</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-steel-500 uppercase">Monto</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {gastos.map((g, i) => (
                  <tr key={g.id} className={i % 2 === 0 ? 'bg-white' : 'bg-steel-50/40'}>
                    <td className="px-4 py-2.5 text-steel-700">{g.concepto}</td>
                    <td className="px-4 py-2.5 text-steel-500">{g.categoria}</td>
                    <td className="px-4 py-2.5 text-steel-500">{METODO_LABEL[g.metodo_pago] ?? g.metodo_pago}</td>
                    <td className="px-4 py-2.5 text-steel-500">{g.usuario ? `${g.usuario.nombre} ${g.usuario.apellidos}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-steel-900">{fmt(g.monto)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => onEliminar(g.id)} className="text-steel-400 hover:text-brand-600 transition-colors" aria-label="Eliminar gasto">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {gastos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-steel-400">
                      Sin gastos en el rango seleccionado
                    </td>
                  </tr>
                )}
              </tbody>
              {gastos.length > 0 && (
                <tfoot>
                  <tr className="bg-steel-900">
                    <td colSpan={4} className="px-4 py-3 text-right text-sm font-bold text-white">TOTAL GASTOS</td>
                    <td colSpan={2} className="px-4 py-3 text-right text-base font-bold text-white">{fmt(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
