-- CreateEnum
CREATE TYPE "EstatusCarga" AS ENUM ('COMPLETA', 'INCOMPLETA');

-- CreateEnum
CREATE TYPE "EstatusPedido" AS ENUM ('ABIERTO', 'PARCIAL', 'LIQUIDADO', 'CANCELADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstatusNota" ADD VALUE 'INCOMPLETA';
ALTER TYPE "EstatusNota" ADD VALUE 'FINALIZADA';

-- DropForeignKey
ALTER TABLE "articulos" DROP CONSTRAINT "articulos_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_cuenta" DROP CONSTRAINT "movimientos_cuenta_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_cuenta_proveedor" DROP CONSTRAINT "movimientos_cuenta_proveedor_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_inventario" DROP CONSTRAINT "movimientos_inventario_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "notas_venta" DROP CONSTRAINT "notas_venta_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "ordenes_compra" DROP CONSTRAINT "ordenes_compra_empresa_id_fkey";

-- DropIndex
DROP INDEX "articulos_empresa_id_clave_key";

-- DropIndex
DROP INDEX "audit_logs_usuario_id_idx";

-- DropIndex
DROP INDEX "movimientos_cuenta_empresa_id_cliente_id_created_at_idx";

-- DropIndex
DROP INDEX "movimientos_cuenta_proveedor_empresa_id_proveedor_id_create_idx";

-- DropIndex
DROP INDEX "movimientos_inventario_empresa_id_articulo_id_created_at_idx";

-- DropIndex
DROP INDEX "movimientos_inventario_empresa_id_created_at_idx";

-- DropIndex
DROP INDEX "notas_venta_empresa_id_folio_key";

-- DropIndex
DROP INDEX "ordenes_compra_empresa_id_estatus_created_at_idx";

-- DropIndex
DROP INDEX "ordenes_compra_empresa_id_folio_key";

-- DropIndex
DROP INDEX "remisiones_empresa_destino_id_estatus_created_at_idx";

-- DropIndex
DROP INDEX "remisiones_empresa_origen_id_estatus_created_at_idx";

-- AlterTable
ALTER TABLE "areas" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "articulos" DROP COLUMN "empresa_id",
ADD COLUMN     "ubicacion_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "movimientos_cuenta" DROP COLUMN "empresa_id",
ADD COLUMN     "ubicacion_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "movimientos_cuenta_proveedor" DROP COLUMN "empresa_id",
ADD COLUMN     "ubicacion_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "movimientos_inventario" DROP COLUMN "empresa_id",
ADD COLUMN     "ubicacion_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "notas_venta" DROP COLUMN "empresa_id",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ordenes_compra" DROP COLUMN "empresa_id",
ADD COLUMN     "ubicacion_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "solicitudes_edicion_nota" ADD COLUMN     "token" TEXT,
ADD COLUMN     "token_expires_at" TIMESTAMP(3),
ADD COLUMN     "token_used_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "cargas_nota" (
    "id" TEXT NOT NULL,
    "nota_id" TEXT NOT NULL,
    "ubicacion_id" TEXT NOT NULL,
    "estatus" "EstatusCarga" NOT NULL,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargas_nota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carga_nota_lineas" (
    "id" TEXT NOT NULL,
    "carga_id" TEXT NOT NULL,
    "nota_venta_linea_id" TEXT NOT NULL,
    "cantidad_cargada" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "carga_nota_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ubicacion_id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO',
    "comprobante_url" TEXT,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "ubicacion_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "estatus" "EstatusPedido" NOT NULL DEFAULT 'ABIERTO',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "total_anticipos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "nota_venta_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cerrado_at" TIMESTAMP(3),

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_lineas" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "articulo_id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anticipos_pedido" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "ubicacion_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anticipos_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencias_pedido" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "tipo" "TipoEvidencia" NOT NULL,
    "descripcion" TEXT,
    "archivo_url" TEXT,
    "data_json" JSONB,
    "subido_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencias_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_ventas" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "legacy_id" INTEGER NOT NULL,
    "sucursal" TEXT NOT NULL,
    "cliente_nombre" TEXT,
    "nota" TEXT,
    "incidencia" TEXT,
    "recibido" DECIMAL(12,2),
    "cambio" DECIMAL(12,2),
    "restan" DECIMAL(12,2),
    "total" DECIMAL(12,2) NOT NULL,
    "estatus" TEXT NOT NULL,
    "tipo_pago" TEXT NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_venta_lineas" (
    "id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "descripcion_1" TEXT,
    "descripcion_2" TEXT,
    "descripcion_3" TEXT,
    "color" TEXT,
    "material" TEXT,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precio_neto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "legacy_venta_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cargas_nota_nota_id_idx" ON "cargas_nota"("nota_id");

-- CreateIndex
CREATE INDEX "gastos_ubicacion_id_created_at_idx" ON "gastos"("ubicacion_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_nota_venta_id_key" ON "pedidos"("nota_venta_id");

-- CreateIndex
CREATE INDEX "pedidos_ubicacion_id_estatus_created_at_idx" ON "pedidos"("ubicacion_id", "estatus", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_ubicacion_id_folio_key" ON "pedidos"("ubicacion_id", "folio");

-- CreateIndex
CREATE INDEX "anticipos_pedido_ubicacion_id_created_at_idx" ON "anticipos_pedido"("ubicacion_id", "created_at");

-- CreateIndex
CREATE INDEX "evidencias_pedido_pedido_id_idx" ON "evidencias_pedido"("pedido_id");

-- CreateIndex
CREATE INDEX "legacy_ventas_empresa_id_fecha_hora_idx" ON "legacy_ventas"("empresa_id", "fecha_hora");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_ventas_empresa_id_sucursal_legacy_id_key" ON "legacy_ventas"("empresa_id", "sucursal", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "articulos_ubicacion_id_clave_key" ON "articulos"("ubicacion_id", "clave");

-- CreateIndex
CREATE INDEX "movimientos_cuenta_ubicacion_id_cliente_id_created_at_idx" ON "movimientos_cuenta"("ubicacion_id", "cliente_id", "created_at");

-- CreateIndex
CREATE INDEX "movimientos_cuenta_proveedor_ubicacion_id_proveedor_id_crea_idx" ON "movimientos_cuenta_proveedor"("ubicacion_id", "proveedor_id", "created_at");

-- CreateIndex
CREATE INDEX "movimientos_inventario_ubicacion_id_articulo_id_created_at_idx" ON "movimientos_inventario"("ubicacion_id", "articulo_id", "created_at");

-- CreateIndex
CREATE INDEX "movimientos_inventario_ubicacion_id_created_at_idx" ON "movimientos_inventario"("ubicacion_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notas_venta_ubicacion_id_folio_key" ON "notas_venta"("ubicacion_id", "folio");

-- CreateIndex
CREATE INDEX "ordenes_compra_ubicacion_id_estatus_created_at_idx" ON "ordenes_compra"("ubicacion_id", "estatus", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_ubicacion_id_folio_key" ON "ordenes_compra"("ubicacion_id", "folio");

-- CreateIndex
CREATE INDEX "remisiones_ub_origen_id_estatus_created_at_idx" ON "remisiones"("ub_origen_id", "estatus", "created_at");

-- CreateIndex
CREATE INDEX "remisiones_ub_destino_id_estatus_created_at_idx" ON "remisiones"("ub_destino_id", "estatus", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_edicion_nota_token_key" ON "solicitudes_edicion_nota"("token");

-- AddForeignKey
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta" ADD CONSTRAINT "movimientos_cuenta_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta_proveedor" ADD CONSTRAINT "movimientos_cuenta_proveedor_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargas_nota" ADD CONSTRAINT "cargas_nota_nota_id_fkey" FOREIGN KEY ("nota_id") REFERENCES "notas_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargas_nota" ADD CONSTRAINT "cargas_nota_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_nota_lineas" ADD CONSTRAINT "carga_nota_lineas_carga_id_fkey" FOREIGN KEY ("carga_id") REFERENCES "cargas_nota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_nota_lineas" ADD CONSTRAINT "carga_nota_lineas_nota_venta_linea_id_fkey" FOREIGN KEY ("nota_venta_linea_id") REFERENCES "nota_venta_lineas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_nota_venta_id_fkey" FOREIGN KEY ("nota_venta_id") REFERENCES "notas_venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_lineas" ADD CONSTRAINT "pedido_lineas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_lineas" ADD CONSTRAINT "pedido_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_pedido" ADD CONSTRAINT "anticipos_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_pedido" ADD CONSTRAINT "anticipos_pedido_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anticipos_pedido" ADD CONSTRAINT "anticipos_pedido_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias_pedido" ADD CONSTRAINT "evidencias_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias_pedido" ADD CONSTRAINT "evidencias_pedido_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_ventas" ADD CONSTRAINT "legacy_ventas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_venta_lineas" ADD CONSTRAINT "legacy_venta_lineas_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "legacy_ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

