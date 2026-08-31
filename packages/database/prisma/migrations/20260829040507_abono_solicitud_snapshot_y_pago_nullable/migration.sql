/*
  Warnings:

  - Added the required column `metodo_anterior` to the `solicitudes_edicion_abono` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monto_anterior` to the `solicitudes_edicion_abono` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "solicitudes_edicion_abono" DROP CONSTRAINT "solicitudes_edicion_abono_pago_id_fkey";

-- AlterTable
ALTER TABLE "solicitudes_edicion_abono" ADD COLUMN     "metodo_anterior" "MetodoPago" NOT NULL,
ADD COLUMN     "monto_anterior" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "referencia_anterior" TEXT,
ALTER COLUMN "pago_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "solicitudes_edicion_abono" ADD CONSTRAINT "solicitudes_edicion_abono_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
