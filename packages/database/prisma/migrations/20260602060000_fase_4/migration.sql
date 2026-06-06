-- CreateEnum
CREATE TYPE "TipoMovimientoCuenta" AS ENUM ('CARGO', 'ABONO', 'AJUSTE');

-- CreateTable
CREATE TABLE "movimientos_cuenta" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "tipo" "TipoMovimientoCuenta" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "saldo_antes" DECIMAL(12,2) NOT NULL,
    "saldo_despues" DECIMAL(12,2) NOT NULL,
    "concepto" TEXT NOT NULL,
    "nota_id" TEXT,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_cuenta_empresa_id_cliente_id_created_at_idx" ON "movimientos_cuenta"("empresa_id", "cliente_id", "created_at");

-- AddForeignKey
ALTER TABLE "movimientos_cuenta" ADD CONSTRAINT "movimientos_cuenta_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta" ADD CONSTRAINT "movimientos_cuenta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta" ADD CONSTRAINT "movimientos_cuenta_nota_id_fkey" FOREIGN KEY ("nota_id") REFERENCES "notas_venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta" ADD CONSTRAINT "movimientos_cuenta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
