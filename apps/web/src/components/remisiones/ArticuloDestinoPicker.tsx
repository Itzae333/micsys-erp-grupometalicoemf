'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { Articulo, ArticulosPage } from '@/lib/types/api';

function descripcionCompleta(art: Articulo): string {
  return [art.descripcion_1, art.descripcion_2, art.descripcion_3, art.descripcion_4, art.descripcion_5]
    .filter(Boolean).join(' · ');
}

interface Props {
  remisionId: string;
  onSelect: (art: Articulo) => void;
  onClose: () => void;
}

// Busca en el catálogo de la ubicación destino de la remisión (no en el de
// la ubicación activa del usuario) — ver RemisionesService.buscarArticulosDestino.
export function ArticuloDestinoPicker({ remisionId, onSelect, onClose }: Props) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Articulo[]>([]);
  const [loading, setLoading] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const buscar = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: '1', limit: '15' });
      if (query) qp.set('q', query);
      const res = await api.get<ArticulosPage>(`/remisiones/${remisionId}/articulos-destino?${qp}`);
      setResultados(res.data);
    } finally {
      setLoading(false);
    }
  }, [remisionId]);

  useEffect(() => { void buscar(''); }, [buscar]);

  useEffect(() => {
    const t = setTimeout(() => { void buscar(q); }, 300);
    return () => clearTimeout(t);
  }, [q, buscar]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onClose]);

  return (
    <div ref={contenedorRef} className="absolute z-20 mt-1 w-80 bg-white border border-steel-200 rounded-lg shadow-lg">
      <div className="flex items-center gap-2 px-2 py-2 border-b border-steel-100">
        <Search className="h-3.5 w-3.5 text-steel-400 flex-shrink-0" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar en catálogo destino…"
          className="flex-1 text-body-sm outline-none"
        />
        <button onClick={onClose} className="text-steel-300 hover:text-steel-600 flex-shrink-0" aria-label="Cerrar">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-4 text-body-sm text-steel-400 text-center">Buscando…</div>
        ) : resultados.length === 0 ? (
          <div className="px-3 py-4 text-body-sm text-steel-400 text-center">Sin resultados</div>
        ) : (
          resultados.map((art) => (
            <button
              key={art.id}
              onClick={() => onSelect(art)}
              className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors border-b border-steel-50 last:border-b-0"
            >
              <p className="text-body-sm font-medium text-steel-900 leading-tight">
                {descripcionCompleta(art) || art.clave}
              </p>
              <p className="text-meta text-steel-400">{art.clave}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
