'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText, Package, Users, Truck, UserCog, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useContextoStore } from '@/lib/store/contexto.store';

interface SearchResult {
  tipo: string;
  id: string;
  label: string;
  sub: string;
  href: string;
}

const TIPO_ICON: Record<string, React.ReactNode> = {
  nota:      <FileText className="h-4 w-4 text-brand-500" />,
  articulo:  <Package  className="h-4 w-4 text-amber-500" />,
  cliente:   <Users    className="h-4 w-4 text-green-500" />,
  proveedor: <Truck    className="h-4 w-4 text-purple-500" />,
  empleado:  <UserCog  className="h-4 w-4 text-blue-500" />,
};

const TIPO_LABEL: Record<string, string> = {
  nota: 'Nota', articulo: 'Artículo', cliente: 'Cliente',
  proveedor: 'Proveedor', empleado: 'Empleado',
};

export function GlobalSearch() {
  const router = useRouter();
  const { empresa } = useContextoStore();

  const [open, setOpen]         = useState(false);
  const [q, setQ]               = useState('');
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(0);

  const inputRef  = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abrir con Cmd/Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQ('');
      setResults([]);
      setSelected(0);
    }
  }, [open]);

  const buscar = useCallback(async (term: string) => {
    if (!empresa?.id || term.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await api.get<{ results: SearchResult[] }>(
        `/search?q=${encodeURIComponent(term)}&limit=6`,
      );
      setResults(data.results);
      setSelected(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [empresa?.id]);

  function onInput(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void buscar(value), 250);
  }

  function navigate(href: string) {
    router.push(href);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      navigate(results[selected].href);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-steel-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-steel-100">
          <Search className="h-4 w-4 text-steel-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar notas, artículos, clientes, proveedores, empleados…"
            className="flex-1 text-body text-steel-900 placeholder:text-steel-400 bg-transparent outline-none"
          />
          {loading && (
            <div className="h-4 w-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          {!loading && q && (
            <button onClick={() => { setQ(''); setResults([]); }} className="text-steel-400 hover:text-steel-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Resultados */}
        {results.length > 0 ? (
          <ul className="max-h-80 overflow-y-auto py-1">
            {results.map((r, i) => (
              <li key={`${r.tipo}-${r.id}`}>
                <button
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selected ? 'bg-brand-50' : 'hover:bg-steel-50'
                  }`}
                  onClick={() => navigate(r.href)}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span className="flex-shrink-0">{TIPO_ICON[r.tipo] ?? <Search className="h-4 w-4" />}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-body-sm font-medium text-steel-900 truncate">{r.label}</span>
                    {r.sub && <span className="block text-meta text-steel-400 truncate">{r.sub}</span>}
                  </span>
                  <span className="text-meta text-steel-300 flex-shrink-0">{TIPO_LABEL[r.tipo]}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : q.length >= 2 && !loading ? (
          <div className="px-4 py-6 text-center text-body-sm text-steel-400">
            Sin resultados para &ldquo;{q}&rdquo;
          </div>
        ) : q.length === 0 ? (
          <div className="px-4 py-4 text-center text-meta text-steel-400">
            Escribe al menos 2 caracteres para buscar
          </div>
        ) : null}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-steel-100 flex items-center gap-4 text-meta text-steel-400">
          <span><kbd className="bg-steel-100 px-1 rounded text-[10px]">↑↓</kbd> navegar</span>
          <span><kbd className="bg-steel-100 px-1 rounded text-[10px]">↵</kbd> abrir</span>
          <span><kbd className="bg-steel-100 px-1 rounded text-[10px]">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}
