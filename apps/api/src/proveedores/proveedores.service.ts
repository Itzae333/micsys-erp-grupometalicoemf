import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProveedorDto } from './dto/create-proveedor.dto';

@Injectable()
export class ProveedoresService {
  constructor(private prisma: PrismaService) {}

  findAll(empresaId: string) {
    return this.prisma.proveedor.findMany({
      where: { empresa_id: empresaId, activo: true },
      orderBy: { nombre: 'asc' },
    });
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
