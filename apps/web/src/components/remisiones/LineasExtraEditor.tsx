'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ArticuloDestinoPicker } from './ArticuloDestinoPicker';
import type { Articulo } from '@/lib/types/api';

export interface LineaExtra {
  articulo: Articulo;
  cantidad: number;
  slot_destino: number;
}

function descripcion(art: Articulo): string {
  return [art.descripcion_1, art.descripcion_2, art.descripcion_3, art.descripcion_4, art.descripcion_5]
    .filter(Boolean).join(' · ') || art.clave;
}

interface Props {
  // Sin remisionId busca en el inventario de la ubicación activa.
  remisionId?: string;
  lineas: LineaExtra[];
  onChange: (lineas: LineaExtra[]) => void;
  titulo?: string;
  ayuda?: string;
  disabled?: boolean;
}

// Productos que llegaron y no venían en la remisión: se eligen del inventario
// del destino y solo afectan su existencia.
export function LineasExtraEditor({
  remisionId, lineas, onChange, disabled,
  titulo = 'Productos no listados en la remisión',
  ayuda = 'Agrega lo que llegó y no venía en la remisión. Entra solo al inventario de este destino.',
}: Props) {
  const [picker, setPicker] = useState(false);

  function agregar(art: Articulo) {
    setPicker(false);
    const existente = lineas.find((l) => l.articulo.id === art.id);
    if (existente) {
      onChange(lineas.map((l) => (l.articulo.id === art.id ? { ...l, cantidad: l.cantidad + 1 } : l)));
      return;
    }
    onChange([...lineas, { articulo: art, cantidad: 1, slot_destino: 1 }]);
  }

  const actualizar = (idx: number, patch: Partial<LineaExtra>) =>
    onChange(lineas.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  return (
    <div className="px-4 py-3 border-t border-steel-100 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-body-sm font-medium text-steel-700">{titulo}</p>
          <p className="text-meta text-steel-500">{ayuda}</p>
        </div>
        <div className="relative flex-shrink-0">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPicker((v) => !v)}
            className="inline-flex items-center gap-1 text-body-sm text-brand-600 hover:underline disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar producto
          </button>
          {picker && (
            <div className="absolute right-0">
              <ArticuloDestinoPicker
                remisionId={remisionId}
                onClose={() => setPicker(false)}
                onSelect={agregar}
              />
            </div>
          )}
        </div>
      </div>

      {lineas.length > 0 && (
        <table className="w-full text-body-sm">
          <tbody className="divide-y divide-steel-100">
            {lineas.map((l, idx) => (
              <tr key={l.articulo.id}>
                <td className="py-2 pr-2">
                  <p className="font-semibold text-steel-900 leading-tight">{descripcion(l.articulo)}</p>
                  <p className="text-meta text-steel-400">{l.articulo.clave}</p>
                </td>
                <td className="py-2 px-2 text-right">
                  <select
                    value={l.slot_destino}
                    onChange={(e) => actualizar(idx, { slot_destino: Number(e.target.value) })}
                    disabled={disabled}
                    className="border border-steel-300 rounded px-1 py-1 text-meta"
                    aria-label="Existencia"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>Exist. {n}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 px-2 text-right">
                  <input
                    type="number"
                    min={0.001}
                    step={0.001}
                    value={l.cantidad}
                    disabled={disabled}
                    onChange={(e) => actualizar(idx, { cantidad: Number(e.target.value) })}
                    className="w-20 border border-steel-300 rounded px-2 py-1 text-right text-body-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </td>
                <td className="py-2 pl-2 text-right">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(lineas.filter((_, i) => i !== idx))}
                    className="text-steel-300 hover:text-red-600"
                    aria-label="Quitar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
