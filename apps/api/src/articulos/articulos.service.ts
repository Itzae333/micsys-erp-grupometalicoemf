import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateArticuloDto } from './dto/create-articulo.dto';

interface ListQuery {
  q?: string;
  page?: number;
  limit?: number;
  activo?: boolean;
  proveedorId?: string;
}

const PRECIO_FIELDS = [
  'precio_1','precio_2','precio_3','precio_4','precio_5',
  'precio_6','precio_7','precio_8','precio_9','precio_10',
] as const;

const EXISTENCIA_FIELDS = [
  'existencia_1','existencia_2','existencia_3','existencia_4','existencia_5',
] as const;

type PrecioField = typeof PRECIO_FIELDS[number];
type ExistenciaField = typeof EXISTENCIA_FIELDS[number];

@Injectable()
export class ArticulosService {
  constructor(private prisma: PrismaService) {}

  async findAll(empresaId: string, query: ListQuery = {}) {
    const { q, page = 1, limit = 50, activo, proveedorId } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { empresa_id: empresaId };
    if (activo !== undefined) where['activo'] = activo;
    if (proveedorId) where['proveedor_id'] = proveedorId;
    if (q) {
      where['OR'] = [
        { clave: { contains: q, mode: 'insensitive' } },
        { descripcion_1: { contains: q, mode: 'insensitive' } },
        { descripcion_2: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.articulo.count({ where }),
      this.prisma.articulo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { clave: 'asc' },
        include: { proveedor: { select: { id: true, nombre: true } } },
      }),
    ]);

    return {
      data: data.map((a) => this.serialize(a)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, empresaId: string) {
    const art = await this.prisma.articulo.findFirst({
      where: { id, empresa_id: empresaId },
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    if (!art) throw new NotFoundException('Artículo no encontrado');
    return this.serialize(art);
  }

  async findByClave(clave: string, empresaId: string) {
    const art = await this.prisma.articulo.findUnique({
      where: { empresa_id_clave: { empresa_id: empresaId, clave } },
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    if (!art) throw new NotFoundException('Artículo no encontrado');
    return this.serialize(art);
  }

  async create(dto: CreateArticuloDto, empresaId: string) {
    const exists = await this.prisma.articulo.findUnique({
      where: { empresa_id_clave: { empresa_id: empresaId, clave: dto.clave } },
    });
    if (exists) throw new ConflictException(`La clave "${dto.clave}" ya existe`);

    const art = await this.prisma.articulo.create({
      data: { ...dto, empresa_id: empresaId },
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    return this.serialize(art);
  }

  async update(id: string, dto: Partial<CreateArticuloDto> & { activo?: boolean }, empresaId: string) {
    await this.findOne(id, empresaId);

    if (dto.clave) {
      const conflict = await this.prisma.articulo.findFirst({
        where: { empresa_id: empresaId, clave: dto.clave, NOT: { id } },
      });
      if (conflict) throw new ConflictException(`La clave "${dto.clave}" ya existe`);
    }

    const art = await this.prisma.articulo.update({
      where: { id },
      data: dto,
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    return this.serialize(art);
  }

  async updatePrecios(id: string, precios: Partial<Record<PrecioField, number>>, empresaId: string) {
    await this.findOne(id, empresaId);
    const art = await this.prisma.articulo.update({
      where: { id },
      data: precios,
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    return this.serialize(art);
  }

  async updateExistencias(id: string, existencias: Partial<Record<ExistenciaField, number>>, empresaId: string) {
    await this.findOne(id, empresaId);
    const art = await this.prisma.articulo.update({
      where: { id },
      data: existencias,
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    return this.serialize(art);
  }

  async deactivate(id: string, empresaId: string) {
    await this.findOne(id, empresaId);
    const art = await this.prisma.articulo.update({
      where: { id },
      data: { activo: false },
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    return this.serialize(art);
  }

  private serialize(art: Record<string, unknown>) {
    const result = { ...art };
    for (const f of [...PRECIO_FIELDS, ...EXISTENCIA_FIELDS]) {
      if (result[f] !== null && result[f] !== undefined) {
        result[f] = Number(result[f]);
      }
    }
    return result;
  }
}
