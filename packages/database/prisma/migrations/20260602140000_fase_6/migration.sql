-- Fase 6: Compras y Cuentas por Pagar
-- OrdenCompra, OrdenCompraLinea, MovimientoCuentaProveedor
-- + saldo_pendiente en proveedores

-- Enums
CREATE TYPE "EstatusOrdenCompra" AS ENUM ('BORRADOR', 'APROBADA', 'RECIBIDA_PARCIAL', 'RECIBIDA', 'CANCELADA');
CREATE TYPE "TipoMovimientoProveedor" AS ENUM ('CARGO', 'ABONO', 'AJUSTE');

-- saldo_pendiente en proveedores
ALTER TABLE "proveedores" ADD COLUMN "saldo_pendiente" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ordenes_compra
CREATE TABLE "ordenes_compra" (
  "id"            TEXT NOT NULL,
  "folio"         INTEGER NOT NULL,
  "empresa_id"    TEXT NOT NULL,
  "proveedor_id"  TEXT NOT NULL,
  "estatus"       "EstatusOrdenCompra" NOT NULL DEFAULT 'BORRADOR',
  "subtotal"      DECIMAL(12,2) NOT NULL,
  "total"         DECIMAL(12,2) NOT NULL,
  "observaciones" TEXT,
  "usuario_id"    TEXT NOT NULL,
  "aprobada_at"   TIMESTAMP(3),
  "recibida_at"   TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ordenes_compra_empresa_id_folio_key" ON "ordenes_compra"("empresa_id", "folio");
CREATE INDEX "ordenes_compra_empresa_id_estatus_created_at_idx" ON "ordenes_compra"("empresa_id", "estatus", "created_at");

-- ordenes_compra_lineas
CREATE TABLE "ordenes_compra_lineas" (
  "id"                  TEXT NOT NULL,
  "orden_id"            TEXT NOT NULL,
  "articulo_id"         TEXT NOT NULL,
  "clave"               TEXT NOT NULL,
  "nombre"              TEXT NOT NULL,
  "unidad_medida"       TEXT NOT NULL,
  "cantidad_solicitada" DECIMAL(12,3) NOT NULL,
  "cantidad_recibida"   DECIMAL(12,3) NOT NULL DEFAULT 0,
  "precio_unitario"     DECIMAL(12,2) NOT NULL,
  "subtotal"            DECIMAL(12,2) NOT NULL,
  "existencia_num"      INTEGER NOT NULL DEFAULT 1,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ordenes_compra_lineas_pkey" PRIMARY KEY ("id")
);

-- movimientos_cuenta_proveedor
CREATE TABLE "movimientos_cuenta_proveedor" (
  "id"            TEXT NOT NULL,
  "empresa_id"    TEXT NOT NULL,
  "proveedor_id"  TEXT NOT NULL,
  "tipo"          "TipoMovimientoProveedor" NOT NULL,
  "monto"         DECIMAL(12,2) NOT NULL,
  "saldo_antes"   DECIMAL(12,2) NOT NULL,
  "saldo_despues" DECIMAL(12,2) NOT NULL,
  "concepto"      TEXT NOT NULL,
  "orden_id"      TEXT,
  "usuario_id"    TEXT NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "movimientos_cuenta_proveedor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "movimientos_cuenta_proveedor_empresa_id_proveedor_id_created_at_idx" ON "movimientos_cuenta_proveedor"("empresa_id", "proveedor_id", "created_at");

-- Foreign keys ordenes_compra
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_empresa_id_fkey"   FOREIGN KEY ("empresa_id")   REFERENCES "empresas"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_usuario_id_fkey"   FOREIGN KEY ("usuario_id")   REFERENCES "usuarios"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys ordenes_compra_lineas
ALTER TABLE "ordenes_compra_lineas" ADD CONSTRAINT "ordenes_compra_lineas_orden_id_fkey"    FOREIGN KEY ("orden_id")    REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ordenes_compra_lineas" ADD CONSTRAINT "ordenes_compra_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys movimientos_cuenta_proveedor
ALTER TABLE "movimientos_cuenta_proveedor" ADD CONSTRAINT "movimientos_cuenta_proveedor_empresa_id_fkey"   FOREIGN KEY ("empresa_id")   REFERENCES "empresas"("id")      ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_cuenta_proveedor" ADD CONSTRAINT "movimientos_cuenta_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_cuenta_proveedor" ADD CONSTRAINT "movimientos_cuenta_proveedor_orden_id_fkey"     FOREIGN KEY ("orden_id")     REFERENCES "ordenes_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "movimientos_cuenta_proveedor" ADD CONSTRAINT "movimientos_cuenta_proveedor_usuario_id_fkey"   FOREIGN KEY ("usuario_id")   REFERENCES "usuarios"("id")      ON DELETE RESTRICT ON UPDATE CASCADE;
