/*
  Warnings:

  - You are about to drop the column `descripcion` on the `nota_venta_lineas` table. All the data in the column will be lost.
  - You are about to drop the column `descripcion` on the `ordenes_compra_lineas` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "nota_venta_lineas" DROP COLUMN "descripcion";

-- AlterTable
ALTER TABLE "ordenes_compra_lineas" DROP COLUMN "descripcion";
