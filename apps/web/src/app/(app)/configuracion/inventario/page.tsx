'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Columns3, MapPin, Package } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import type { Ubicacion, ConfigColumna } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

interface ColsSummary {
  precios: number;
  existencias: number;
  descripciones: number;
}

const TIPO_COLORS: Record<string, string> = {
  MATRIZ: 'bg-brand-600/10 text-brand-600',
  FABRICA: 'bg-blue-50 text-blue-600',
  PUNTO_VENTA: 'bg-green-50 text-green-700',
};

const TIPO_LABELS: Record<string, string> = {
  MATRIZ: 'Matriz',
  FABRICA: 'Fábrica',
  PUNTO_VENTA: 'Punto de Venta',
};

export default function InventarioConfigPage() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [summary, setSummary] = useState<Record<string, ColsSummary>>({});
  const [loading, setLoading] = useState(true);

  const empresaId = usuario?.empresa_id;

  useEffect(() => {
    if (!empresaId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const ubs = await api.get<Ubicacion[]>(`/empresas/${empresaId}/ubicaciones`);
        setUbicaciones(ubs);

        const colsArr = await Promise.all(
          ubs.map((ub) =>
            api
              .get<ConfigColumna[]>(`/config-columnas/${empresaId}/${ub.id}`)
              .catch(() => [] as ConfigColumna[]),
          ),
        );

        const map: Record<string, ColsSummary> = {};
        ubs.forEach((ub, i) => {
          const cols = colsArr[i];
          map[ub.id] = {
            precios: cols.filter((c) => c.tipo === 'PRECIO' && c.activa).length,
            existencias: cols.filter((c) => c.tipo === 'EXISTENCIA' && c.activa).length,
            descripciones: cols.filter((c) => c.tipo === 'DESCRIPCION' && c.activa).length,
          };
        });
        setSummary(map);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [empresaId]);

  if (loading) {
    return (
      <div className="p-8 space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-20 bg-steel-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">
          Configuración
        </p>
        <h1 className="text-display-md font-bold text-steel-900">Inventario</h1>
        <p className="text-body-sm text-steel-500 mt-1">
          Define qué columnas de precio, existencia y descripción estarán activas en cada
          ubicación. Configura antes de registrar artículos.
        </p>
      </div>

      {ubicaciones.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="Sin ubicaciones"
          description='Crea una ubicación en "Mi Empresa" para configurar su inventario.'
        />
      ) : (
        <div className="space-y-3">
          {ubicaciones.map((ub) => {
            const s = summary[ub.id] ?? { precios: 0, existencias: 0, descripciones: 0 };
            const totalActivas = s.precios + s.existencias + s.descripciones;

            return (
              <div
                key={ub.id}
                className="bg-white border border-steel-200 rounded-xl px-5 py-4 flex items-center gap-4"
              >
                <div className="w-9 h-9 rounded-lg bg-steel-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-4 w-4 text-steel-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-body font-semibold text-steel-900 truncate">
                      {ub.nombre}
                    </p>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${TIPO_COLORS[ub.tipo]}`}
                    >
                      {TIPO_LABELS[ub.tipo]}
                    </span>
                  </div>

                  {totalActivas > 0 ? (
                    <p className="text-body-sm text-steel-500">
                      {s.precios} {s.precios === 1 ? 'precio' : 'precios'} ·{' '}
                      {s.existencias}{' '}
                      {s.existencias === 1 ? 'existencia' : 'existencias'} ·{' '}
                      {s.descripciones}{' '}
                      {s.descripciones === 1 ? 'descripción' : 'descripciones'} activas
                    </p>
                  ) : (
                    <p className="text-body-sm text-amber-600 font-medium">
                      Sin columnas configuradas
                    </p>
                  )}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    router.push(`/configuracion/columnas/${empresaId}/${ub.id}`)
                  }
                >
                  <Columns3 className="h-3.5 w-3.5 mr-1.5" />
                  Configurar
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
