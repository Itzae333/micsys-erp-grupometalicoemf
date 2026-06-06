'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronUp, ChevronDown, Save, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ConfigColumna, Ubicacion } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type TipoColumna = 'PRECIO' | 'EXISTENCIA' | 'DESCRIPCION';

interface ColumnaLocal extends ConfigColumna {
  dirty?: boolean;
}

const TIPO_META: Record<
  TipoColumna,
  { label: string; max: number; color: string; hint: string }
> = {
  PRECIO: {
    label: 'Precios',
    max: 10,
    color: 'text-green-700',
    hint: 'precio_1 … precio_10 en el artículo',
  },
  EXISTENCIA: {
    label: 'Existencias',
    max: 5,
    color: 'text-blue-600',
    hint: 'existencia_1 … existencia_5 en el artículo',
  },
  DESCRIPCION: {
    label: 'Descripciones',
    max: 5,
    color: 'text-purple-600',
    hint: 'descripcion_1 … descripcion_5 en el artículo',
  },
};

export default function ConfigColumnasPage() {
  const params = useParams<{ empresaId: string; ubicacionId: string }>();
  const router = useRouter();

  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [columnas, setColumnas] = useState<ColumnaLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDirty = columnas.some((c) => c.dirty);

  async function load() {
    try {
      const [ub, cols] = await Promise.all([
        api.get<Ubicacion>(`/empresas/${params.empresaId}/ubicaciones/${params.ubicacionId}`),
        api.get<ConfigColumna[]>(
          `/config-columnas/${params.empresaId}/${params.ubicacionId}`,
        ),
      ]);
      setUbicacion(ub);

      // Rellenar columnas faltantes para que el editor muestre todos los slots disponibles
      const filled = fillMissingColumnas(cols);
      setColumnas(filled);
    } finally {
      setLoading(false);
    }
  }

  function fillMissingColumnas(existing: ConfigColumna[]): ColumnaLocal[] {
    const tipos: TipoColumna[] = ['PRECIO', 'EXISTENCIA', 'DESCRIPCION'];
    const result: ColumnaLocal[] = [];
    for (const tipo of tipos) {
      const meta = TIPO_META[tipo];
      for (let n = 1; n <= meta.max; n++) {
        const found = existing.find((c) => c.tipo === tipo && c.numero === n);
        if (found) {
          result.push({ ...found });
        } else {
          result.push({
            id: `__new__${tipo}_${n}`,
            empresa_id: params.empresaId,
            ubicacion_id: params.ubicacionId,
            tipo,
            numero: n,
            label: defaultLabel(tipo, n),
            activa: false,
            orden: n,
          });
        }
      }
    }
    return result;
  }

  function defaultLabel(tipo: TipoColumna, n: number) {
    if (tipo === 'PRECIO') return `Precio ${n}`;
    if (tipo === 'EXISTENCIA') return `Existencia ${n}`;
    return `Descripción ${n}`;
  }

  useEffect(() => {
    load();
  }, [params.empresaId, params.ubicacionId]);

  function updateLabel(tipo: TipoColumna, numero: number, label: string) {
    setColumnas((prev) =>
      prev.map((c) =>
        c.tipo === tipo && c.numero === numero ? { ...c, label, dirty: true } : c,
      ),
    );
    setSaved(false);
  }

  function toggleActiva(tipo: TipoColumna, numero: number, activa: boolean) {
    setColumnas((prev) =>
      prev.map((c) =>
        c.tipo === tipo && c.numero === numero ? { ...c, activa, dirty: true } : c,
      ),
    );
    setSaved(false);
  }

  function moveUp(tipo: TipoColumna, numero: number) {
    setColumnas((prev) => {
      const group = prev.filter((c) => c.tipo === tipo).sort((a, b) => a.orden - b.orden);
      const idx = group.findIndex((c) => c.numero === numero);
      if (idx <= 0) return prev;
      const newGroup = [...group];
      [newGroup[idx - 1], newGroup[idx]] = [newGroup[idx], newGroup[idx - 1]];
      const reordered = newGroup.map((c, i) => ({ ...c, orden: i + 1, dirty: true }));
      const rest = prev.filter((c) => c.tipo !== tipo);
      return [...rest, ...reordered];
    });
    setSaved(false);
  }

  function moveDown(tipo: TipoColumna, numero: number) {
    setColumnas((prev) => {
      const group = prev.filter((c) => c.tipo === tipo).sort((a, b) => a.orden - b.orden);
      const idx = group.findIndex((c) => c.numero === numero);
      if (idx >= group.length - 1) return prev;
      const newGroup = [...group];
      [newGroup[idx], newGroup[idx + 1]] = [newGroup[idx + 1], newGroup[idx]];
      const reordered = newGroup.map((c, i) => ({ ...c, orden: i + 1, dirty: true }));
      const rest = prev.filter((c) => c.tipo !== tipo);
      return [...rest, ...reordered];
    });
    setSaved(false);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        columnas: columnas.map((c) => ({
          tipo: c.tipo,
          numero: c.numero,
          label: c.label,
          activa: c.activa,
          orden: c.orden,
        })),
      };
      await api.put(
        `/config-columnas/${params.empresaId}/${params.ubicacionId}`,
        payload,
      );
      setColumnas((prev) => prev.map((c) => ({ ...c, dirty: false })));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const colsByTipo = useCallback(
    (tipo: TipoColumna) =>
      columnas.filter((c) => c.tipo === tipo).sort((a, b) => a.orden - b.orden),
    [columnas],
  );

  if (loading || !ubicacion) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-64 bg-steel-100 rounded animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 bg-steel-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-body-sm text-steel-500 hover:text-steel-900 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">
            Configuración de columnas
          </p>
          <h1 className="text-display-md font-bold text-steel-900">{ubicacion.nombre}</h1>
          <p className="text-body-sm text-steel-500 mt-0.5">
            Define qué columnas de precio, existencia y descripción estarán activas en el inventario.
          </p>
        </div>
        <Button onClick={onSave} loading={saving} disabled={!hasDirty && !saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saved ? '¡Guardado!' : 'Guardar'}
        </Button>
      </div>

      {/* Aviso inmutabilidad */}
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-body-sm text-amber-800">
          <span className="font-semibold">Importante:</span> Una vez que el inventario tenga
          artículos, esta configuración no debe modificarse. Los cambios afectan qué campos se
          muestran en toda la ubicación.
        </p>
      </div>

      {error && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3">
          <p className="text-body-sm text-brand-600">{error}</p>
        </div>
      )}

      {/* Secciones por tipo */}
      {(['PRECIO', 'EXISTENCIA', 'DESCRIPCION'] as TipoColumna[]).map((tipo) => {
        const meta = TIPO_META[tipo];
        const cols = colsByTipo(tipo);
        const activeCount = cols.filter((c) => c.activa).length;

        return (
          <div key={tipo} className="bg-white border border-steel-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-steel-100 flex items-center justify-between">
              <div>
                <h2 className={cn('text-display-sm font-bold', meta.color)}>{meta.label}</h2>
                <p className="text-body-sm text-steel-500 mt-0.5">{meta.hint}</p>
              </div>
              <span className="text-body-sm text-steel-500">
                {activeCount}/{meta.max} activas
              </span>
            </div>

            <div className="divide-y divide-steel-50">
              {cols.map((col, idx) => (
                <div
                  key={`${col.tipo}-${col.numero}`}
                  className={cn(
                    'flex items-center gap-3 px-5 py-3 transition-colors',
                    col.activa ? 'bg-white' : 'bg-steel-50/50',
                    col.dirty && 'bg-amber-50/40',
                  )}
                >
                  {/* Número de slot */}
                  <span className="text-table-header text-steel-400 w-5 text-center flex-shrink-0">
                    {col.numero}
                  </span>

                  {/* Switch activa */}
                  <Switch
                    checked={col.activa}
                    onChange={(v) => toggleActiva(tipo, col.numero, v)}
                  />

                  {/* Label */}
                  <div className="flex-1">
                    <Input
                      value={col.label}
                      onChange={(e) => updateLabel(tipo, col.numero, e.target.value)}
                      disabled={!col.activa}
                      className={cn(
                        'h-8 text-body',
                        !col.activa && 'text-steel-400',
                      )}
                      placeholder={defaultLabel(tipo, col.numero)}
                    />
                  </div>

                  {/* Orden */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveUp(tipo, col.numero)}
                      disabled={idx === 0}
                      className="text-steel-300 hover:text-steel-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveDown(tipo, col.numero)}
                      disabled={idx === cols.length - 1}
                      className="text-steel-300 hover:text-steel-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Botón guardar inferior */}
      <div className="flex justify-end pb-4">
        <Button onClick={onSave} loading={saving} disabled={!hasDirty && !saving} size="lg">
          <Save className="h-4 w-4 mr-1.5" />
          {saved ? '¡Configuración guardada!' : 'Guardar configuración'}
        </Button>
      </div>
    </div>
  );
}
