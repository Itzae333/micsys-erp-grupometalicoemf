-- CreateEnum
CREATE TYPE "EstatusRemision" AS ENUM ('BORRADOR', 'EN_TRANSITO', 'RECIBIDA_COMPLETA', 'RECIBIDA_PARCIAL', 'CANCELADA');

-- CreateTable
CREATE TABLE "remisiones" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "empresa_origen_id" TEXT NOT NULL,
    "ub_origen_id" TEXT NOT NULL,
    "empresa_destino_id" TEXT NOT NULL,
    "ub_destino_id" TEXT NOT NULL,
    "estatus" "EstatusRemision" NOT NULL DEFAULT 'BORRADOR',
    "concepto" TEXT,
    "notas" TEXT,
    "creado_por_id" TEXT NOT NULL,
    "enviado_por_id" TEXT,
    "recibido_por_id" TEXT,
    "fecha_envio" TIMESTAMP(3),
    "fecha_recepcion" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remision_lineas" (
    "id" TEXT NOT NULL,
    "remision_id" TEXT NOT NULL,
    "articulo_id" TEXT NOT NULL,
    "articulo_clave" TEXT NOT NULL,
    "slot_origen" INTEGER NOT NULL DEFAULT 1,
    "slot_destino" INTEGER NOT NULL DEFAULT 1,
    "cantidad_enviada" DECIMAL(12,3) NOT NULL,
    "cantidad_recibida" DECIMAL(12,3),
    "notas" TEXT,

    CONSTRAINT "remision_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "remisiones_folio_key" ON "remisiones"("folio");

-- CreateIndex
CREATE INDEX "remisiones_empresa_origen_id_estatus_created_at_idx" ON "remisiones"("empresa_origen_id", "estatus", "created_at");

-- CreateIndex
CREATE INDEX "remisiones_empresa_destino_id_estatus_created_at_idx" ON "remisiones"("empresa_destino_id", "estatus", "created_at");

-- AddForeignKey
ALTER TABLE "remisiones" ADD CONSTRAINT "remisiones_empresa_origen_id_fkey" FOREIGN KEY ("empresa_origen_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remisiones" ADD CONSTRAINT "remisiones_ub_origen_id_fkey" FOREIGN KEY ("ub_origen_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remisiones" ADD CONSTRAINT "remisiones_empresa_destino_id_fkey" FOREIGN KEY ("empresa_destino_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remisiones" ADD CONSTRAINT "remisiones_ub_destino_id_fkey" FOREIGN KEY ("ub_destino_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remisiones" ADD CONSTRAINT "remisiones_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remisiones" ADD CONSTRAINT "remisiones_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remisiones" ADD CONSTRAINT "remisiones_recibido_por_id_fkey" FOREIGN KEY ("recibido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remision_lineas" ADD CONSTRAINT "remision_lineas_remision_id_fkey" FOREIGN KEY ("remision_id") REFERENCES "remisiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remision_lineas" ADD CONSTRAINT "remision_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
