-- Mover sanciones del área al empleado.
-- El área solo define el tipo de pago; cada empleado tiene sus propios montos de sanción.

-- Quitar sanciones de areas
ALTER TABLE "areas"
    DROP COLUMN IF EXISTS "descuento_por_30min",
    DROP COLUMN IF EXISTS "minimo_piezas_semana",
    DROP COLUMN IF EXISTS "sancion_por_pieza";

-- Agregar sanciones a empleados
ALTER TABLE "empleados"
    ADD COLUMN IF NOT EXISTS "descuento_por_30min"   DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS "minimo_piezas_semana"  INTEGER,
    ADD COLUMN IF NOT EXISTS "sancion_por_pieza"     DECIMAL(10,2);
