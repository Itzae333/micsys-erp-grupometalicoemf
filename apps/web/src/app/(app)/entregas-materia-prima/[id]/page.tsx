'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Undo2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { formatFecha, formatCantidad } from '@/lib/utils';
import type { EntregaMateriaPrima, EntregaMateriaPrimaLinea, TipoDevolucionMateriaPrima } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

const TIPOS: { value: TipoDevolucionMateriaPrima; label: string; ayuda: string }[] = [
  { value: 'SOBRANTE',      label: 'Sobrante',          ayuda: 'Material sin usar. Regresa al inventario.' },
  { value: 'ERROR_ENTREGA', label: 'Error de entrega',  ayuda: 'Se entregó de más o el artículo equivocado. Regresa al inventario.' },
  { value: 'DEFECTUOSO',    label: 'Defectuoso',        ayuda: 'Llegó en mal estado. NO regresa al inventario; queda registrado al área.' },
  { value: 'MERMA',         label: 'Merma',             ayuda: 'Se perdió o dañó en el proceso. NO regresa al inventario; queda registrado al área.' },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.value, t.label])) as Record<TipoDevolucionMateriaPrima, string>;

function pendiente(l: EntregaMateriaPrimaLinea) {
  const devuelto = l.devoluciones.reduce((s, d) => s + d.cantidad, 0);
  return Math.round((l.cantidad - devuelto) * 1000) / 1000;
}

interface FilaDev { cantidad: string; tipo: TipoDevolucionMateriaPrima }

export default function EntregaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { usuario } = useAuthStore();
  const canWrite = ['ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');

  const [entrega, setEntrega] = useState<EntregaMateriaPrima | null>(null);
  const [loading, setLoading] = useState(true);

  const [dlgOpen, setDlgOpen] = useState(false);
  const [filas, setFilas] = useState<Record<string, FilaDev>>({});
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntrega(await api.get<EntregaMateriaPrima>(`/entregas-materia-prima/${id}`));
    } catch {
      setEntrega(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="p-8"><div className="h-40 bg-steel-100 rounded-lg animate-pulse" /></div>;
  if (!entrega) return <div className="p-8 text-body-sm text-brand-600">Entrega no encontrada.</div>;

  const activa = entrega.estatus === 'ACTIVA';
  const hayPendiente = entrega.lineas.some((l) => pendiente(l) > 0);

  function abrirDevolucion() {
    if (!entrega) return;
    setFilas(Object.fromEntries(entrega.lineas.map((l) => [l.id, { cantidad: '', tipo: 'SOBRANTE' as TipoDevolucionMateriaPrima }])));
    setMotivo(''); setFormError(null); setDlgOpen(true);
  }

  async function guardarDevolucion() {
    if (!entrega) return;
    const lineas = entrega.lineas
      .map((l) => ({ l, f: filas[l.id] }))
      .filter(({ f }) => f && Number(f.cantidad) > 0);
    if (lineas.length === 0) { setFormError('Indica la cantidad de al menos un artículo'); return; }
    for (const { l, f } of lineas) {
      if (Number(f.cantidad) > pendiente(l)) {
        setFormError(`${l.articulo.clave}: solo quedan ${formatCantidad(pendiente(l))} por devolver`);
        return;
      }
    }
    setSaving(true); setFormError(null);
    try {
      await api.post(`/entregas-materia-prima/${id}/devoluciones`, {
        motivo: motivo || undefined,
        lineas: lineas.map(({ l, f }) => ({ entrega_linea_id: l.id, tipo: f.tipo, cantidad: Number(f.cantidad) })),
      });
      toast('Devolución registrada', 'success');
      setDlgOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error al registrar la devolución');
    } finally {
      setSaving(false);
    }
  }

  async function cancelar() {
    if (!confirm('¿Cancelar esta entrega? La existencia regresará al inventario.')) return;
    setCancelando(true);
    try {
      await api.patch(`/entregas-materia-prima/${id}/cancelar`, {});
      toast('Entrega cancelada', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al cancelar', 'error');
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <button
        onClick={() => router.push('/entregas-materia-prima')}
        className="flex items-center gap-1.5 text-steel-500 hover:text-steel-800 text-body-sm mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Entregas de materia prima
      </button>

      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-display-md font-bold text-steel-900">{entrega.area.nombre}</h1>
            <Badge variant={activa ? 'paid' : 'cancelled'}>{activa ? 'Activa' : 'Cancelada'}</Badge>
          </div>
          <p className="text-body-sm text-steel-500 mt-1">{formatFecha(entrega.fecha)}</p>
        </div>
        {canWrite && activa && (
          <div className="flex items-center gap-2">
            {hayPendiente && (
              <Button variant="secondary" onClick={abrirDevolucion}>
                <Undo2 className="h-4 w-4 mr-1.5" />
                Registrar devolución
              </Button>
            )}
            {entrega.devoluciones.length === 0 && (
              <Button variant="destructive" onClick={cancelar} loading={cancelando}>Cancelar entrega</Button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-steel-200 rounded-xl p-5 grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div>
          <p className="text-caption text-steel-500">Recibió</p>
          <p className="text-body font-medium text-steel-900">
            {entrega.empleado ? `${entrega.empleado.nombre} ${entrega.empleado.apellidos}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-caption text-steel-500">Entregó</p>
          <p className="text-body font-medium text-steel-900">{entrega.entregador.nombre} {entrega.entregador.apellidos}</p>
        </div>
        <div>
          <p className="text-caption text-steel-500">Observaciones</p>
          <p className="text-body text-steel-900">{entrega.observaciones || '—'}</p>
        </div>
      </div>

      <h2 className="text-body font-semibold text-steel-900 mb-2">Material entregado</h2>
      <div className="bg-white border border-steel-200 rounded-xl overflow-x-auto mb-6">
        <table className="w-full text-body-sm">
          <thead className="bg-steel-50 text-steel-500 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Artículo</th>
              <th className="px-4 py-2.5 font-medium text-right">Entregado</th>
              <th className="px-4 py-2.5 font-medium text-right">Devuelto</th>
              <th className="px-4 py-2.5 font-medium text-right">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {entrega.lineas.map((l) => (
              <tr key={l.id} className="border-t border-steel-100">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-steel-900">{l.articulo.clave}</span>
                  <span className="text-steel-500"> — {[l.articulo.descripcion_1, l.articulo.descripcion_2].filter(Boolean).join(' ')}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCantidad(l.cantidad)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatCantidad(l.devoluciones.reduce((s, d) => s + d.cantidad, 0))}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatCantidad(pendiente(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {entrega.devoluciones.length > 0 && (
        <>
          <h2 className="text-body font-semibold text-steel-900 mb-2">Devoluciones, mermas y defectuosos</h2>
          <div className="space-y-3">
            {entrega.devoluciones.map((d) => (
              <div key={d.id} className="bg-white border border-steel-200 rounded-xl p-4">
                <p className="text-body-sm text-steel-500 mb-2">
                  {formatFecha(d.fecha)} · {d.registrador.nombre} {d.registrador.apellidos}
                  {d.motivo && <span className="text-steel-700"> · {d.motivo}</span>}
                </p>
                <ul className="space-y-1">
                  {d.lineas.map((dl) => {
                    const linea = entrega.lineas.find((l) => l.id === dl.entrega_linea_id);
                    return (
                      <li key={dl.id} className="flex items-center justify-between text-body-sm">
                        <span>{linea?.articulo.clave ?? '—'}</span>
                        <span className="flex items-center gap-3">
                          <Badge variant={dl.tipo === 'SOBRANTE' || dl.tipo === 'ERROR_ENTREGA' ? 'paid' : 'credit'}>
                            {TIPO_LABEL[dl.tipo]}
                          </Badge>
                          <span className="tabular-nums font-medium w-16 text-right">{formatCantidad(dl.cantidad)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={dlgOpen} onClose={() => setDlgOpen(false)} title="Registrar devolución" size="lg">
        <div className="space-y-3">
          <p className="text-body-sm text-steel-500">
            Captura solo los artículos que regresan. Sobrante y error de entrega suben la existencia del inventario;
            merma y defectuoso no, pero quedan imputados al área en el reporte.
          </p>
          {entrega.lineas.filter((l) => pendiente(l) > 0).map((l) => {
            const f = filas[l.id] ?? { cantidad: '', tipo: 'SOBRANTE' as TipoDevolucionMateriaPrima };
            const ayuda = TIPOS.find((t) => t.value === f.tipo)?.ayuda;
            return (
              <div key={l.id} className="border border-steel-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-steel-900 truncate">{l.articulo.clave}</p>
                    <p className="text-meta text-steel-500">Pendiente: {formatCantidad(pendiente(l))}</p>
                  </div>
                  <select
                    value={f.tipo}
                    onChange={(e) => setFilas((p) => ({ ...p, [l.id]: { ...f, tipo: e.target.value as TipoDevolucionMateriaPrima } }))}
                    className="h-9 px-3 rounded-lg border border-steel-200 text-body-sm bg-white"
                    aria-label="Tipo"
                  >
                    {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <Input
                    type="number" min="0" step="any" className="w-24 h-9" placeholder="Cant."
                    value={f.cantidad}
                    onChange={(e) => setFilas((p) => ({ ...p, [l.id]: { ...f, cantidad: e.target.value } }))}
                    aria-label="Cantidad"
                  />
                </div>
                {Number(f.cantidad) > 0 && <p className="text-meta text-steel-400 mt-1.5">{ayuda}</p>}
              </div>
            );
          })}
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Motivo</label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional" />
          </div>
          {formError && <p className="text-body-sm text-brand-600">{formError}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDlgOpen(false)}>Cancelar</Button>
          <Button onClick={guardarDevolucion} loading={saving}>Registrar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
