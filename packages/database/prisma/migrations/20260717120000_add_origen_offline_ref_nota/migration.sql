-- AlterTable
ALTER TABLE "notas_venta" ADD COLUMN     "origen_offline_ref" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notas_venta_origen_offline_ref_key" ON "notas_venta"("origen_offline_ref");
