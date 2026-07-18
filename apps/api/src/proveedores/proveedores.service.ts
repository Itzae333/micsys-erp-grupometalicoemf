import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProveedorDto } from './dto/create-proveedor.dto';

@Injectable()
export class ProveedoresService {
  constructor(private prisma: PrismaService) {}

  async findAll(empresaId: string, query: { q?: string; limit?: number } = {}) {
    const where: Record<string, unknown> = { empresa_id: empresaId, activo: true };
    if (query.q) {
      where['OR'] = [
        { nombre: { contains: query.q, mode: 'insensitive' } },
        { razon_social: { contains: query.q, mode: 'insensitive' } },
        { telefono: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const data = await this.prisma.proveedor.findMany({
      where,
      orderBy: { nombre: 'asc' },
      // Sin búsqueda ni límite explícito, se topa para no traer todo el
      // catálogo de proveedores de golpe.
      take: query.limit ?? (query.q ? undefined : 500),
    });

    return { data };
  }

  async findOne(id: string, empresaId: string) {
    const p = await this.prisma.proveedor.findFirst({
      where: { id, empresa_id: empresaId },
    });
    if (!p) throw new NotFoundException('Proveedor no encontrado');
    return p;
  }

  create(dto: CreateProveedorDto, empresaId: string) {
    return this.prisma.proveedor.create({
      data: { ...dto, empresa_id: empresaId },
    });
  }

  async update(id: string, dto: Partial<CreateProveedorDto>, empresaId: string) {
    await this.findOne(id, empresaId);
    return this.prisma.proveedor.update({ where: { id }, data: dto });
  }

  async deactivate(id: string, empresaId: string) {
    await this.findOne(id, empresaId);
    return this.prisma.proveedor.update({ where: { id }, data: { activo: false } });
  }
}
