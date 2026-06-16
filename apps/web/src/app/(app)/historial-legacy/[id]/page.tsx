'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { formatFechaCorta, formatPrecio } from '@/lib/utils';

interface LineaLegacy {
  id: string;
  descripcion_1: string | null;
  descripcion_2: string | null;
  descripcion_3: string | null;
  color: string | null;
  material: string | null;
  cantidad: number;
  precio_neto: number;
  total: number;
}

interface VentaDetalle {
  id: string;
  legacy_id: number;
  sucursal: string;
  cliente_nombre: string | null;
  nota: string | null;
  incidencia: string | null;
  total: number;
  recibido: number;
  cambio: number;
  restan: number;
  estatus: string;
  tipo_pago: string;
  fecha_hora: string;
  lineas: LineaLegacy[];
}

export default function DetalleVentaLegacyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [venta, setVenta] = useState<VentaDetalle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<VentaDetalle>(`/migracion/ventas/${id}`)
      .then(setVenta)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="p-8 text-body-sm text-steel-400">Cargando...</div>;
  }
  if (!venta) {
    return <div className="p-8 text-body-sm text-red-500">Venta no encontrada.</div>;
  }

  const descripcion = (l: LineaLegacy) =>
    [l.descripcion_1, l.descripcion_2, l.descripcion_3, l.color, l.material]
      .filter(Boolean)
      .join(' · ');

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <div className="flex items-center gap-2 text-steel-400">
          <History className="h-4 w-4" />
          <span className="text-body-sm">Historial Legacy</span>
        </div>
      </div>

      {/* Info de la venta */}
      <div className="bg-white rounded-xl border border-steel-200 p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-caption text-steel-500">Fecha</p>
          <p className="text-body font-medium text-steel-900">{formatFechaCorta(venta.fecha_hora)}</p>
        </div>
        <div>
          <p className="text-caption text-steel-500">Cliente</p>
          <p className="text-body font-medium text-steel-900">{venta.cliente_nombre || '—'}</p>
        </div>
        <div>
          <p className="text-caption text-steel-500">Sucursal</p>
          <p className="text-body font-medium text-steel-900">
            {venta.sucursal === 'virgen' ? 'Principal' : 'Punto de Venta'}
          </p>
        </div>
        <div>
          <p className="text-caption text-steel-500">Estatus</p>
          <p className="text-body font-medium text-steel-900">{venta.estatus}</p>
        </div>
        <div>
          <p className="text-caption text-steel-500">Tipo de Pago</p>
          <p className="text-body font-medium text-steel-900">{venta.tipo_pago}</p>
        </div>
        <div>
          <p className="text-caption text-steel-500">Total</p>
          <p className="text-body font-bold text-steel-900">{formatPrecio(venta.total)}</p>
        </div>
        <div>
          <p className="text-caption text-steel-500">Recibido</p>
          <p className="text-body font-medium text-green-700">{formatPrecio(venta.recibido)}</p>
        </div>
        <div>
          <p className="text-caption text-steel-500">Restan</p>
          <p className="text-body font-medium text-amber-700">{formatPrecio(venta.restan)}</p>
        </div>
        {venta.nota && (
          <div className="col-span-2">
            <p className="text-caption text-steel-500">Nota</p>
            <p className="text-body-sm text-steel-700">{venta.nota}</p>
          </div>
        )}
        {venta.incidencia && (
          <div className="col-span-2">
            <p className="text-caption text-steel-500">Incidencia</p>
            <p className="text-body-sm text-steel-700">{venta.incidencia}</p>
          </div>
        )}
      </div>

      {/* Líneas de carrito */}
      <div>
        <h2 className="text-body font-semibold text-steel-900 mb-3">
          Artículos ({venta.lineas.length})
        </h2>
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <table className="w-full text-body-sm">
            <thead className="bg-steel-50 border-b border-steel-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-steel-600">Descripción</th>
                <th className="text-right px-4 py-3 font-medium text-steel-600">Cantidad</th>
                <th className="text-right px-4 py-3 font-medium text-steel-600">Precio</th>
                <th className="text-right px-4 py-3 font-medium text-steel-600">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {venta.lineas.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 text-steel-900">{descripcion(l) || '—'}</td>
                  <td className="px-4 py-3 text-right text-steel-700">{l.cantidad}</td>
                  <td className="px-4 py-3 text-right text-steel-700">{formatPrecio(l.precio_neto)}</td>
                  <td className="px-4 py-3 text-right font-medium text-steel-900">{formatPrecio(l.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-steel-200 bg-steel-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right font-semibold text-steel-900">Total</td>
                <td className="px-4 py-3 text-right font-bold text-steel-900">{formatPrecio(venta.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
