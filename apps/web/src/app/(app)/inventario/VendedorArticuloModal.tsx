'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useContextoStore } from '@/lib/store/contexto.store';
import type { Articulo, ConfigColumnasSchema, OrdenProduccion } from '@/lib/types/api';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface VendedorArticuloModalProps {
  articulo: Articulo | null;
  schema: ConfigColumnasSchema | null;
  onClose: () => void;
  onUpdated: (articulo: Articulo) => void;
}

// Versión simplificada del detalle de artículo para el rol Vendedor: solo
// identificación (descripciones) + ajustar existencia, y — si la ubicación
// fabrica — registrar avance de producción. Sin precios, sin editar info,
// sin dar de alta ni eliminar (eso sigue vedado a este rol).
export function VendedorArticuloModal({ articulo, schema, onClose, onUpdated }: VendedorArticuloModalProps) {
  const { ubicacion } = useContextoStore();

  const [existencias, setExistencias] = useState<Record<number, string>>({});
  const [guardandoExistencia, setGuardandoExistencia] = useState(false);
  const [existenciaError, setExistenciaError] = useState<string | null>(null);

  const [ordenes, setOrdenes] = useState<OrdenProduccion[]>([]);
  const [avances, setAvances] = useState<Record<string, string>>({});
  const [avanceSubmittingId, setAvanceSubmittingId] = useState<string | null>(null);
  const [avanceError, setAvanceError] = useState<string | null>(null);

  const muestraProduccion = ubicacion?.tipo === 'MATRIZ' || ubicacion?.tipo === 'FABRICA';

  useEffect(() => {
    if (!articulo) return;
    const activas = schema?.existencias.filter((e) => e.activa) ?? [];
    const inicial: Record<number, string> = {};
    for (const e of activas) {
      const val = articulo[`existencia_${e.numero}` as keyof Articulo] as number | null;
      inicial[e.numero] = val != null ? String(val) : '';
    }
    setExistencias(inicial);
    setExistenciaError(null);
    setAvanceError(null);
  }, [articulo, schema]);

  useEffect(() => {
    if (!articulo || !muestraProduccion) { setOrdenes([]); return; }
    api.get<{ data: OrdenProduccion[] }>(`/rh/produccion?articuloId=${articulo.id}`)
      .then((page) => setOrdenes(page.data.filter((op) => op.estatus === 'ABIERTA' || op.estatus === 'EN_PROCESO')))
      .catch(() => setOrdenes([]));
  }, [articulo, muestraProduccion]);

  if (!articulo) return null;

  const activeExistencias = schema?.existencias.filter((e) => e.activa) ?? [];
  const descripciones = [
    articulo.descripcion_1, articulo.descripcion_2, articulo.descripcion_3,
    articulo.descripcion_4, articulo.descripcion_5,
  ].filter((d): d is string => !!d);

  async function guardarExistencia() {
    if (!articulo) return;
    setGuardandoExistencia(true);
    setExistenciaError(null);
    try {
      const body: Record<string, number> = {};
      for (const e of activeExistencias) {
        const raw = existencias[e.numero];
        if (raw !== undefined && raw !== '') body[`existencia_${e.numero}`] = Number(raw);
      }
      const actualizado = await api.patch<Articulo>(`/articulos/${articulo.id}/existencias`, body);
      onUpdated(actualizado);
    } catch (err) {
      setExistenciaError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardandoExistencia(false);
    }
  }

  async function registrarAvance(op: OrdenProduccion) {
    if (!articulo) return;
    const cantidad = Number(avances[op.id]);
    if (!cantidad || cantidad <= 0) return;
    setAvanceError(null);
    setAvanceSubmittingId(op.id);
    try {
      const actualizado = await api.patch<Articulo>(`/rh/produccion/${op.id}/avance`, { cantidad })
        .then(() => api.get<Articulo>(`/articulos/${articulo.id}`));
      setAvances((prev) => ({ ...prev, [op.id]: '' }));
      const page = await api.get<{ data: OrdenProduccion[] }>(`/rh/produccion?articuloId=${articulo.id}`);
      setOrdenes(page.data.filter((o) => o.estatus === 'ABIERTA' || o.estatus === 'EN_PROCESO'));
      onUpdated(actualizado);
    } catch (err) {
      setAvanceError(err instanceof Error ? err.message : 'Error al registrar avance');
    } finally {
      setAvanceSubmittingId(null);
    }
  }

  return (
    <Dialog open={!!articulo} onClose={onClose} title={articulo.clave} size="md">
      <div className="space-y-5">
        {/* Descripciones — solo identificación, no editable */}
        <div>
          {descripciones.map((d, i) => (
            <p key={i} className={i === 0 ? 'text-body font-semibold text-steel-900' : 'text-body-sm text-steel-500'}>
              {d}
            </p>
          ))}
        </div>

        {/* Existencia — ajuste rápido */}
        <div className="space-y-2">
          <label className="text-body-sm font-medium text-steel-700 block">Existencia</label>
          {activeExistencias.length === 0 ? (
            <p className="text-body-sm text-steel-400">Sin columnas de existencia configuradas.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {activeExistencias.map((e) => (
                <div key={e.numero}>
                  <label className="text-caption text-steel-500 block mb-1">{e.label}</label>
                  <Input
                    type="number" min={0} step="1"
                    value={existencias[e.numero] ?? ''}
                    onChange={(ev) => setExistencias((prev) => ({ ...prev, [e.numero]: ev.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
          {existenciaError && <p className="text-body-sm text-brand-600">{existenciaError}</p>}
          <Button size="sm" onClick={guardarExistencia} loading={guardandoExistencia} disabled={activeExistencias.length === 0}>
            Guardar existencia
          </Button>
        </div>

        {/* Divisor — a partir de aquí, sumar por producción en vez de capturar a mano */}
        {muestraProduccion && (
          <>
            <hr className="border-steel-200" />
            <div className="space-y-2">
              <label className="text-body-sm font-medium text-steel-700 block">Agregar desde producción</label>
              {ordenes.length === 0 ? (
                <p className="text-body-sm text-steel-400">No hay órdenes de producción abiertas para este artículo.</p>
              ) : (
                <div className="space-y-2">
                  {ordenes.map((op) => {
                    const objetivo = Number(op.cantidad_objetivo);
                    const producida = Number(op.cantidad_producida);
                    const faltante = Math.max(0, objetivo - producida);
                    return (
                      <div key={op.id} className="flex items-center gap-2 border border-steel-100 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-body-sm font-medium text-steel-900">OP #{op.folio}</p>
                          <p className="text-caption text-steel-500">
                            {producida.toFixed(0)} / {objetivo.toFixed(0)} · faltan {faltante.toFixed(0)}
                          </p>
                        </div>
                        <Input
                          type="number" min={1} step="1"
                          className="w-20 h-8 text-right"
                          placeholder="Cant."
                          value={avances[op.id] ?? ''}
                          onChange={(e) => setAvances((prev) => ({ ...prev, [op.id]: e.target.value }))}
                        />
                        <Button size="sm" onClick={() => registrarAvance(op)} loading={avanceSubmittingId === op.id}>
                          Agregar
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {avanceError && <p className="text-body-sm text-brand-600">{avanceError}</p>}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
