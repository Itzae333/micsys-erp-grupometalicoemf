import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AbonoDto, AjusteDto } from './dto/cuentas.dto';

@Injectable()
export class CuentasService {
  constructor(private prisma: PrismaService) {}

  // ─── Resumen: clientes con saldo pendiente ────────────────────

  async getResumen(empresaId: string) {
    const clientes = await this.prisma.cliente.findMany({
      where: { empresa_id: empresaId, activo: true, saldo_pendiente: { gt: 0 } },
      orderBy: { saldo_pendiente: 'desc' },
      select: {
        id: true,
        nombre: true,
        apellidos: true,
        razon_social: true,
        rfc: true,
        telefono: true,
        precio_num: true,
        limite_credito: true,
        saldo_pendiente: true,
      },
    });

    return clientes.map((c) => ({
      ...c,
      limite_credito: Number(c.limite_credito),
      saldo_pendiente: Number(c.saldo_pendiente),
    }));
  }

  // ─── Detalle de cuenta de un cliente ─────────────────────────

  async getCuenta(clienteId: string, empresaId: string, page = 1, limit = 50) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, empresa_id: empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const skip = (page - 1) * limit;
    const [total, movimientos] = await Promise.all([
      this.prisma.movimientoCuenta.count({ where: { cliente_id: clienteId, empresa_id: empresaId } }),
      this.prisma.movimientoCuenta.findMany({
        where: { cliente_id: clienteId, empresa_id: empresaId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true } },
          nota: { select: { id: true, folio: true } },
        },
      }),
    ]);

    return {
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre,
        apellidos: cliente.apellidos,
        razon_social: cliente.razon_social,
        telefono: cliente.telefono,
        precio_num: cliente.precio_num,
        limite_credito: Number(cliente.limite_credito),
        saldo_pendiente: Number(cliente.saldo_pendiente),
      },
      movimientos: movimientos.map((m) => this.serializeMovimiento(m)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // ─── Registrar abono ─────────────────────────────────────────

  async registrarAbono(clienteId: string, dto: AbonoDto, empresaId: string, usuarioId: string) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, empresa_id: empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const saldoActual = Number(cliente.saldo_pendiente);
    if (dto.monto > saldoActual) {
      throw new BadRequestException(
        `El abono ($${dto.monto.toFixed(2)}) supera el saldo pendiente ($${saldoActual.toFixed(2)})`,
      );
    }

    const saldoDespues = saldoActual - dto.monto;

    return this.prisma.$transaction(async (tx) => {
      const mov = await tx.movimientoCuenta.create({
        data: {
          empresa_id: empresaId,
          cliente_id: clienteId,
          tipo: 'ABONO',
          monto: dto.monto,
          saldo_antes: saldoActual,
          saldo_despues: saldoDespues,
          concepto: dto.concepto ?? 'Abono a cuenta',
          usuario_id: usuarioId,
        },
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true } },
          nota: { select: { id: true, folio: true } },
        },
      });

      await tx.cliente.update({
        where: { id: clienteId },
        data: { saldo_pendiente: saldoDespues },
      });

      return this.serializeMovimiento(mov);
    });
  }

  // ─── Ajuste manual ────────────────────────────────────────────

  async registrarAjuste(clienteId: string, dto: AjusteDto, empresaId: string, usuarioId: string) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, empresa_id: empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const saldoActual = Number(cliente.saldo_pendiente);
    const saldoDespues =
      dto.tipo === 'CARGO' ? saldoActual + dto.monto : Math.max(0, saldoActual - dto.monto);

    return this.prisma.$transaction(async (tx) => {
      const mov = await tx.movimientoCuenta.create({
        data: {
          empresa_id: empresaId,
          cliente_id: clienteId,
          tipo: 'AJUSTE',
          monto: dto.monto,
          saldo_antes: saldoActual,
          saldo_despues: saldoDespues,
          concepto: dto.concepto,
          usuario_id: usuarioId,
        },
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true } },
          nota: { select: { id: true, folio: true } },
        },
      });

      await tx.cliente.update({
        where: { id: clienteId },
        data: { saldo_pendiente: saldoDespues },
      });

      return this.serializeMovimiento(mov);
    });
  }

  // ─── Serializar ───────────────────────────────────────────────

  private serializeMovimiento(m: Record<string, unknown>) {
    return {
      ...m,
      monto: Number((m as any).monto),
      saldo_antes: Number((m as any).saldo_antes),
      saldo_despues: Number((m as any).saldo_despues),
    };
  }
}
