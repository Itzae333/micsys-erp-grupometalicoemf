import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUbicacionDto } from './dto/create-ubicacion.dto';
import type { UpdateUbicacionDto } from './dto/update-ubicacion.dto';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@Injectable()
export class UbicacionesService {
  constructor(private prisma: PrismaService) {}

  async findAll(empresaId: string, user: JwtPayload) {
    this.checkEmpresaAccess(empresaId, user);

    return this.prisma.ubicacion.findMany({
      where: { empresa_id: empresaId, activa: true },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });
  }

  async findOne(empresaId: string, id: string, user: JwtPayload) {
    this.checkEmpresaAccess(empresaId, user);

    const ubicacion = await this.prisma.ubicacion.findFirst({
      where: { id, empresa_id: empresaId },
      include: {
        config_columnas: {
          where: { activa: true },
          orderBy: { orden: 'asc' },
        },
      },
    });

    if (!ubicacion) throw new NotFoundException(`Ubicación ${id} no encontrada`);
    return ubicacion;
  }

  async create(empresaId: string, dto: CreateUbicacionDto, user: JwtPayload) {
    this.checkEmpresaAccess(empresaId, user);

    return this.prisma.ubicacion.create({
      data: { ...dto, empresa_id: empresaId },
    });
  }

  async update(empresaId: string, id: string, dto: UpdateUbicacionDto, user: JwtPayload) {
    this.checkEmpresaAccess(empresaId, user);
    await this.findOne(empresaId, id, user);

    return this.prisma.ubicacion.update({ where: { id }, data: dto });
  }

  async softDelete(empresaId: string, id: string, user: JwtPayload) {
    this.checkEmpresaAccess(empresaId, user);
    await this.findOne(empresaId, id, user);

    return this.prisma.ubicacion.update({
      where: { id },
      data: { activa: false },
    });
  }

  private checkEmpresaAccess(empresaId: string, user: JwtPayload) {
    if (user.rol === 'SUPER_USUARIO') return;
    if (user.empresa_id !== empresaId) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }
  }
}
