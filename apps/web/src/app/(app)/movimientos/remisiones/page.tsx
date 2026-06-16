'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  PackagePlus, ArrowRight, Clock, CheckCircle2, AlertCircle,
  XCircle, Truck, Plus,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

type EstatusRemision = 'BORRADOR' | 'EN_TRANSITO' | 'RECIBIDA_COMPLETA' | 'RECIBIDA_PARCIAL' | 'CANCELADA';

interface RemisionLinea {
  id: string;
  cantidad_enviada: number;
  cantidad_recibida: number | null;
}

interface Remision {
  id: string;
  folio: string;
  estatus: EstatusRemision;
  concepto: string | null;
  created_at: string;
  fecha_envio: string | null;
  fecha_recepcion: string | null;
  empresa_origen:  { id: string; nombre: string };
  ub_origen:       { id: string; nombre: string };
  empresa_destino: { id: string; nombre: string };
  ub_destino:      { id: string; nombre: string };
  creado_por:      { nombre: string; apellidos: string };
  lineas: RemisionLinea[];
}

interface RemisionesPage {
  data: Remision[];
  total: number;
  pages: number;
  page: number;
}

const ESTATUS_CFG: Record<EstatusRemision, {
  label: string;
  icon: React.ReactNode;
  cls: string;
}> = {
  BORRADOR:           { label: 'Borrador',    icon: <Clock className="h-3 w-3" />,         cls: 'bg-steel-100 text-steel-600' },
  EN_TRANSITO:        { label: 'En tránsito', icon: <Truck className="h-3 w-3" />,         cls: 'bg-yellow-100 text-yellow-700' },
  RECIBIDA_COMPLETA:  { label: 'Completa',    icon: <CheckCircle2 className="h-3 w-3" />,  cls: 'bg-green-100 text-green-700' },
  RECIBIDA_PARCIAL:   { label: 'Parcial',     icon: <AlertCircle className="h-3 w-3" />,   cls: 'bg-orange-100 text-orange-700' },
  CANCELADA:          { label: 'Cancelada',   icon: <XCircle className="h-3 w-3" />,       cls: 'bg-red-100 text-red-600' },
};

type Tab = 'salida' | 'entrada' | 'todas';

const TABS: { key: Tab; label: string }[] = [
  { key: 'salida',  label: 'Salidas' },
  { key: 'entrada', label: 'Entradas' },
  { key: 'todas',   label: 'Todas' },
];

export default function RemisionesPage() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const { empresa }  = useContextoStore();

  const [tab, setTab]       = useState<Tab>('salida');
  const [result, setResult] = useState<RemisionesPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage]     = useState(1);

  const canCreate = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');

  const load = useCallback(async () => {
    if (!empresa) return;
    setLoading(true);
    try {
      const data = await api.get<RemisionesPage>(
        `/remisiones?tipo=${tab}&page=${page}&limit=50`,
      );
      setResult(data);
    } finally {
      setLoading(false);
    }
  }, [empresa, tab, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab]);

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display-sm font-bold text-steel-900">Remisiones</h1>
          <p className="text-body-sm text-steel-500 mt-0.5">Movimientos de inventario multi-artículo</p>
        </div>
        {canCreate && (
          <Button onClick={() => router.push('/movimientos/remisiones/nueva')} size="sm">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nueva remisión
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-steel-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2.5 text-body-sm font-medium border-b-2 transition-colors',
              tab === t.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-steel-500 hover:text-steel-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-steel-400 text-body-sm">Cargando…</div>
        ) : !result?.data.length ? (
          <EmptyState
            icon={<PackagePlus className="h-8 w-8" />}
            title="Sin remisiones"
            description={tab === 'salida' ? 'No has enviado remisiones' : tab === 'entrada' ? 'No has recibido remisiones' : 'No hay remisiones'}
          />
        ) : (
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-steel-100 bg-steel-50">
                <th className="text-left px-4 py-3 font-medium text-steel-600">Folio</th>
                <th className="text-left px-4 py-3 font-medium text-steel-600">Ruta</th>
                <th className="text-left px-4 py-3 font-medium text-steel-600 hidden md:table-cell">Artículos</th>
                <th className="text-left px-4 py-3 font-medium text-steel-600 hidden lg:table-cell">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-steel-600">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100 bg-white">
              {result.data.map((rem) => {
                const cfg = ESTATUS_CFG[rem.estatus];
                return (
                  <tr
                    key={rem.id}
                    onClick={() => router.push(`/movimientos/remisiones/${rem.id}`)}
                    className="bg-white hover:bg-steel-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-brand-600">{rem.folio}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-steel-700">
                        <span className="font-medium truncate max-w-[100px]">{rem.empresa_origen.nombre}</span>
                        <span className="text-steel-400 text-meta">{rem.ub_origen.nombre}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-steel-400 flex-shrink-0" />
                        <span className="font-medium truncate max-w-[100px]">{rem.empresa_destino.nombre}</span>
                        <span className="text-steel-400 text-meta hidden sm:inline">{rem.ub_destino.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-steel-600 hidden md:table-cell">
                      {rem.lineas.length} {rem.lineas.length === 1 ? 'artículo' : 'artículos'}
                    </td>
                    <td className="px-4 py-3 text-steel-500 hidden lg:table-cell">
                      {fmt(rem.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-meta font-medium', cfg.cls)}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {result && result.pages > 1 && (
        <div className="flex items-center justify-between text-body-sm text-steel-500">
          <span>{result.total} remisiones</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded border border-steel-200 hover:bg-steel-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Anterior
            </button>
            <span className="px-2">{page} / {result.pages}</span>
            <button disabled={page >= result.pages} onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded border border-steel-200 hover:bg-steel-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
