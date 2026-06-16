'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Plus, Trash2, ArrowRight, Send, Save } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Articulo {
  id: string;
  clave: string;
  descripcion_1: string | null;
  descripcion_2: string | null;
  existencia_1: number | null;
  existencia_2: number | null;
  existencia_3: number | null;
  existencia_4: number | null;
  existencia_5: number | null;
}

interface ArticulosPage { data: Articulo[] }

interface EmpresaDestino {
  id: string;
  nombre: string;
  ubicaciones: { id: string; nombre: string; tipo: string }[];
}

interface LineaCarrito {
  articulo: Articulo;
  cantidad: number;
  slot_origen: number;
  slot_destino: number;
}

export default function NuevaRemisionPage() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const { empresa, ubicacion } = useContextoStore();

  const [destinos, setDestinos]           = useState<EmpresaDestino[]>([]);
  const [empresaDstId, setEmpresaDstId]   = useState('');
  const [ubDestinoId, setUbDestinoId]     = useState('');
  const [concepto, setConcepto]           = useState('');
  const [lineas, setLineas]               = useState<LineaCarrito[]>([]);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // Buscador artículos
  const [q, setQ]                 = useState('');
  const [suggestions, setSugg]    = useState<Articulo[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef                 = useRef<HTMLDivElement>(null);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  const empresaDst = destinos.find((e) => e.id === empresaDstId);

  useEffect(() => {
    void api.get<EmpresaDestino[]>('/remisiones/destinos').then(setDestinos);
  }, []);

  // Close suggestion dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSugg([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchArticulos = useCallback(async (term: string) => {
    if (!empresa || term.length < 2) { setSugg([]); return; }
    setSearching(true);
    try {
      const res = await api.get<ArticulosPage>(`/articulos?q=${encodeURIComponent(term)}&limit=8`);
      setSugg(res.data.filter((a) => !lineas.find((l) => l.articulo.id === a.id)));
    } finally {
      setSearching(false);
    }
  }, [empresa, lineas]);

  const onSearchChange = (val: string) => {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void searchArticulos(val), 250);
  };

  const addLinea = (art: Articulo) => {
    setLineas((prev) => [...prev, { articulo: art, cantidad: 1, slot_origen: 1, slot_destino: 1 }]);
    setSugg([]);
    setQ('');
  };

  const removeLinea = (idx: number) => setLineas((prev) => prev.filter((_, i) => i !== idx));

  const updateLinea = (idx: number, patch: Partial<LineaCarrito>) =>
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  async function guardar(enviar: boolean) {
    if (!empresa || !ubicacion) return;
    if (!empresaDstId || !ubDestinoId) { setError('Selecciona empresa y ubicación de destino'); return; }
    if (!lineas.length) { setError('Agrega al menos un artículo'); return; }
    setError(null);
    setSaving(true);
    try {
      const body = {
        empresa_origen_id:  empresa.id,
        ub_origen_id:       ubicacion.id,
        empresa_destino_id: empresaDstId,
        ub_destino_id:      ubDestinoId,
        concepto:           concepto || undefined,
        lineas: lineas.map((l) => ({
          articulo_id:    l.articulo.id,
          articulo_clave: l.articulo.clave,
          slot_origen:    l.slot_origen,
          slot_destino:   l.slot_destino,
          cantidad:       l.cantidad,
        })),
      };

      const rem = await api.post<{ id: string }>('/remisiones', body);

      if (enviar) {
        await api.patch(`/remisiones/${rem.id}/enviar`, {});
      }

      router.push(`/movimientos/remisiones/${rem.id}`);
    } catch (err: any) {
      setError(err?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const SLOTS = [1, 2, 3, 4, 5];

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-steel-500 hover:text-steel-900 transition-colors">
          ←
        </button>
        <div>
          <h1 className="text-display-sm font-bold text-steel-900">Nueva remisión</h1>
          <p className="text-body-sm text-steel-500">Movimiento de inventario entre ubicaciones</p>
        </div>
      </div>

      {/* Origen → Destino */}
      <div className="bg-white border border-steel-200 rounded-xl p-5 space-y-4">
        <h2 className="text-body font-semibold text-steel-800">Ruta</h2>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
          {/* Origen (readonly) */}
          <div className="space-y-1">
            <p className="text-meta font-medium text-steel-500 uppercase tracking-wide">Origen</p>
            <div className="bg-steel-50 border border-steel-200 rounded-lg px-3 py-2.5">
              <p className="text-body-sm font-semibold text-steel-800">{empresa?.nombre ?? '—'}</p>
              <p className="text-meta text-steel-500">{ubicacion?.nombre ?? '—'}</p>
            </div>
          </div>

          <div className="hidden md:flex items-center justify-center pt-8">
            <ArrowRight className="h-5 w-5 text-steel-400" />
          </div>

          {/* Destino (selectable) */}
          <div className="space-y-2">
            <p className="text-meta font-medium text-steel-500 uppercase tracking-wide">Destino</p>
            <select
              value={empresaDstId}
              onChange={(e) => { setEmpresaDstId(e.target.value); setUbDestinoId(''); }}
              className="w-full border border-steel-300 rounded-lg px-3 py-2 text-body-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Empresa destino…</option>
              {destinos.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
            {empresaDst && (
              <select
                value={ubDestinoId}
                onChange={(e) => setUbDestinoId(e.target.value)}
                className="w-full border border-steel-300 rounded-lg px-3 py-2 text-body-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Ubicación destino…</option>
                {empresaDst.ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Concepto */}
        <div>
          <label className="text-meta font-medium text-steel-600 block mb-1">Concepto (opcional)</label>
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej. Reposición de stock, transferencia mensual…"
          />
        </div>
      </div>

      {/* Artículos */}
      <div className="bg-white border border-steel-200 rounded-xl p-5 space-y-4">
        <h2 className="text-body font-semibold text-steel-800">Artículos</h2>

        {/* Buscador */}
        <div className="relative" ref={searchRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
            <input
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar artículo por clave o descripción…"
              className="w-full pl-9 pr-4 py-2 border border-steel-300 rounded-lg text-body-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {q && (
              <button onClick={() => { setQ(''); setSugg([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {(suggestions.length > 0 || searching) && (
            <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-steel-200 rounded-xl shadow-lg overflow-hidden">
              {searching && <div className="px-4 py-3 text-body-sm text-steel-400">Buscando…</div>}
              {suggestions.map((art) => (
                <button
                  key={art.id}
                  onClick={() => addLinea(art)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-steel-50 text-left transition-colors"
                >
                  <Plus className="h-4 w-4 text-brand-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-steel-800 truncate">{art.clave}</p>
                    <p className="text-meta text-steel-500 truncate">{art.descripcion_1}</p>
                  </div>
                  <span className="text-meta text-steel-400 flex-shrink-0">Exi: {Number(art.existencia_1 ?? 0)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabla de líneas */}
        {lineas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100">
                  <th className="text-left py-2 pr-4 font-medium text-steel-600">Artículo</th>
                  <th className="text-center py-2 px-2 font-medium text-steel-600 w-28">Slot origen</th>
                  <th className="text-center py-2 px-2 font-medium text-steel-600 w-28">Slot destino</th>
                  <th className="text-center py-2 px-2 font-medium text-steel-600 w-28">Cantidad</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {lineas.map((linea, idx) => (
                  <tr key={`${linea.articulo.id}-${idx}`}>
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-steel-800">{linea.articulo.clave}</p>
                      <p className="text-meta text-steel-500 truncate max-w-[200px]">{linea.articulo.descripcion_1}</p>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <select
                        value={linea.slot_origen}
                        onChange={(e) => updateLinea(idx, { slot_origen: Number(e.target.value) })}
                        className="border border-steel-300 rounded px-2 py-1 text-body-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        {SLOTS.map((s) => <option key={s} value={s}>Slot {s}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <select
                        value={linea.slot_destino}
                        onChange={(e) => updateLinea(idx, { slot_destino: Number(e.target.value) })}
                        className="border border-steel-300 rounded px-2 py-1 text-body-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        {SLOTS.map((s) => <option key={s} value={s}>Slot {s}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="number"
                        min={0.001}
                        step={0.001}
                        value={linea.cantidad}
                        onChange={(e) => updateLinea(idx, { cantidad: Number(e.target.value) })}
                        className="w-24 border border-steel-300 rounded px-2 py-1 text-body-sm text-center focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </td>
                    <td className="py-2.5 text-right">
                      <button onClick={() => removeLinea(idx)} className="text-steel-400 hover:text-red-500 transition-colors p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!lineas.length && (
          <p className="text-body-sm text-steel-400 text-center py-6">
            Busca artículos para agregarlos a la remisión
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-body-sm text-red-700">
          {error}
        </div>
      )}

      {/* Acciones */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Button variant="ghost" onClick={() => router.back()} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="outline" onClick={() => guardar(false)} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Guardar borrador
        </Button>
        <Button onClick={() => guardar(true)} disabled={saving}>
          <Send className="h-3.5 w-3.5 mr-1.5" />
          {saving ? 'Guardando…' : 'Guardar y enviar'}
        </Button>
      </div>
    </div>
  );
}
