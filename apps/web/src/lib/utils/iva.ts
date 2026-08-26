// IVA opcional por venta — tasa fija, no todos los clientes lo requieren.
export const IVA_TASA = 0.16;

export function calcularIva(subtotal: number, aplica: boolean): number {
  return aplica ? +(subtotal * IVA_TASA).toFixed(2) : 0;
}
