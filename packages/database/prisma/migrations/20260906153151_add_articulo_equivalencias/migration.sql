-- CreateEnum
CREATE TYPE "OrigenEquivalencia" AS ENUM ('AUTOMATICA', 'MANUAL_AMBIGUEDAD', 'MANUAL_BUSQUEDA');

-- CreateTable
CREATE TABLE "articulo_equivalencias" (
    "id" TEXT NOT NULL,
    "articulo_origen_id" TEXT NOT NULL,
    "ub_destino_id" TEXT NOT NULL,
    "articulo_destino_id" TEXT NOT NULL,
    "score" DECIMAL(5,4),
    "origen" "OrigenEquivalencia" NOT NULL,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articulo_equivalencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "articulo_equivalencias_articulo_destino_id_idx" ON "articulo_equivalencias"("articulo_destino_id");

-- CreateIndex
CREATE UNIQUE INDEX "articulo_equivalencias_articulo_origen_id_ub_destino_id_key" ON "articulo_equivalencias"("articulo_origen_id", "ub_destino_id");

-- AddForeignKey
ALTER TABLE "articulo_equivalencias" ADD CONSTRAINT "articulo_equivalencias_articulo_origen_id_fkey" FOREIGN KEY ("articulo_origen_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articulo_equivalencias" ADD CONSTRAINT "articulo_equivalencias_ub_destino_id_fkey" FOREIGN KEY ("ub_destino_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articulo_equivalencias" ADD CONSTRAINT "articulo_equivalencias_articulo_destino_id_fkey" FOREIGN KEY ("articulo_destino_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articulo_equivalencias" ADD CONSTRAINT "articulo_equivalencias_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
