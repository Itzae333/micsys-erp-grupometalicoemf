-- Limpieza única: las cotizaciones migran a tablas propias (notas_cotizacion).
-- Las notas_venta legacy con estatus COTIZACION se cancelan en su lugar (no se
-- migran sus datos, solo se retiran para dejar de ensuciar el folio de ventas).
-- Debe correr ANTES de la migración que quita 'COTIZACION' del enum EstatusNota,
-- ya que Postgres no permite recrear el tipo si alguna fila todavía lo referencia.
UPDATE "notas_venta"
SET "estatus" = 'CANCELADA',
    "cancelado_at" = now(),
    "motivo_cancelacion" = 'MIGRACION_COTIZACIONES'
WHERE "estatus" = 'COTIZACION';
