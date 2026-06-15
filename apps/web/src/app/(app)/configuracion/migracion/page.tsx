'use client';

import { useRef, useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { cn } from '@/lib/utils';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

interface ImportResult {
  insertados: number;
  actualizados: number;
  omitidos: number;
  lineas_insertadas?: number;
  errores: { fila: number; motivo: string }[];
}

type TipoMigracion = 'inventario' | 'clientes' | 'ventas';

const CONFIG: Record<TipoMigracion, { titulo: string; descripcion: string; archivo: string; color: string }> = {
  inventario: {
    titulo: 'Inventario',
    descripcion: 'Importa el catálogo de artículos desde inventario.csv',
    archivo: 'inventario.csv',
    color: 'border-brand-200 bg-brand-50',
  },
  clientes: {
    titulo: 'Clientes',
    descripcion: 'Importa clientes con su saldo de cuenta desde clientes.csv',
    archivo: 'clientes.csv',
    color: 'border-blue-200 bg-blue-50',
  },
  ventas: {
    titulo: 'Ventas históricas',
    descripcion: 'Importa el historial de ventas desde ventas_detalle.csv',
    archivo: 'ventas_detalle.csv',
    color: 'border-amber-200 bg-amber-50',
  },
};

function CardMigracion({ tipo }: { tipo: TipoMigracion }) {
  const cfg = CONFIG[tipo];
  const fileRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subir() {
    if (!archivo) return;
    const token = useAuthStore.getState().accessToken;
    const empresa = useContextoStore.getState().empresa;
    if (!empresa?.id) { setError('Sin empresa seleccionada'); return; }

    setCargando(true);
    setResultado(null);
    setError(null);

    try {
      const fd = new FormData();
      fd.append('archivo', archivo);

      const res = await fetch(`${BASE_URL}/migracion/${tipo}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-empresa-id': empresa.id,
        },
        body: fd,
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(e.message ?? `Error ${res.status}`);
      }

      const data = await res.json() as ImportResult;
      setResultado(data);
      setArchivo(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className={cn('rounded-xl border-2 p-6 flex flex-col gap-4', cfg.color)}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-body font-semibold text-steel-900">{cfg.titulo}</h3>
          <p className="text-body-sm text-steel-500 mt-0.5">{cfg.descripcion}</p>
        </div>
        <span className="text-caption text-steel-400 font-mono bg-white/70 border border-steel-200 px-2 py-0.5 rounded">
          {cfg.archivo}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex-1">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          <div
            className="flex items-center gap-2 px-4 py-2 bg-white border border-steel-300 rounded-lg cursor-pointer hover:border-brand-400 transition-colors text-body-sm text-steel-600"
            onClick={() => fileRef.current?.click()}
          >
            <FileText className="h-4 w-4 text-steel-400 shrink-0" />
            <span className="truncate">{archivo ? archivo.name : 'Seleccionar archivo .csv'}</span>
          </div>
        </label>
        <Button
          disabled={!archivo || cargando}
          onClick={subir}
          size="sm"
          className="shrink-0"
        >
          {cargando ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Procesando...</>
          ) : (
            <><Upload className="h-3.5 w-3.5" /> Importar</>
          )}
        </Button>
      </div>

      {resultado && (
        <div className="bg-white rounded-lg border border-green-200 p-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-green-700 font-medium text-body-sm">
            <CheckCircle2 className="h-4 w-4" />
            Importación completada
          </div>
          <div className="grid grid-cols-3 gap-2 text-caption text-steel-600">
            <span className="text-center">
              <span className="block text-lg font-bold text-green-700">{resultado.insertados}</span>
              insertados
            </span>
            <span className="text-center">
              <span className="block text-lg font-bold text-blue-600">{resultado.actualizados}</span>
              actualizados
            </span>
            <span className="text-center">
              <span className="block text-lg font-bold text-steel-500">{resultado.omitidos}</span>
              omitidos
            </span>
          </div>
          {resultado.lineas_insertadas !== undefined && (
            <p className="text-caption text-steel-500 text-center">
              {resultado.lineas_insertadas} líneas de carrito importadas
            </p>
          )}
          {resultado.errores.length > 0 && (
            <div className="mt-1 border-t border-steel-100 pt-2">
              <p className="text-caption font-medium text-red-600 mb-1">
                {resultado.errores.length} error(es)
              </p>
              <ul className="text-caption text-red-500 space-y-0.5 max-h-24 overflow-y-auto">
                {resultado.errores.slice(0, 5).map((e, i) => (
                  <li key={i}>Fila {e.fila}: {e.motivo}</li>
                ))}
                {resultado.errores.length > 5 && (
                  <li>…y {resultado.errores.length - 5} más</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-body-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

export default function MigracionPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-title font-bold text-steel-900">Migración de datos</h1>
        <p className="text-body-sm text-steel-500 mt-1">
          Importa datos del sistema anterior. Usa los scripts en{' '}
          <span className="font-mono text-caption bg-steel-100 px-1.5 py-0.5 rounded">
            docs/MIGRACION-SCRIPTS.md
          </span>{' '}
          para generar los archivos CSV.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <CardMigracion tipo="inventario" />
        <CardMigracion tipo="clientes" />
        <CardMigracion tipo="ventas" />
      </div>
    </div>
  );
}
