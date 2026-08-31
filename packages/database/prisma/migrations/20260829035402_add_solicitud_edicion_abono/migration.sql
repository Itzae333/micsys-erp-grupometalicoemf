-- CreateEnum
CREATE TYPE "AccionSolicitudAbono" AS ENUM ('EDITAR', 'ELIMINAR');

-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "movimiento_cuenta_id" TEXT;

-- CreateTable
CREATE TABLE "solicitudes_edicion_abono" (
    "id" TEXT NOT NULL,
    "pago_id" TEXT NOT NULL,
    "nota_id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "accion" "AccionSolicitudAbono" NOT NULL,
    "nuevo_monto" DECIMAL(12,2),
    "nuevo_metodo" "MetodoPago",
    "nueva_referencia" TEXT,
    "estatus" "EstatusSolicitudEdicion" NOT NULL DEFAULT 'PENDIENTE',
    "aprobado_por_id" TEXT,
    "comentario_admin" TEXT,
    "token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "token_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_edicion_abono_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_edicion_abono_token_key" ON "solicitudes_edicion_abono"("token");

-- CreateIndex
CREATE INDEX "solicitudes_edicion_abono_empresa_id_estatus_created_at_idx" ON "solicitudes_edicion_abono"("empresa_id", "estatus", "created_at");

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_movimiento_cuenta_id_fkey" FOREIGN KEY ("movimiento_cuenta_id") REFERENCES "movimientos_cuenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_edicion_abono" ADD CONSTRAINT "solicitudes_edicion_abono_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_edicion_abono" ADD CONSTRAINT "solicitudes_edicion_abono_nota_id_fkey" FOREIGN KEY ("nota_id") REFERENCES "notas_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_edicion_abono" ADD CONSTRAINT "solicitudes_edicion_abono_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_edicion_abono" ADD CONSTRAINT "solicitudes_edicion_abono_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_edicion_abono" ADD CONSTRAINT "solicitudes_edicion_abono_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
