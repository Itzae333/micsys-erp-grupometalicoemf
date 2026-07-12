/*
  Warnings:

  - You are about to drop the column `empresa_id` on the `clientes` table. All the data in the column will be lost.
  - Added the required column `ubicacion_id` to the `clientes` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "clientes" DROP CONSTRAINT "clientes_empresa_id_fkey";

-- AlterTable
ALTER TABLE "clientes" DROP COLUMN "empresa_id",
ADD COLUMN     "ubicacion_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
