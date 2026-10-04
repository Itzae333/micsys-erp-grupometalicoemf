-- AlterTable
ALTER TABLE "articulos" ADD COLUMN "es_especial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "oculto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "remisiones" ADD COLUMN "capturada_por_destino" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "remision_lineas" ADD COLUMN "agregada_en_destino" BOOLEAN NOT NULL DEFAULT false;
