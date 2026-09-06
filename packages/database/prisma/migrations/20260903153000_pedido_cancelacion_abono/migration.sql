-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "cancelado_at" TIMESTAMP(3),
ADD COLUMN     "cancelado_por_id" TEXT,
ADD COLUMN     "motivo_cancelacion_abono" TEXT;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
