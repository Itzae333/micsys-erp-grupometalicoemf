-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('ENTRADA', 'SALIDA', 'TRANSFERENCIA_OUT', 'TRANSFERENCIA_IN', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO');

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "articulo_id" TEXT NOT NULL,
    "tipo" "TipoMovimientoInventario" NOT NULL,
    "existencia_num" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "cantidad_antes" DECIMAL(12,3) NOT NULL,
    "cantidad_despues" DECIMAL(12,3) NOT NULL,
    "concepto" TEXT NOT NULL,
    "proveedor_id" TEXT,
    "referencia_id" TEXT,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_inventario_empresa_id_articulo_id_created_at_idx" ON "movimientos_inventario"("empresa_id", "articulo_id", "created_at");

-- CreateIndex
CREATE INDEX "movimientos_inventario_empresa_id_created_at_idx" ON "movimientos_inventario"("empresa_id", "created_at");

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
