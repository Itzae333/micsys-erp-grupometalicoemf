import { Badge } from '@/components/ui/badge';

const CONFIG: Record<'PENDIENTE' | 'COMPLETA' | 'INCOMPLETA', { label: string; variant: 'pending' | 'cargada' | 'incomplete' }> = {
  PENDIENTE: { label: 'Pendiente', variant: 'pending' },
  COMPLETA: { label: 'Entregada', variant: 'cargada' },
  INCOMPLETA: { label: 'Entrega incompleta', variant: 'incomplete' },
};

/**
 * Estatus de entrega de mercancía — independiente del estatus de pago (una
 * nota puede seguir en Crédito y ya estar entregada). Se muestra aparte del
 * badge principal, nunca lo reemplaza. `null` (nunca se le registró una
 * carga) se muestra como "Pendiente" siempre, sin excepción.
 */
export function EstatusEntregaTag({ estatusEntrega }: { estatusEntrega: 'COMPLETA' | 'INCOMPLETA' | null }) {
  const cfg = CONFIG[estatusEntrega ?? 'PENDIENTE'];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
