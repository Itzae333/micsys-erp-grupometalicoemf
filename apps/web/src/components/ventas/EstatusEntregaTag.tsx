import { Badge } from '@/components/ui/badge';

const CONFIG: Record<'PENDIENTE' | 'COMPLETA' | 'INCOMPLETA', { label: string; variant: 'pending' | 'cargada' | 'incomplete' }> = {
  PENDIENTE: { label: 'Pendiente', variant: 'pending' },
  COMPLETA: { label: 'Entregada', variant: 'cargada' },
  INCOMPLETA: { label: 'Entrega incompleta', variant: 'incomplete' },
};

// Mismo criterio que ESTATUS_CON_CARGA_PERMITIDA en cargas-nota.service.ts —
// solo en estos estatus de pago tiene sentido hablar de entrega. Una nota
// ABIERTA (carrito sin cerrar) o CANCELADA nunca puede tener una carga.
const ESTATUS_CON_ENTREGA_APLICABLE = ['PAGADA', 'CREDITO'];

/**
 * Estatus de entrega de mercancía — independiente del estatus de pago (una
 * nota puede seguir en Crédito y ya estar entregada). Se muestra aparte del
 * badge principal, nunca lo reemplaza. `null` (nunca se le registró una
 * carga) se muestra como "Pendiente" — pero solo si la nota ya está en un
 * estatus donde registrar una carga es posible; si no, no se muestra nada.
 */
export function EstatusEntregaTag({
  estatus,
  estatusEntrega,
}: {
  estatus: string;
  estatusEntrega: 'COMPLETA' | 'INCOMPLETA' | null;
}) {
  if (estatusEntrega === null && !ESTATUS_CON_ENTREGA_APLICABLE.includes(estatus)) {
    return null;
  }
  const cfg = CONFIG[estatusEntrega ?? 'PENDIENTE'];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
