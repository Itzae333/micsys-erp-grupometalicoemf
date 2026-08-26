-- AlterTable
ALTER TABLE "notas_venta" ADD COLUMN     "aplica_iva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "iva" DECIMAL(12,2) NOT NULL DEFAULT 0;
