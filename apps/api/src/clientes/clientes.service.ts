import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  async findAll(ubicacionId: string, q?: string) {
    const where: Record<string, unknown> = { ubicacion_id: ubicacionId };
    if (q) {
      where['OR'] = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { apellidos: { contains: q, mode: 'insensitive' } },
        { razon_social: { contains: q, mode: 'insensitive' } },
        { rfc: { contains: q, mode: 'insensitive' } },
        { telefono: { contains: q, mode: 'insensitive' } },
      ];
    }

    const clientes = await this.prisma.cliente.findMany({
      where,
      orderBy: { nombre: 'asc' },
    });

    return clientes.map((c) => this.serialize(c));
  }

  async findOne(id: string, ubicacionId: string) {
    const c = await this.prisma.cliente.findFirst({
      where: { id, ubicacion_id: ubicacionId },
    });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return this.serialize(c);
  }

  async create(dto: CreateClienteDto, ubicacionId: string) {
    const c = await this.prisma.cliente.create({
      data: { ...dto, ubicacion_id: ubicacionId },
    });
    return this.serialize(c);
  }

  async update(id: string, dto: UpdateClienteDto, ubicacionId: string) {
    await this.findOne(id, ubicacionId);
    const c = await this.prisma.cliente.update({ where: { id }, data: dto });
    return this.serialize(c);
  }

  async getCuenta(id: string, ubicacionId: string, page = 1, limit = 30) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, ubicacion_id: ubicacionId } });
    if (!cliente) throw new Error('Cliente no encontrado');

    const skip = (page - 1) * limit;
    const [total, movimientos] = await Promise.all([
      this.prisma.movimientoCuenta.count({ where: { cliente_id: id, ubicacion_id: ubicacionId } }),
      this.prisma.movimientoCuenta.findMany({
        where: { cliente_id: id, ubicacion_id: ubicacionId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          nota: { select: { id: true, folio: true } },
          usuario: { select: { id: true, nombre: true, apellidos: true } },
        },
      }),
    ]);

    return {
      cliente: this.serialize(cliente),
      movimientos: movimientos.map((m) => ({
        ...m,
        monto: Number(m.monto),
        saldo_antes: Number(m.saldo_antes),
        saldo_despues: Number(m.saldo_despues),
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async abonarCuenta(
    id: string,
    ubicacionId: string,
    dto: { monto: number; metodo: string; referencia?: string },
    usuarioId: string,
  ) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, ubicacion_id: ubicacionId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    // Notas en crédito ordenadas de más antigua a más nueva
    const notas = await this.prisma.notaVenta.findMany({
      where: { cliente_id: id, ubicacion_id: ubicacionId, estatus: 'CREDITO' },
      orderBy: { created_at: 'asc' },
      include: { pagos: { select: { monto: true } } },
    });

    if (notas.length === 0) {
      throw new BadRequestException('El cliente no tiene notas en crédito');
    }

    let saldoDisponible = dto.monto;
    const notasPagadas: Array<{
      nota_id: string;
      folio: number;
      total: number;
      monto_pagado: number;
      nuevo_estatus: string;
    }> = [];

    const clienteActualizado = await this.prisma.$transaction(async (tx) => {
      let saldoClienteActual = Number(cliente.saldo_pendiente);

      for (const nota of notas) {
        if (saldoDisponible <= 0) break;

        const totalPagado = nota.pagos.reduce((s, p) => s + Number(p.monto), 0);
        const totalNota = Number(nota.total);
        const saldoNota = Math.max(0, +(totalNota - totalPagado).toFixed(2));
        if (saldoNota <= 0) continue;

        const montoPago = Math.min(saldoDisponible, saldoNota);
        saldoDisponible = +(saldoDisponible - montoPago).toFixed(2);

        await tx.pago.create({
          data: {
            nota_id: nota.id,
            metodo: dto.metodo as 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'DEPOSITO',
            monto: montoPago,
            referencia: dto.referencia ?? null,
          },
        });

        const nuevoEstatus = totalPagado + montoPago >= totalNota ? 'PAGADA' : 'CREDITO';
        await tx.notaVenta.update({ where: { id: nota.id }, data: { estatus: nuevoEstatus } });

        const saldoClienteDespues = Math.max(0, +(saldoClienteActual - montoPago).toFixed(2));
        await tx.movimientoCuenta.create({
          data: {
            ubicacion_id: ubicacionId,
            cliente_id: id,
            tipo: 'ABONO',
            monto: montoPago,
            saldo_antes: saldoClienteActual,
            saldo_despues: saldoClienteDespues,
            concepto: `Abono cuenta — nota #${nota.folio} ($${montoPago.toFixed(2)})`,
            nota_id: nota.id,
            usuario_id: usuarioId,
          },
        });

        saldoClienteActual = saldoClienteDespues;
        notasPagadas.push({ nota_id: nota.id, folio: nota.folio, total: totalNota, monto_pagado: montoPago, nuevo_estatus: nuevoEstatus });
      }

      return tx.cliente.update({ where: { id }, data: { saldo_pendiente: saldoClienteActual } });
    });

    const totalAplicado = +(dto.monto - Math.max(0, saldoDisponible)).toFixed(2);
    return {
      cliente: this.serialize(clienteActualizado),
      notas_pagadas: notasPagadas,
      total_aplicado: totalAplicado,
      sobrante: Math.max(0, saldoDisponible),
    };
  }

  async toggleActivo(id: string, ubicacionId: string) {
    const raw = await this.prisma.cliente.findFirst({ where: { id, ubicacion_id: ubicacionId } });
    if (!raw) throw new NotFoundException('Cliente no encontrado');
    const updated = await this.prisma.cliente.update({
      where: { id },
      data: { activo: !raw.activo },
    });
    return this.serialize(updated);
  }

  private serialize(c: Record<string, unknown>) {
    return {
      ...c,
      precio_num: c['precio_num'] != null ? Number(c['precio_num']) : null,
      limite_credito: Number(c['limite_credito']),
      saldo_pendiente: Number(c['saldo_pendiente']),
    };
  }
}
