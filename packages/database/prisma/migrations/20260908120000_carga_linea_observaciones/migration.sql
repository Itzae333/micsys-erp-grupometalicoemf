-- AlterTable
ALTER TABLE "carga_nota_lineas" ADD COLUMN     "observaciones" TEXT,
ADD COLUMN     "resuelta_at" TIMESTAMP(3),
ADD COLUMN     "resuelta_por_id" TEXT;

-- AddForeignKey
ALTER TABLE "carga_nota_lineas" ADD CONSTRAINT "carga_nota_lineas_resuelta_por_id_fkey" FOREIGN KEY ("resuelta_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
