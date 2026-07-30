'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatPrecio } from '@/lib/utils';
import type { NotaVenta } from '@/lib/types/api';

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
};

/**
 * Etiqueta junto al badge de estatus para notas que nacieron de liquidar un
 * pedido — el estatus se queda como PAGADA normal, esto solo lo marca aparte
 * (ver conversación: no se agregó un estatus nuevo a propósito).
 */
export function PedidoOrigenTag({ pedidoOrigen }: { pedidoOrigen: NonNullable<NotaVenta['pedido_origen']> }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const folioStr = String(pedidoOrigen.folio).padStart(4, '0');

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Esta venta viene de liquidar un pedido — ver historial de anticipos"
        className="inline-flex items-center gap-1 text-meta text-brand-600 hover:text-brand-700 hover:underline"
      >
        <Package className="h-3 w-3" />
        Pedido #{folioStr}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Pedido de origen #${folioStr}`} size="sm">
        <div className="space-y-3">
          <p className="text-body-sm text-steel-500">
            Esta venta se generó al liquidar este pedido — parte de su dinero ya
            se reportó antes, en el corte del día de cada anticipo.
          </p>
          <div>
            <p className="text-meta font-medium text-steel-500 uppercase tracking-wide mb-1.5">Historial de anticipos</p>
            <div className="divide-y divide-steel-100 border border-steel-200 rounded-lg overflow-hidden">
              {pedidoOrigen.anticipos.length === 0 ? (
                <p className="p-3 text-body-sm text-steel-400 text-center">Sin anticipos registrados</p>
              ) : (
                pedidoOrigen.anticipos.map((a, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-body-sm">
                    <div>
                      <p className="text-steel-700">{METODO_LABEL[a.metodo] ?? a.metodo}</p>
                      <p className="text-meta text-steel-400">
                        {new Date(a.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {a.referencia ? ` · Ref. ${a.referencia}` : ''}
                      </p>
                    </div>
                    <span className="font-semibold text-steel-900">{formatPrecio(a.monto)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => { setOpen(false); router.push('/pedidos'); }}
          >
            Buscar pedido #{folioStr} en Pedidos
          </Button>
        </div>
      </Dialog>
    </>
  );
}
