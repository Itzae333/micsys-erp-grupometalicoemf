/*
  Warnings:

  - You are about to drop the column `credito_dias` on the `clientes` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "clientes" DROP COLUMN "credito_dias",
ADD COLUMN     "precio_num" INTEGER;
