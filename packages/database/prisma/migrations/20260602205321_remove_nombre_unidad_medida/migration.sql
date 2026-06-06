/*
  Warnings:

  - You are about to drop the column `nombre` on the `articulos` table. All the data in the column will be lost.
  - You are about to drop the column `unidad_medida` on the `articulos` table. All the data in the column will be lost.
  - You are about to drop the column `nombre` on the `nota_venta_lineas` table. All the data in the column will be lost.
  - You are about to drop the column `unidad_medida` on the `nota_venta_lineas` table. All the data in the column will be lost.
  - You are about to drop the column `nombre` on the `ordenes_compra_lineas` table. All the data in the column will be lost.
  - You are about to drop the column `unidad_medida` on the `ordenes_compra_lineas` table. All the data in the column will be lost.
  - Added the required column `descripcion` to the `nota_venta_lineas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `descripcion` to the `ordenes_compra_lineas` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "articulos" DROP COLUMN "nombre",
DROP COLUMN "unidad_medida";

-- AlterTable
ALTER TABLE "nota_venta_lineas" DROP COLUMN "nombre",
DROP COLUMN "unidad_medida",
ADD COLUMN     "descripcion" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ordenes_compra_lineas" DROP COLUMN "nombre",
DROP COLUMN "unidad_medida",
ADD COLUMN     "descripcion" TEXT NOT NULL;
