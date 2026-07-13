import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateGastoDto } from './dto/gastos.dto';
import type { Prisma } from '@grupometalicoemf/database';

@Injectable()
export class GastosService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateGastoDto, empresaId: string, ubicacionId: string, usuarioId: string) {
    const gasto = await this.prisma.gasto.create({
      data: {
        empresa_id: empresaId,
        ubicacion_id: ubicacionId,
        concepto: dto.concepto,
        categoria: dto.categoria,
        monto: dto.monto,
        metodo_pago: dto.metodo_pago ?? 'EFECTIVO',
        comprobante_url: dto.comprobante_url ?? null,
        usuario_id: usuarioId,
      },
    });
    return this.serialize(gasto);
  }

  async findAll(ubicacionId: string, query: { desde?: string; hasta?: string } = {}) {
    const where: Prisma.GastoWhereInput = { ubicacion_id: ubicacionId };
    if (query.desde || query.hasta) {
      where.created_at = {
        ...(query.desde ? { gte: new Date(query.desde) } : {}),
        ...(query.hasta ? { lte: new Date(`${query.hasta}T23:59:59.999`) } : {}),
      };
    }

    const gastos = await this.prisma.gasto.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { usuario: { select: { id: true, nombre: true, apellidos: true } } },
    });

    return gastos.map((g) => this.serialize(g));
  }

  async remove(id: string, ubicacionId: string) {
    const gasto = await this.prisma.gasto.findFirst({ where: { id, ubicacion_id: ubicacionId } });
    if (!gasto) throw new NotFoundException('Gasto no encontrado');
    await this.prisma.gasto.delete({ where: { id } });
    return { ok: true };
  }

  private serialize(gasto: any) {
    return { ...gasto, monto: Number(gasto.monto) };
  }
}
