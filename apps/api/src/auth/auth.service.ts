import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: { ubicaciones: { select: { ubicacion_id: true } } },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Correo electrónico o contraseña incorrectos');
    }

    const passwordValido = await argon2.verify(usuario.password_hash, password);
    if (!passwordValido) {
      throw new UnauthorizedException('Correo electrónico o contraseña incorrectos');
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimo_acceso: new Date() },
    });

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      apellidos: usuario.apellidos,
      rol: usuario.rol,
      empresa_id: usuario.empresa_id,
      ubicacion_ids: usuario.ubicaciones.map((u) => u.ubicacion_id),
      allowed_ips: usuario.allowed_ips,
      token_version: usuario.token_version,
    };

    const access_token = await this.signAccessToken(payload);

    return {
      access_token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellidos: usuario.apellidos,
        email: usuario.email,
        rol: usuario.rol,
        empresa_id: usuario.empresa_id,
        ubicacion_ids: payload.ubicacion_ids,
      },
    };
  }

  // "Cerrar todas las sesiones" — incrementa el contador de versión del
  // usuario. Cualquier access token ya emitido (los que traen una versión
  // anterior) deja de validar al instante en JwtStrategy, sin importar
  // cuánto le falte para expirar por su cuenta.
  async revokeAllSessions(usuarioId: string): Promise<void> {
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { token_version: { increment: 1 } },
    });
  }

  async me(userId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      include: {
        empresa: { select: { id: true, nombre: true, logo_url: true } },
        ubicaciones: {
          include: {
            ubicacion: {
            select: {
              id: true,
              nombre: true,
              tipo: true,
              logo_url: true,
              razon_social: true,
              rfc: true,
              regimen_fiscal: true,
              calle: true,
              num_ext: true,
              num_int: true,
              colonia: true,
              municipio: true,
              estado: true,
              cp: true,
              telefono: true,
            },
          },
          },
        },
      },
    });

    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const { password_hash, ...rest } = usuario;
    void password_hash;
    return rest;
  }

  private async signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      // ms@3 StringValue branded type — config value is a valid ms string at runtime
      expiresIn: (this.config.get('JWT_EXPIRES_IN') ?? '15m') as unknown as number,
    });
  }
}
