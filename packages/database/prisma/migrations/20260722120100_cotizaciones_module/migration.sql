-- Quitar 'COTIZACION' del enum EstatusNota. Requiere renombrar/recrear el tipo
-- porque Postgres no soporta DROP VALUE en un enum. Solo es seguro porque la
-- migración anterior (20260722120000_cancel_legacy_cotizaciones) ya canceló
-- todas las filas que usaban ese valor.
ALTER TYPE "EstatusNota" RENAME TO "EstatusNota_old";
CREATE TYPE "EstatusNota" AS ENUM ('ABIERTA', 'PENDIENTE', 'PAGADA', 'CREDITO', 'CANCELADA', 'REABIERTA', 'INCOMPLETA', 'FINALIZADA');
ALTER TABLE "notas_venta" ALTER COLUMN "estatus" DROP DEFAULT;
ALTER TABLE "notas_venta" ALTER COLUMN "estatus" TYPE "EstatusNota" USING ("estatus"::text::"EstatusNota");
ALTER TABLE "notas_venta" ALTER COLUMN "estatus" SET DEFAULT 'ABIERTA';
DROP TYPE "EstatusNota_old";

-- CreateEnum
CREATE TYPE "EstatusCotizacion" AS ENUM ('ACTIVA', 'CONVERTIDA', 'CANCELADA', 'VENCIDA');

-- CreateTable
CREATE TABLE "notas_cotizacion" (
    "id" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "ubicacion_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "estatus" "EstatusCotizacion" NOT NULL DEFAULT 'ACTIVA',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,
    "vigencia_hasta" TIMESTAMP(3) NOT NULL,
    "motivo_cancelacion" TEXT,
    "motivo_cancelacion_comentario" TEXT,
    "cancelado_por_id" TEXT,
    "cancelado_at" TIMESTAMP(3),
    "venta_id" TEXT,
    "convertida_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_cotizacion_lineas" (
    "id" TEXT NOT NULL,
    "nota_cotizacion_id" TEXT NOT NULL,
    "articulo_id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_cotizacion_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notas_cotizacion_venta_id_key" ON "notas_cotizacion"("venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "notas_cotizacion_ubicacion_id_folio_key" ON "notas_cotizacion"("ubicacion_id", "folio");

-- AddForeignKey
ALTER TABLE "notas_cotizacion" ADD CONSTRAINT "notas_cotizacion_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_cotizacion" ADD CONSTRAINT "notas_cotizacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_cotizacion" ADD CONSTRAINT "notas_cotizacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_cotizacion" ADD CONSTRAINT "notas_cotizacion_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_cotizacion" ADD CONSTRAINT "notas_cotizacion_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "notas_venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_cotizacion_lineas" ADD CONSTRAINT "nota_cotizacion_lineas_nota_cotizacion_id_fkey" FOREIGN KEY ("nota_cotizacion_id") REFERENCES "notas_cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_cotizacion_lineas" ADD CONSTRAINT "nota_cotizacion_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
