'use client';

import { useState } from 'react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import type { NotaVentaLinea } from '@/lib/types/api';

type ArticuloLinea = NonNullable<NotaVentaLinea['articulo']>;

/** Artículos especiales (uso único) de la nota que siguen visibles en el inventario. */
export function especialesPendientes(lineas: NotaVentaLinea[] | undefined): ArticuloLinea[] {
  const vistos = new Map<string, ArticuloLinea>();
  for (const l of lineas ?? []) {
    const a = l.articulo;
    if (a?.es_especial && !a.oculto) vistos.set(a.id, a);
  }
  return [...vistos.values()];
}

interface Props {
  articulos: ArticuloLinea[];
  onClose: () => void;
}

// Al terminar la venta pregunta si se quieren ocultar del inventario los
// productos especiales. Ocultar no borra nada: conserva la nota y el kardex.
export function OcultarEspecialesDialog({ articulos, onClose }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ocultar() {
    setSaving(true);
    setError(null);
    try {
      for (const a of articulos) await api.patch(`/articulos/${a.id}/ocultar`, {});
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ocultar el producto');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={articulos.length > 0}
      onClose={onClose}
      title="¿Ocultar producto especial del inventario?"
      size="sm"
    >
      <p className="text-body text-steel-600 mb-3">
        Esta nota incluye {articulos.length === 1 ? 'un producto especial' : 'productos especiales'} de uso único.
        Puedes ocultarlo del inventario; la venta y su historial se conservan.
      </p>
      <ul className="mb-4 space-y-1">
        {articulos.map((a) => (
          <li key={a.id} className="text-body-sm text-steel-800">
            <strong>{a.clave}</strong>
            {a.descripcion_1 ? ` — ${a.descripcion_1}` : ''}
          </li>
        ))}
      </ul>
      {error && (
        <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2 mb-4">
          <p className="text-body-sm text-brand-600">{error}</p>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Mantener en inventario</Button>
        <Button type="button" loading={saving} onClick={ocultar}>Sí, ocultar</Button>
      </DialogFooter>
    </Dialog>
  );
}
