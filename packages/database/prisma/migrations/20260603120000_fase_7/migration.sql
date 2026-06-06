-- Fase 7: Recursos Humanos
-- Empleados, RegistroAsistencia, OrdenProduccion

-- Enums
CREATE TYPE "TurnoEmpleado" AS ENUM ('MATUTINO', 'VESPERTINO', 'NOCTURNO', 'MIXTO');
CREATE TYPE "EstatusAsistencia" AS ENUM ('PRESENTE', 'AUSENTE', 'TARDANZA', 'PERMISO', 'VACACIONES');
CREATE TYPE "EstatusProduccion" AS ENUM ('ABIERTA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA');

-- Empleados
CREATE TABLE "empleados" (
    "id"             TEXT         NOT NULL,
    "empresa_id"     TEXT         NOT NULL,
    "nombre"         TEXT         NOT NULL,
    "apellidos"      TEXT         NOT NULL,
    "puesto"         TEXT         NOT NULL,
    "turno"          "TurnoEmpleado" NOT NULL,
    "salario_diario" DECIMAL(12,2) NOT NULL,
    "num_imss"       TEXT,
    "telefono"       TEXT,
    "fecha_ingreso"  DATE         NOT NULL,
    "activo"         BOOLEAN      NOT NULL DEFAULT true,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empleados_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "empleados_empresa_id_activo_idx" ON "empleados"("empresa_id", "activo");

ALTER TABLE "empleados"
    ADD CONSTRAINT "empleados_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Registros de Asistencia
CREATE TABLE "registros_asistencia" (
    "id"            TEXT              NOT NULL,
    "empresa_id"    TEXT              NOT NULL,
    "empleado_id"   TEXT              NOT NULL,
    "fecha"         DATE              NOT NULL,
    "hora_entrada"  TIMESTAMP(3),
    "hora_salida"   TIMESTAMP(3),
    "estatus"       "EstatusAsistencia" NOT NULL DEFAULT 'PRESENTE',
    "observaciones" TEXT,
    "usuario_id"    TEXT              NOT NULL,
    "created_at"    TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "registros_asistencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registros_asistencia_empleado_id_fecha_key"
    ON "registros_asistencia"("empleado_id", "fecha");

CREATE INDEX "registros_asistencia_empresa_id_fecha_idx"
    ON "registros_asistencia"("empresa_id", "fecha");

ALTER TABLE "registros_asistencia"
    ADD CONSTRAINT "registros_asistencia_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "registros_asistencia"
    ADD CONSTRAINT "registros_asistencia_empleado_id_fkey"
    FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "registros_asistencia"
    ADD CONSTRAINT "registros_asistencia_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Órdenes de Producción
CREATE TABLE "ordenes_produccion" (
    "id"                 TEXT              NOT NULL,
    "folio"              INTEGER           NOT NULL,
    "empresa_id"         TEXT              NOT NULL,
    "articulo_id"        TEXT              NOT NULL,
    "existencia_num"     INTEGER           NOT NULL DEFAULT 1,
    "cantidad_objetivo"  DECIMAL(12,3)     NOT NULL,
    "cantidad_producida" DECIMAL(12,3)     NOT NULL DEFAULT 0,
    "estatus"            "EstatusProduccion" NOT NULL DEFAULT 'ABIERTA',
    "fecha_inicio"       DATE              NOT NULL,
    "fecha_cierre"       TIMESTAMP(3),
    "observaciones"      TEXT,
    "usuario_id"         TEXT              NOT NULL,
    "created_at"         TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "ordenes_produccion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ordenes_produccion_empresa_id_folio_key"
    ON "ordenes_produccion"("empresa_id", "folio");

CREATE INDEX "ordenes_produccion_empresa_id_estatus_created_at_idx"
    ON "ordenes_produccion"("empresa_id", "estatus", "created_at");

ALTER TABLE "ordenes_produccion"
    ADD CONSTRAINT "ordenes_produccion_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ordenes_produccion"
    ADD CONSTRAINT "ordenes_produccion_articulo_id_fkey"
    FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ordenes_produccion"
    ADD CONSTRAINT "ordenes_produccion_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
