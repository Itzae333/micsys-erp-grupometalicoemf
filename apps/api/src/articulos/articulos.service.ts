import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@grupometalicoemf/database';
import type { CreateArticuloDto } from './dto/create-articulo.dto';

interface ListQuery {
  q?: string;
  page?: number;
  limit?: number;
  activo?: boolean;
  proveedorId?: string;
  // Solo los ocultos (productos especiales ocultados); por defecto se excluyen.
  ocultos?: boolean;
}

// Sentinel usado por el filtro de Inventario para "artículos sin proveedor
// asignado" — proveedorId normal filtra por igualdad, este valor filtra por
// proveedor_id: null (ver findAll).
const SIN_PROVEEDOR = '__sin_proveedor__';

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

  async findAll(ubicacionId: string, query: ListQuery = {}) {
    const { q, page = 1, limit = 50, activo, proveedorId, ocultos = false } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { ubicacion_id: ubicacionId, oculto: ocultos };
    if (activo !== undefined) where['activo'] = activo;
    if (proveedorId === SIN_PROVEEDOR) where['proveedor_id'] = null;
    else if (proveedorId) where['proveedor_id'] = proveedorId;
    if (q) {
      const words = q.trim().split(/\s+/).filter(Boolean);
      where['AND'] = words.map((word) => ({
        OR: [
          { clave:         { contains: word, mode: 'insensitive' } },
          { descripcion_1: { contains: word, mode: 'insensitive' } },
          { descripcion_2: { contains: word, mode: 'insensitive' } },
          { descripcion_3: { contains: word, mode: 'insensitive' } },
          { descripcion_4: { contains: word, mode: 'insensitive' } },
          { descripcion_5: { contains: word, mode: 'insensitive' } },
        ],
      }));
    }

    const [total, data, conProveedor] = await Promise.all([
      this.prisma.articulo.count({ where }),
      this.prisma.articulo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { clave: 'asc' },
        include: { proveedor: { select: { id: true, nombre: true } } },
      }),
      // Independiente de la página/búsqueda actual: el front usa esto para
      // decidir si muestra la columna "Proveedor" en toda la tabla, no solo
      // en la página visible.
      this.prisma.articulo.count({ where: { ubicacion_id: ubicacionId, proveedor_id: { not: null } } }),
    ]);

    const comprometidos = await this.comprometidoPorArticulo(ubicacionId, data.map((a) => a.id));

    return {
      data: data.map((a) => ({ ...this.serialize(a), comprometido: comprometidos.get(a.id) ?? 0 })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      algun_proveedor_asignado: conProveedor > 0,
    };
  }

  // Piezas ya vendidas (nota cobrada/a crédito/incompleta) que todavía no se
  // cargan: la existencia sólo baja al cargar (ver CargasNotaService), así que
  // sin esto el mismo stock se podría prometer a dos clientes.
  async comprometidoPorArticulo(ubicacionId: string, ids: string[]): Promise<Map<string, number>> {
    const res = new Map<string, number>();
    if (ids.length === 0) return res;
    const lineas = await this.prisma.notaVentaLinea.findMany({
      where: {
        articulo_id: { in: ids },
        nota: {
          ubicacion_id: ubicacionId,
          estatus: { in: ['PAGADA', 'CREDITO', 'INCOMPLETA'] },
          OR: [{ estatus_entrega: null }, { estatus_entrega: { not: 'COMPLETA' } }],
        },
      },
      select: {
        articulo_id: true,
        cantidad: true,
        carga_lineas: { where: { carga: { anulada: false } }, select: { cantidad_cargada: true } },
      },
    });
    for (const l of lineas) {
      const cargado = l.carga_lineas.reduce((s, c) => s + Number(c.cantidad_cargada), 0);
      const pendiente = Number(l.cantidad) - cargado;
      if (pendiente > 0) res.set(l.articulo_id, +((res.get(l.articulo_id) ?? 0) + pendiente).toFixed(3));
    }
    return res;
  }

  async findOne(id: string, ubicacionId: string) {
    const art = await this.prisma.articulo.findFirst({
      where: { id, ubicacion_id: ubicacionId },
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    if (!art) throw new NotFoundException('Artículo no encontrado');
    return this.serialize(art);
  }

  async findByClave(clave: string, ubicacionId: string) {
    const art = await this.prisma.articulo.findUnique({
      where: { ubicacion_id_clave: { ubicacion_id: ubicacionId, clave } },
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    if (!art) throw new NotFoundException('Artículo no encontrado');
    return this.serialize(art);
  }

  async create(dto: CreateArticuloDto, ubicacionId: string) {
    const exists = await this.prisma.articulo.findUnique({
      where: { ubicacion_id_clave: { ubicacion_id: ubicacionId, clave: dto.clave } },
    });
    if (exists) throw new ConflictException(`La clave "${dto.clave}" ya existe`);

    const art = await this.prisma.articulo.create({
      data: { ...dto, ubicacion_id: ubicacionId },
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    return this.serialize(art);
  }

  async update(id: string, dto: Partial<CreateArticuloDto> & { activo?: boolean }, ubicacionId: string) {
    await this.findOne(id, ubicacionId);

    if (dto.clave) {
      const conflict = await this.prisma.articulo.findFirst({
        where: { ubicacion_id: ubicacionId, clave: dto.clave, NOT: { id } },
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

  async updatePrecios(id: string, precios: Partial<Record<PrecioField, number>>, ubicacionId: string) {
    await this.findOne(id, ubicacionId);
    const art = await this.prisma.articulo.update({
      where: { id },
      data: precios,
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    return this.serialize(art);
  }

  async updateExistencias(id: string, existencias: Partial<Record<ExistenciaField, number>>, ubicacionId: string) {
    await this.findOne(id, ubicacionId);
    const art = await this.prisma.articulo.update({
      where: { id },
      data: existencias,
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    return this.serialize(art);
  }

  // Los productos especiales no se borran (rompería notas y kardex): solo se
  // ocultan del inventario y de las búsquedas.
  async setOculto(id: string, oculto: boolean, ubicacionId: string) {
    const art = await this.findOne(id, ubicacionId);
    if (!art['es_especial']) {
      throw new ConflictException('Solo los productos especiales se pueden ocultar');
    }
    const updated = await this.prisma.articulo.update({
      where: { id },
      data: { oculto },
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    return this.serialize(updated);
  }

  async remove(id: string, ubicacionId: string) {
    await this.findOne(id, ubicacionId);

    const tieneVentas = await this.prisma.notaVentaLinea.findFirst({
      where: { articulo_id: id },
      select: { id: true },
    });
    if (tieneVentas) {
      throw new ConflictException(
        'No se puede eliminar: el artículo tiene ventas registradas. Desactívalo en su lugar.',
      );
    }

    try {
      await this.prisma.articulo.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          'No se puede eliminar: el artículo tiene movimientos, compras, pedidos o remisiones asociadas. Desactívalo en su lugar.',
        );
      }
      throw err;
    }

    return { ok: true };
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
