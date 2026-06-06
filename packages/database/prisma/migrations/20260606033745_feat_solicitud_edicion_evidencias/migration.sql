-- CreateEnum
CREATE TYPE "EstatusSolicitudEdicion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "TipoEvidencia" AS ENUM ('TICKET_ORIGINAL', 'COMPROBANTE_PAGO', 'IMAGEN', 'TICKET_REEDITADO');

-- AlterEnum
ALTER TYPE "EstatusNota" ADD VALUE 'REABIERTA';

-- CreateTable
CREATE TABLE "solicitudes_edicion_nota" (
    "id" TEXT NOT NULL,
    "nota_id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "estatus" "EstatusSolicitudEdicion" NOT NULL DEFAULT 'PENDIENTE',
    "aprobado_por_id" TEXT,
    "comentario_admin" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_edicion_nota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencias_nota" (
    "id" TEXT NOT NULL,
    "nota_id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "tipo" "TipoEvidencia" NOT NULL,
    "descripcion" TEXT,
    "archivo_url" TEXT,
    "data_json" JSONB,
    "subido_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencias_nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_edicion_nota_empresa_id_estatus_created_at_idx" ON "solicitudes_edicion_nota"("empresa_id", "estatus", "created_at");

-- CreateIndex
CREATE INDEX "evidencias_nota_nota_id_idx" ON "evidencias_nota"("nota_id");

-- AddForeignKey
ALTER TABLE "solicitudes_edicion_nota" ADD CONSTRAINT "solicitudes_edicion_nota_nota_id_fkey" FOREIGN KEY ("nota_id") REFERENCES "notas_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_edicion_nota" ADD CONSTRAINT "solicitudes_edicion_nota_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_edicion_nota" ADD CONSTRAINT "solicitudes_edicion_nota_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_edicion_nota" ADD CONSTRAINT "solicitudes_edicion_nota_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias_nota" ADD CONSTRAINT "evidencias_nota_nota_id_fkey" FOREIGN KEY ("nota_id") REFERENCES "notas_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias_nota" ADD CONSTRAINT "evidencias_nota_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias_nota" ADD CONSTRAINT "evidencias_nota_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
