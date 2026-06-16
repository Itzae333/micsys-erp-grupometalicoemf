import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUsuarioDto } from './dto/create-usuario.dto';
import type { UpdateUsuarioDto } from './dto/update-usuario.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: JwtPayload) {
    // ADMIN solo ve usuarios de su empresa, excluyendo SUPER_USUARIO (rol de sistema)
    const where =
      user.rol === 'SUPER_USUARIO'
        ? {}
        : { empresa_id: user.empresa_id, rol: { not: 'SUPER_USUARIO' as const } };

    return this.prisma.usuario.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        apellidos: true,
        email: true,
        rol: true,
        activo: true,
        ultimo_acceso: true,
        allowed_ips: true,
        empresa: { select: { id: true, nombre: true } },
        ubicaciones: {
          include: { ubicacion: { select: { id: true, nombre: true, tipo: true } } },
        },
      },
      orderBy: [{ empresa: { nombre: 'asc' } }, { nombre: 'asc' }],
    });
  }

  async findOne(id: string, user: JwtPayload) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        apellidos: true,
        email: true,
        rol: true,
        activo: true,
        ultimo_acceso: true,
        allowed_ips: true,
        empresa_id: true,
        empresa: { select: { id: true, nombre: true } },
        ubicaciones: {
          include: { ubicacion: { select: { id: true, nombre: true, tipo: true } } },
        },
      },
    });

    if (!usuario) throw new NotFoundException(`Usuario ${id} no encontrado`);

    if (user.rol !== 'SUPER_USUARIO' && usuario.empresa_id !== user.empresa_id) {
      throw new ForbiddenException('No tienes acceso a este usuario');
    }

    return usuario;
  }

  async create(dto: CreateUsuarioDto, user: JwtPayload) {
    if (!['SUPER_USUARIO', 'ADMIN'].includes(user.rol)) {
      throw new ForbiddenException('No tienes permiso para crear usuarios');
    }

    // ADMIN no puede crear SUPER_USUARIO
    if (user.rol === 'ADMIN' && dto.rol === 'SUPER_USUARIO') {
      throw new ForbiddenException('No puedes crear un Super Usuario');
    }

    const empresaId = user.empresa_id;

    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) {
      throw new ConflictException(`Ya existe un usuario con el correo ${dto.email}`);
    }

    // Valida que las ubicaciones pertenecen a la empresa
    const ubicaciones = await this.prisma.ubicacion.findMany({
      where: { id: { in: dto.ubicacion_ids }, empresa_id: empresaId },
    });

    if (ubicaciones.length !== dto.ubicacion_ids.length) {
      throw new BadRequestException('Una o más ubicaciones no pertenecen a esta empresa');
    }

    const password_hash = await argon2.hash(dto.password);

    const { ubicacion_ids, password, ...rest } = dto;
    void password;

    return this.prisma.usuario.create({
      data: {
        ...rest,
        password_hash,
        empresa_id: empresaId,
        ubicaciones: {
          create: ubicacion_ids.map((id) => ({ ubicacion_id: id })),
        },
      },
      include: {
        ubicaciones: {
          include: { ubicacion: { select: { id: true, nombre: true } } },
        },
      },
    });
  }

  async update(id: string, dto: UpdateUsuarioDto, user: JwtPayload) {
    const target = await this.findOne(id, user);

    // ADMIN no puede modificar ni escalar a SUPER_USUARIO
    if (user.rol === 'ADMIN') {
      if (target.rol === 'SUPER_USUARIO' || dto.rol === 'SUPER_USUARIO') {
        throw new ForbiddenException('No puedes modificar un Super Usuario');
      }
    }

    if (dto.ubicacion_ids) {
      // Reemplaza todas las asignaciones
      await this.prisma.usuarioUbicacion.deleteMany({ where: { usuario_id: id } });
      await this.prisma.usuarioUbicacion.createMany({
        data: dto.ubicacion_ids.map((uid) => ({ usuario_id: id, ubicacion_id: uid })),
      });
    }

    const { ubicacion_ids, ...rest } = dto;
    void ubicacion_ids;
    void target;

    return this.prisma.usuario.update({
      where: { id },
      data: rest,
      include: {
        ubicaciones: {
          include: { ubicacion: { select: { id: true, nombre: true } } },
        },
      },
    });
  }

  async resetPassword(id: string, dto: ResetPasswordDto, user: JwtPayload) {
    await this.findOne(id, user);
    const password_hash = await argon2.hash(dto.nueva_password);
    await this.prisma.usuario.update({ where: { id }, data: { password_hash } });
    return { message: 'Contraseña actualizada correctamente' };
  }

  async softDelete(id: string, user: JwtPayload) {
    await this.findOne(id, user);

    // No puede desactivarse a sí mismo
    if (id === user.sub) {
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    return this.prisma.usuario.update({
      where: { id },
      data: { activo: false },
    });
  }
}
