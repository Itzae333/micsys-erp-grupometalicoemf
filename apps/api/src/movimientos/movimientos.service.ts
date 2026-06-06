import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { EntradaDto, SalidaDto, TransferenciaDto, AjusteDto } from './dto/movimientos.dto';
import type { Prisma } from '@grupometalicoemf/database';

const MOV_INCLUDE = {
  articulo: { select: { id: true, clave: true, descripcion_1: true, descripcion_2: true } },
  proveedor: { select: { id: true, nombre: true } },
  usuario:   { select: { id: true, nombre: true, apellidos: true } },
} satisfies Prisma.MovimientoInventarioInclude;

type MovRaw = Prisma.MovimientoInventarioGetPayload<{ include: typeof MOV_INCLUDE }>;

@Injectable()
export class MovimientosService {
  constructor(private prisma: PrismaService) {}

  // ─── Listar ───────────────────────────────────────────────────

  async listar(empresaId: string, query: {
    tipo?: string; articuloId?: string; page?: number; limit?: number;
  } = {}) {
    const { tipo, articuloId, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.MovimientoInventarioWhereInput = { empresa_id: empresaId };
    if (tipo) where.tipo = tipo as any;
    if (articuloId) where.articulo_id = articuloId;

    const [total, data] = await Promise.all([
      this.prisma.movimientoInventario.count({ where }),
      this.prisma.movimientoInventario.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: MOV_INCLUDE,
      }),
    ]);

    return {
      data: data.map((m) => this.serialize(m)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // ─── Registrar entrada ────────────────────────────────────────

  async registrarEntrada(dto: EntradaDto, empresaId: string, usuarioId: string) {
    const articulo = await this.findArticulo(dto.articulo_id, empresaId);
    if (dto.proveedor_id) await this.checkProveedor(dto.proveedor_id, empresaId);

    const cantidadAntes = this.getExistencia(articulo, dto.existencia_num);
    const cantidadDespues = cantidadAntes + dto.cantidad;

    return this.prisma.$transaction(async (tx) => {
      const mov = await tx.movimientoInventario.create({
        data: {
          empresa_id:      empresaId,
          articulo_id:     dto.articulo_id,
          tipo:            'ENTRADA',
          existencia_num:  dto.existencia_num,
          cantidad:        dto.cantidad,
          cantidad_antes:  cantidadAntes,
          cantidad_despues: cantidadDespues,
          concepto:        dto.concepto ?? 'Entrada de mercancía',
          proveedor_id:    dto.proveedor_id ?? null,
          usuario_id:      usuarioId,
        },
        include: MOV_INCLUDE,
      });

      await tx.articulo.update({
        where: { id: dto.articulo_id },
        data:  this.buildExistenciaUpdate(dto.existencia_num, cantidadDespues),
      });

      return this.serialize(mov);
    });
  }

  // ─── Registrar salida ─────────────────────────────────────────

  async registrarSalida(dto: SalidaDto, empresaId: string, usuarioId: string) {
    const articulo = await this.findArticulo(dto.articulo_id, empresaId);

    const cantidadAntes = this.getExistencia(articulo, dto.existencia_num);
    if (cantidadAntes < dto.cantidad) {
      throw new BadRequestException(
        `Existencia insuficiente (slot ${dto.existencia_num}): hay ${cantidadAntes}, se requieren ${dto.cantidad}`,
      );
    }

    const cantidadDespues = cantidadAntes - dto.cantidad;

    return this.prisma.$transaction(async (tx) => {
      const mov = await tx.movimientoInventario.create({
        data: {
          empresa_id:      empresaId,
          articulo_id:     dto.articulo_id,
          tipo:            'SALIDA',
          existencia_num:  dto.existencia_num,
          cantidad:        dto.cantidad,
          cantidad_antes:  cantidadAntes,
          cantidad_despues: cantidadDespues,
          concepto:        dto.concepto,
          usuario_id:      usuarioId,
        },
        include: MOV_INCLUDE,
      });

      await tx.articulo.update({
        where: { id: dto.articulo_id },
        data:  this.buildExistenciaUpdate(dto.existencia_num, cantidadDespues),
      });

      return this.serialize(mov);
    });
  }

  // ─── Registrar transferencia ──────────────────────────────────

  async registrarTransferencia(dto: TransferenciaDto, empresaId: string, usuarioId: string) {
    if (dto.existencia_num_origen === dto.existencia_num_destino) {
      throw new BadRequestException('El slot de origen y destino deben ser diferentes');
    }

    const articulo = await this.findArticulo(dto.articulo_id, empresaId);

    const cantAntes    = this.getExistencia(articulo, dto.existencia_num_origen);
    const cantAntesDst = this.getExistencia(articulo, dto.existencia_num_destino);

    if (cantAntes < dto.cantidad) {
      throw new BadRequestException(
        `Existencia insuficiente (slot ${dto.existencia_num_origen}): hay ${cantAntes}, se requieren ${dto.cantidad}`,
      );
    }

    const refId    = randomUUID();
    const concepto = dto.concepto ?? 'Transferencia interna';

    return this.prisma.$transaction(async (tx) => {
      const out = await tx.movimientoInventario.create({
        data: {
          empresa_id:      empresaId,
          articulo_id:     dto.articulo_id,
          tipo:            'TRANSFERENCIA_OUT',
          existencia_num:  dto.existencia_num_origen,
          cantidad:        dto.cantidad,
          cantidad_antes:  cantAntes,
          cantidad_despues: cantAntes - dto.cantidad,
          concepto,
          referencia_id:   refId,
          usuario_id:      usuarioId,
        },
        include: MOV_INCLUDE,
      });

      await tx.movimientoInventario.create({
        data: {
          empresa_id:      empresaId,
          articulo_id:     dto.articulo_id,
          tipo:            'TRANSFERENCIA_IN',
          existencia_num:  dto.existencia_num_destino,
          cantidad:        dto.cantidad,
          cantidad_antes:  cantAntesDst,
          cantidad_despues: cantAntesDst + dto.cantidad,
          concepto,
          referencia_id:   refId,
          usuario_id:      usuarioId,
        },
      });

      await tx.articulo.update({
        where: { id: dto.articulo_id },
        data: {
          ...this.buildExistenciaUpdate(dto.existencia_num_origen, cantAntes - dto.cantidad),
          ...this.buildExistenciaUpdate(dto.existencia_num_destino, cantAntesDst + dto.cantidad),
        },
      });

      return this.serialize(out);
    });
  }

  // ─── Registrar ajuste ─────────────────────────────────────────

  async registrarAjuste(dto: AjusteDto, empresaId: string, usuarioId: string) {
    const articulo = await this.findArticulo(dto.articulo_id, empresaId);

    const cantidadAntes = this.getExistencia(articulo, dto.existencia_num);
    const delta = dto.cantidad_nueva - cantidadAntes;
    const tipo  = delta >= 0 ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO';

    return this.prisma.$transaction(async (tx) => {
      const mov = await tx.movimientoInventario.create({
        data: {
          empresa_id:      empresaId,
          articulo_id:     dto.articulo_id,
          tipo,
          existencia_num:  dto.existencia_num,
          cantidad:        Math.abs(delta),
          cantidad_antes:  cantidadAntes,
          cantidad_despues: dto.cantidad_nueva,
          concepto:        dto.concepto,
          usuario_id:      usuarioId,
        },
        include: MOV_INCLUDE,
      });

      await tx.articulo.update({
        where: { id: dto.articulo_id },
        data:  this.buildExistenciaUpdate(dto.existencia_num, dto.cantidad_nueva),
      });

      return this.serialize(mov);
    });
  }

  // ─── Privados ─────────────────────────────────────────────────

  private async findArticulo(articuloId: string, empresaId: string) {
    const art = await this.prisma.articulo.findFirst({
      where: { id: articuloId, empresa_id: empresaId },
    });
    if (!art) throw new NotFoundException('Artículo no encontrado');
    return art;
  }

  private async checkProveedor(proveedorId: string, empresaId: string) {
    const prov = await this.prisma.proveedor.findFirst({
      where: { id: proveedorId, empresa_id: empresaId },
    });
    if (!prov) throw new NotFoundException('Proveedor no encontrado');
  }

  private getExistencia(articulo: Record<string, unknown>, num: number): number {
    return Number((articulo as any)[`existencia_${num}`] ?? 0);
  }

  private buildExistenciaUpdate(num: number, val: number): Record<string, number> {
    return { [`existencia_${num}`]: val };
  }

  private serialize(m: MovRaw) {
    return {
      ...m,
      cantidad:         Number(m.cantidad),
      cantidad_antes:   Number(m.cantidad_antes),
      cantidad_despues: Number(m.cantidad_despues),
    };
  }
}
