'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { Cliente } from '@/lib/types/api';

function clienteLabel(c: Cliente): string {
  return c.razon_social ?? `${c.nombre}${c.apellidos ? ` ${c.apellidos}` : ''}`;
}

// Sin acentos ni mayúsculas: "jose" encuentra "José", "MARTINEZ" a "Martinez".
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Props {
  clientes: Cliente[];
  value: string;
  // Segundo argumento: el cliente elegido, por si vino del servidor y no estaba
  // en `clientes` (lista local incompleta o desactualizada).
  onChange: (clienteId: string, cliente?: Cliente) => void;
  placeholder?: string;
  disabled?: boolean;
}

const MAX_RESULTADOS = 50;

// Selector de cliente con buscador: escribe para filtrar por palabras (nombre,
// apellidos, razón social o teléfono) en vez de recorrer una lista larga.
export function ClienteCombobox({
  clientes, value, onChange, placeholder = 'Público en general', disabled,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [activo, setActivo] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // Clientes encontrados en el servidor al escribir — complementan la lista
  // local, que puede estar incompleta o desactualizada.
  const [remotos, setRemotos] = useState<Cliente[]>([]);
  const [buscandoRemoto, setBuscandoRemoto] = useState(false);

  const seleccionado = clientes.find((c) => c.id === value) ?? remotos.find((c) => c.id === value) ?? null;

  useEffect(() => {
    const texto = q.trim();
    if (!abierto || texto.length < 2) { setRemotos([]); return; }
    let cancelado = false;
    const t = setTimeout(async () => {
      setBuscandoRemoto(true);
      try {
        const res = await api.get<Cliente[]>(`/clientes?q=${encodeURIComponent(texto)}`);
        if (!cancelado) setRemotos(res);
      } catch {
        // Sin conexión: se queda con la lista local.
        if (!cancelado) setRemotos([]);
      } finally {
        if (!cancelado) setBuscandoRemoto(false);
      }
    }, 300);
    return () => { cancelado = true; clearTimeout(t); };
  }, [q, abierto]);

  const resultados = useMemo(() => {
    const words = normalizar(q).split(/\s+/).filter(Boolean);
    const locales = words.length
      ? clientes.filter((c) => {
          const texto = normalizar(`${clienteLabel(c)} ${c.nombre} ${c.apellidos ?? ''} ${c.telefono ?? ''}`);
          return words.every((w) => texto.includes(w));
        })
      : clientes;
    // Los del servidor se suman sin repetir los que ya estaban en la lista local.
    const ids = new Set(locales.map((c) => c.id));
    const lista = words.length ? [...locales, ...remotos.filter((c) => !ids.has(c.id))] : locales;
    return lista.slice(0, MAX_RESULTADOS);
  }, [clientes, remotos, q]);

  // Con el buscador vacío, la primera opción es quitar el cliente.
  const opciones: { id: string; label: string; cliente?: Cliente }[] = useMemo(
    () => [
      ...(q.trim() ? [] : [{ id: '', label: placeholder }]),
      ...resultados.map((c) => ({ id: c.id, label: clienteLabel(c), cliente: c })),
    ],
    [resultados, q, placeholder],
  );

  useEffect(() => { setActivo(0); }, [q, abierto]);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setQ('');
      }
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-idx="${activo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activo]);

  function elegir(id: string, cliente?: Cliente) {
    onChange(id, cliente);
    setAbierto(false);
    setQ('');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setActivo((i) => Math.min(i + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (abierto && opciones[activo]) { e.preventDefault(); elegir(opciones[activo].id, opciones[activo].cliente); }
    } else if (e.key === 'Escape') {
      if (abierto) { e.stopPropagation(); setAbierto(false); setQ(''); }
    }
  }

  return (
    <div ref={contenedorRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400 pointer-events-none" />
        <input
          type="text"
          disabled={disabled}
          // Abierto muestra lo que se escribe; cerrado, el cliente elegido.
          value={abierto ? q : seleccionado ? clienteLabel(seleccionado) : ''}
          placeholder={abierto && seleccionado ? clienteLabel(seleccionado) : placeholder}
          onFocus={() => setAbierto(true)}
          onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={abierto}
          aria-label="Buscar cliente"
          autoComplete="off"
          className={cn(
            'w-full h-10 pl-9 pr-16 rounded-lg border border-steel-300 bg-white text-body text-steel-900',
            'placeholder:text-steel-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
            'disabled:opacity-50',
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {seleccionado && !disabled && (
            <button
              type="button"
              onClick={() => elegir('')}
              className="text-steel-400 hover:text-steel-700 p-1"
              aria-label="Quitar cliente"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 text-steel-400 pointer-events-none" />
        </div>
      </div>

      {abierto && (
        <div
          ref={listaRef}
          className="absolute z-20 mt-1 w-full bg-white border border-steel-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {opciones.length === 0 ? (
            <p className="px-3 py-3 text-body-sm text-steel-400">
              {buscandoRemoto ? 'Buscando…' : 'Sin clientes que coincidan'}
            </p>
          ) : (
            opciones.map((o, i) => (
              <button
                key={o.id || '__publico'}
                type="button"
                data-idx={i}
                // mousedown evita que el input pierda foco antes de registrar el clic
                onMouseDown={(e) => { e.preventDefault(); elegir(o.id, o.cliente); }}
                onMouseEnter={() => setActivo(i)}
                className={cn(
                  'w-full text-left px-3 py-2 text-body-sm border-b border-steel-100 last:border-0',
                  i === activo ? 'bg-brand-50' : 'hover:bg-steel-50',
                  o.id === value ? 'font-semibold text-steel-900' : 'text-steel-700',
                  o.id === '' && 'text-steel-500 italic',
                )}
              >
                {o.label}
              </button>
            ))
          )}
          {!q.trim() && clientes.length > MAX_RESULTADOS && (
            <p className="px-3 py-2 text-meta text-steel-400 bg-steel-50">
              Escribe para buscar entre {clientes.length} clientes
            </p>
          )}
        </div>
      )}
    </div>
  );
}
