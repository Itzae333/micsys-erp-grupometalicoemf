-- AlterTable
ALTER TABLE "notas_venta" ADD COLUMN     "cancelado_at" TIMESTAMP(3),
ADD COLUMN     "cancelado_por_id" TEXT,
ADD COLUMN     "motivo_cancelacion" TEXT,
ADD COLUMN     "motivo_cancelacion_comentario" TEXT;

-- AddForeignKey
ALTER TABLE "notas_venta" ADD CONSTRAINT "notas_venta_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
