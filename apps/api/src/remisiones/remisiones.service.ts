import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRemisionDto, RecibirRemisionDto } from './dto/remision.dto';
import type { Prisma } from '@grupometalicoemf/database';

const REM_INCLUDE = {
  empresa_origen:  { select: { id: true, nombre: true } },
  ub_origen:       { select: { id: true, nombre: true } },
  empresa_destino: { select: { id: true, nombre: true } },
  ub_destino:      { select: { id: true, nombre: true } },
  creado_por:      { select: { id: true, nombre: true, apellidos: true } },
  enviado_por:     { select: { id: true, nombre: true, apellidos: true } },
  recibido_por:    { select: { id: true, nombre: true, apellidos: true } },
  lineas: {
    include: {
      articulo: {
        select: { id: true, clave: true, descripcion_1: true, descripcion_2: true },
      },
    },
  },
} satisfies Prisma.RemisionInclude;

@Injectable()
export class RemisionesService {
  constructor(private prisma: PrismaService) {}

  // ─── Listar ───────────────────────────────────────────────────

  async listar(
    empresaId: string,
    tipo: 'salida' | 'entrada' | 'todas',
    query: { estatus?: string; page?: number; limit?: number } = {},
  ) {
    const { estatus, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.RemisionWhereInput = {};
    if (tipo === 'salida')   where.empresa_origen_id  = empresaId;
    else if (tipo === 'entrada') where.empresa_destino_id = empresaId;
    else where.OR = [{ empresa_origen_id: empresaId }, { empresa_destino_id: empresaId }];
    if (estatus) where.estatus = estatus as any;

    const [total, data] = await Promise.all([
      this.prisma.remision.count({ where }),
      this.prisma.remision.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: REM_INCLUDE,
      }),
    ]);

    return {
      data: data.map((r) => this.serialize(r)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // ─── Detalle por ID ───────────────────────────────────────────

  async getById(id: string) {
    const rem = await this.prisma.remision.findUnique({
      where: { id },
      include: REM_INCLUDE,
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    return this.serialize(rem);
  }

  // ─── Detalle por folio (para QR scan) ────────────────────────

  async getByFolio(folio: string) {
    const rem = await this.prisma.remision.findUnique({
      where: { folio },
      include: REM_INCLUDE,
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    return this.serialize(rem);
  }

  // ─── Crear (BORRADOR) ─────────────────────────────────────────

  async crear(dto: CreateRemisionDto, usuarioId: string) {
    if (!dto.lineas?.length) {
      throw new BadRequestException('La remisión debe tener al menos una línea');
    }

    const folio = await this.nextFolio();

    const rem = await this.prisma.remision.create({
      data: {
        folio,
        empresa_origen_id:  dto.empresa_origen_id,
        ub_origen_id:       dto.ub_origen_id,
        empresa_destino_id: dto.empresa_destino_id,
        ub_destino_id:      dto.ub_destino_id,
        concepto:           dto.concepto ?? null,
        notas:              dto.notas    ?? null,
        creado_por_id:      usuarioId,
        lineas: {
          create: dto.lineas.map((l) => ({
            articulo_id:      l.articulo_id,
            articulo_clave:   l.articulo_clave,
            slot_origen:      l.slot_origen,
            slot_destino:     l.slot_destino,
            cantidad_enviada: l.cantidad,
            notas:            l.notas ?? null,
          })),
        },
      },
      include: REM_INCLUDE,
    });

    return this.serialize(rem);
  }

  // ─── Enviar → EN_TRANSITO ─────────────────────────────────────

  async enviar(id: string, usuarioId: string) {
    const rem = await this.prisma.remision.findUnique({
      where: { id },
      include: { lineas: true },
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    if (rem.estatus !== 'BORRADOR') {
      throw new BadRequestException('Solo se pueden enviar remisiones en BORRADOR');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const linea of rem.lineas) {
        const art = await tx.articulo.findFirst({
          where: { id: linea.articulo_id, ubicacion_id: rem.ub_origen_id },
        });
        if (!art) throw new NotFoundException(`Artículo ${linea.articulo_clave} no encontrado en ubicación origen`);

        const cantAntes   = Number((art as any)[`existencia_${linea.slot_origen}`] ?? 0);
        const cantDespues = cantAntes - Number(linea.cantidad_enviada);

        await tx.movimientoInventario.create({
          data: {
            ubicacion_id:    rem.ub_origen_id,
            articulo_id:     linea.articulo_id,
            tipo:            'SALIDA',
            existencia_num:  linea.slot_origen,
            cantidad:        linea.cantidad_enviada,
            cantidad_antes:  cantAntes,
            cantidad_despues: cantDespues,
            concepto:        `Remisión ${rem.folio} → ${rem.ub_destino_id}`,
            referencia_id:   rem.id,
            usuario_id:      usuarioId,
          },
        });

        await tx.articulo.update({
          where: { id: linea.articulo_id },
          data: { [`existencia_${linea.slot_origen}`]: cantDespues },
        });
      }

      await tx.remision.update({
        where: { id },
        data: {
          estatus:         'EN_TRANSITO',
          enviado_por_id:  usuarioId,
          fecha_envio:     new Date(),
        },
      });
    });

    return this.getById(id);
  }

  // ─── Recibir ──────────────────────────────────────────────────

  async recibir(id: string, dto: RecibirRemisionDto, usuarioId: string) {
    const rem = await this.prisma.remision.findUnique({
      where: { id },
      include: { lineas: true },
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    if (rem.estatus !== 'EN_TRANSITO') {
      throw new BadRequestException('Solo se pueden recibir remisiones EN_TRANSITO');
    }

    let completa = true;

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.lineas) {
        const linea = rem.lineas.find((l) => l.id === item.linea_id);
        if (!linea) throw new BadRequestException(`Línea ${item.linea_id} no encontrada`);

        const cantRecibida = item.cantidad_recibida;
        if (Number(cantRecibida) < Number(linea.cantidad_enviada)) completa = false;

        // Lookup artículo en empresa destino por clave
        const artDst = await tx.articulo.findFirst({
          where: { clave: linea.articulo_clave, ubicacion_id: rem.ub_destino_id },
        });

        if (artDst && cantRecibida > 0) {
          const cantAntes   = Number((artDst as any)[`existencia_${linea.slot_destino}`] ?? 0);
          const cantDespues = cantAntes + cantRecibida;

          await tx.movimientoInventario.create({
            data: {
              ubicacion_id:     rem.ub_destino_id,
              articulo_id:      artDst.id,
              tipo:             'ENTRADA',
              existencia_num:   linea.slot_destino,
              cantidad:         cantRecibida,
              cantidad_antes:   cantAntes,
              cantidad_despues: cantDespues,
              concepto:         `Recepción remisión ${rem.folio}`,
              referencia_id:    rem.id,
              usuario_id:       usuarioId,
            },
          });

          await tx.articulo.update({
            where: { id: artDst.id },
            data: { [`existencia_${linea.slot_destino}`]: cantDespues },
          });
        }

        await tx.remisionLinea.update({
          where: { id: item.linea_id },
          data: { cantidad_recibida: cantRecibida },
        });
      }

      await tx.remision.update({
        where: { id },
        data: {
          estatus:          completa ? 'RECIBIDA_COMPLETA' : 'RECIBIDA_PARCIAL',
          recibido_por_id:  usuarioId,
          fecha_recepcion:  new Date(),
        },
      });
    });

    return this.getById(id);
  }

  // ─── Cancelar (solo BORRADOR) ─────────────────────────────────

  async cancelar(id: string) {
    const rem = await this.prisma.remision.findUnique({ where: { id } });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    if (rem.estatus !== 'BORRADOR') {
      throw new BadRequestException('Solo se pueden cancelar remisiones en BORRADOR');
    }
    await this.prisma.remision.update({ where: { id }, data: { estatus: 'CANCELADA' } });
    return { ok: true };
  }

  // ─── Destinos disponibles (todas las empresas + ubicaciones) ──

  async getDestinos() {
    const empresas = await this.prisma.empresa.findMany({
      where: { activa: true },
      select: {
        id: true,
        nombre: true,
        ubicaciones: {
          where: { activa: true },
          select: { id: true, nombre: true, tipo: true },
          orderBy: { nombre: 'asc' },
        },
      },
      orderBy: { nombre: 'asc' },
    });
    return empresas;
  }

  // ─── Privados ──────────────────────────────────────────────────

  private async nextFolio(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REM-${year}-`;
    const last = await this.prisma.remision.findFirst({
      where:   { folio: { startsWith: prefix } },
      orderBy: { folio: 'desc' },
    });
    const num = last ? parseInt(last.folio.split('-')[2] ?? '0', 10) + 1 : 1;
    return `${prefix}${String(num).padStart(4, '0')}`;
  }

  private serialize(rem: any) {
    return {
      ...rem,
      lineas: (rem.lineas ?? []).map((l: any) => ({
        ...l,
        cantidad_enviada:  Number(l.cantidad_enviada),
        cantidad_recibida: l.cantidad_recibida != null ? Number(l.cantidad_recibida) : null,
      })),
    };
  }
}
