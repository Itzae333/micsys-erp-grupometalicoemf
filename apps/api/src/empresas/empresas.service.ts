import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEmpresaDto } from './dto/create-empresa.dto';
import type { UpdateEmpresaDto } from './dto/update-empresa.dto';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@Injectable()
export class EmpresasService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: JwtPayload) {
    if (user.rol === 'SUPER_USUARIO') {
      return this.prisma.empresa.findMany({
        orderBy: { nombre: 'asc' },
        include: { _count: { select: { ubicaciones: true, usuarios: true } } },
      });
    }

    // Admin y demás roles solo ven su empresa
    return this.prisma.empresa.findMany({
      where: { id: user.empresa_id },
      include: { _count: { select: { ubicaciones: true, usuarios: true } } },
    });
  }

  async findOne(id: string, user: JwtPayload) {
    if (user.rol !== 'SUPER_USUARIO' && user.empresa_id !== id) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }

    const empresa = await this.prisma.empresa.findUnique({
      where: { id },
      include: {
        ubicaciones: { where: { activa: true }, orderBy: { nombre: 'asc' } },
        _count: { select: { usuarios: true } },
      },
    });

    if (!empresa) throw new NotFoundException(`Empresa ${id} no encontrada`);
    return empresa;
  }

  async create(dto: CreateEmpresaDto) {
    return this.prisma.empresa.create({ data: dto });
  }

  async update(id: string, dto: UpdateEmpresaDto, user: JwtPayload) {
    if (user.rol !== 'SUPER_USUARIO' && user.empresa_id !== id) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }

    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException(`Empresa ${id} no encontrada`);

    return this.prisma.empresa.update({ where: { id }, data: dto });
  }

  async updateLogo(id: string, logoUrl: string | null, user: JwtPayload) {
    if (user.rol !== 'SUPER_USUARIO' && user.empresa_id !== id) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }

    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException(`Empresa ${id} no encontrada`);

    return this.prisma.empresa.update({
      where: { id },
      data: { logo_url: logoUrl },
    });
  }
}
