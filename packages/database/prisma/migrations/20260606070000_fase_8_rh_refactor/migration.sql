-- Fase 8: RH Refactor
-- Reemplaza TurnoEmpleado por sistema de Áreas con TipoPago (POR_HORA / POR_PIEZA).
-- Actualiza empleados y registros_asistencia con los nuevos campos.

-- ── Nuevo enum TipoPago ──────────────────────────────────────
CREATE TYPE "TipoPago" AS ENUM ('POR_HORA', 'POR_PIEZA');

-- ── Nueva tabla areas ────────────────────────────────────────
CREATE TABLE "areas" (
    "id"                   TEXT         NOT NULL,
    "empresa_id"           TEXT         NOT NULL,
    "nombre"               TEXT         NOT NULL,
    "tipo_pago"            "TipoPago"   NOT NULL DEFAULT 'POR_HORA',
    "activa"               BOOLEAN      NOT NULL DEFAULT true,
    "descuento_por_30min"  DECIMAL(10,2),
    "minimo_piezas_semana" INTEGER,
    "sancion_por_pieza"    DECIMAL(10,2),
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "areas_empresa_id_nombre_key"
    ON "areas"("empresa_id", "nombre");

CREATE INDEX "areas_empresa_id_activa_idx"
    ON "areas"("empresa_id", "activa");

ALTER TABLE "areas"
    ADD CONSTRAINT "areas_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Actualizar empleados ─────────────────────────────────────
-- Quitar columnas del schema viejo
ALTER TABLE "empleados"
    DROP COLUMN "turno",
    DROP COLUMN "num_imss";

-- Agregar nuevas columnas
ALTER TABLE "empleados"
    ADD COLUMN "area_id"    TEXT,
    ADD COLUMN "usuario_id" TEXT;

CREATE UNIQUE INDEX "empleados_usuario_id_key"
    ON "empleados"("usuario_id");

ALTER TABLE "empleados"
    ADD CONSTRAINT "empleados_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "areas"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "empleados"
    ADD CONSTRAINT "empleados_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Actualizar registros_asistencia ─────────────────────────
ALTER TABLE "registros_asistencia"
    ADD COLUMN "area_id"           TEXT,
    ADD COLUMN "minutos_tarde"     INTEGER,
    ADD COLUMN "piezas_realizadas" INTEGER,
    ADD COLUMN "sancion_monto"     DECIMAL(10,2),
    ADD COLUMN "sancion_concepto"  TEXT;

ALTER TABLE "registros_asistencia"
    ADD CONSTRAINT "registros_asistencia_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "areas"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Eliminar enum obsoleto ───────────────────────────────────
DROP TYPE "TurnoEmpleado";
