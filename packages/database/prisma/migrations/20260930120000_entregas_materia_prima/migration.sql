-- CreateEnum
CREATE TYPE "EstatusEntregaMateriaPrima" AS ENUM ('ACTIVA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoDevolucionMateriaPrima" AS ENUM ('SOBRANTE', 'DEFECTUOSO', 'MERMA', 'ERROR_ENTREGA');

-- CreateTable
CREATE TABLE "entregas_materia_prima" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ubicacion_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "empleado_id" TEXT,
    "entregado_por" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,
    "estatus" "EstatusEntregaMateriaPrima" NOT NULL DEFAULT 'ACTIVA',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entregas_materia_prima_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas_materia_prima_lineas" (
    "id" TEXT NOT NULL,
    "entrega_id" TEXT NOT NULL,
    "articulo_id" TEXT NOT NULL,
    "existencia_num" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "movimiento_id" TEXT,

    CONSTRAINT "entregas_materia_prima_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devoluciones_materia_prima" (
    "id" TEXT NOT NULL,
    "entrega_id" TEXT NOT NULL,
    "registrada_por" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devoluciones_materia_prima_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devoluciones_materia_prima_lineas" (
    "id" TEXT NOT NULL,
    "devolucion_id" TEXT NOT NULL,
    "entrega_linea_id" TEXT NOT NULL,
    "tipo" "TipoDevolucionMateriaPrima" NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "movimiento_id" TEXT,

    CONSTRAINT "devoluciones_materia_prima_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entregas_materia_prima_ubicacion_id_fecha_idx" ON "entregas_materia_prima"("ubicacion_id", "fecha");

-- CreateIndex
CREATE INDEX "entregas_materia_prima_area_id_fecha_idx" ON "entregas_materia_prima"("area_id", "fecha");

-- CreateIndex
CREATE INDEX "entregas_materia_prima_empleado_id_fecha_idx" ON "entregas_materia_prima"("empleado_id", "fecha");

-- CreateIndex
CREATE INDEX "entregas_materia_prima_lineas_entrega_id_idx" ON "entregas_materia_prima_lineas"("entrega_id");

-- CreateIndex
CREATE INDEX "entregas_materia_prima_lineas_articulo_id_idx" ON "entregas_materia_prima_lineas"("articulo_id");

-- CreateIndex
CREATE INDEX "devoluciones_materia_prima_entrega_id_idx" ON "devoluciones_materia_prima"("entrega_id");

-- CreateIndex
CREATE INDEX "devoluciones_materia_prima_lineas_devolucion_id_idx" ON "devoluciones_materia_prima_lineas"("devolucion_id");

-- CreateIndex
CREATE INDEX "devoluciones_materia_prima_lineas_entrega_linea_id_idx" ON "devoluciones_materia_prima_lineas"("entrega_linea_id");

-- AddForeignKey
ALTER TABLE "entregas_materia_prima" ADD CONSTRAINT "entregas_materia_prima_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_materia_prima" ADD CONSTRAINT "entregas_materia_prima_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_materia_prima" ADD CONSTRAINT "entregas_materia_prima_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_materia_prima" ADD CONSTRAINT "entregas_materia_prima_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_materia_prima" ADD CONSTRAINT "entregas_materia_prima_entregado_por_fkey" FOREIGN KEY ("entregado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_materia_prima_lineas" ADD CONSTRAINT "entregas_materia_prima_lineas_entrega_id_fkey" FOREIGN KEY ("entrega_id") REFERENCES "entregas_materia_prima"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_materia_prima_lineas" ADD CONSTRAINT "entregas_materia_prima_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_materia_prima" ADD CONSTRAINT "devoluciones_materia_prima_entrega_id_fkey" FOREIGN KEY ("entrega_id") REFERENCES "entregas_materia_prima"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_materia_prima" ADD CONSTRAINT "devoluciones_materia_prima_registrada_por_fkey" FOREIGN KEY ("registrada_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_materia_prima_lineas" ADD CONSTRAINT "devoluciones_materia_prima_lineas_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones_materia_prima"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones_materia_prima_lineas" ADD CONSTRAINT "devoluciones_materia_prima_lineas_entrega_linea_id_fkey" FOREIGN KEY ("entrega_linea_id") REFERENCES "entregas_materia_prima_lineas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

