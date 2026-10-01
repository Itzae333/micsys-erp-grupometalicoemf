'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackageOpen, Plus } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { formatFecha } from '@/lib/utils';
import type { Area, EntregaMateriaPrima, EntregasMateriaPrimaPage } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

const SELECT_CLS = 'h-9 px-3 rounded-lg border border-steel-200 text-body-sm bg-white text-steel-700';

function hoyISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}
function inicioMesISO() {
  return hoyISO().slice(0, 8) + '01';
}

export default function EntregasMateriaPrimaPage() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const { empresa, ubicacion } = useContextoStore();
  const canWrite = ['ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');

  const [areas, setAreas] = useState<Area[]>([]);

  // ── Lista ──
  const [entregas, setEntregas] = useState<EntregaMateriaPrima[]>([]);
  const [loading, setLoading] = useState(true);
  const [fAreaId, setFAreaId] = useState('');
  const [fEstatus, setFEstatus] = useState('');
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());


  useEffect(() => {
    api.get<Area[]>('/rh/areas').then(setAreas).catch(() => setAreas([]));
  }, []);

  const loadEntregas = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: '100' });
      if (fAreaId) p.set('areaId', fAreaId);
      if (fEstatus) p.set('estatus', fEstatus);
      if (desde) p.set('desde', desde);
      if (hasta) p.set('hasta', hasta);
      const res = await api.get<EntregasMateriaPrimaPage>(`/entregas-materia-prima?${p}`);
      setEntregas(res.data);
    } catch {
      setEntregas([]);
    } finally {
      setLoading(false);
    }
  }, [fAreaId, fEstatus, desde, hasta]);


  useEffect(() => { void loadEntregas(); }, [loadEntregas]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">
            {empresa?.nombre} · {ubicacion?.nombre}
          </p>
          <h1 className="text-display-md font-bold text-steel-900">Entregas de materia prima</h1>
        </div>
        {canWrite && (
          <Button onClick={() => router.push('/entregas-materia-prima/nueva')}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva entrega
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={fAreaId} onChange={(e) => setFAreaId(e.target.value)} className={SELECT_CLS} aria-label="Área">
          <option value="">Todas las áreas</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select value={fEstatus} onChange={(e) => setFEstatus(e.target.value)} className={SELECT_CLS} aria-label="Estatus">
          <option value="">Todos los estatus</option>
          <option value="ACTIVA">Activas</option>
          <option value="CANCELADA">Canceladas</option>
        </select>
        <Input type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
        <span className="text-steel-400 text-body-sm">a</span>
        <Input type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
      </div>

      {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-steel-100 rounded-lg animate-pulse" />)}
          </div>
        ) : entregas.length === 0 ? (
          <EmptyState
            icon={<PackageOpen className="h-8 w-8" />}
            title="Sin entregas"
            description="No hay entregas de materia prima en este periodo."
            action={canWrite ? { label: 'Nueva entrega', onClick: () => router.push('/entregas-materia-prima/nueva') } : undefined}
          />
        ) : (
          <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
            <table className="w-full text-body-sm">
              <thead className="bg-steel-50 text-steel-500 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Área</th>
                  <th className="px-4 py-2.5 font-medium">Recibió</th>
                  <th className="px-4 py-2.5 font-medium">Entregó</th>
                  <th className="px-4 py-2.5 font-medium text-right">Artículos</th>
                  <th className="px-4 py-2.5 font-medium">Estatus</th>
                </tr>
              </thead>
              <tbody>
                {entregas.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => router.push(`/entregas-materia-prima/${e.id}`)}
                    className="border-t border-steel-100 hover:bg-steel-50 cursor-pointer"
                  >
                    <td className="px-4 py-2.5 text-steel-600">{formatFecha(e.fecha)}</td>
                    <td className="px-4 py-2.5 font-medium text-steel-900">{e.area.nombre}</td>
                    <td className="px-4 py-2.5">{e.empleado ? `${e.empleado.nombre} ${e.empleado.apellidos}` : '—'}</td>
                    <td className="px-4 py-2.5 text-steel-600">{e.entregador.nombre} {e.entregador.apellidos}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{e.lineas.length}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={e.estatus === 'ACTIVA' ? 'paid' : 'cancelled'}>
                        {e.estatus === 'ACTIVA' ? 'Activa' : 'Cancelada'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}
    </div>
  );
}
