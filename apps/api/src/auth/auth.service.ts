import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
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
    };

    const access_token = await this.signAccessToken(payload);
    const refresh_token = await this.createRefreshToken(usuario.id);

    return {
      access_token,
      refresh_token,
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

  async refresh(refreshToken: string) {
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        usuario: {
          include: { ubicaciones: { select: { ubicacion_id: true } } },
        },
      },
    });

    if (
      !tokenRecord ||
      tokenRecord.revocado ||
      tokenRecord.expires_at < new Date()
    ) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    // Rotación de refresh token
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revocado: true },
    });

    const { usuario } = tokenRecord;

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      apellidos: usuario.apellidos,
      rol: usuario.rol,
      empresa_id: usuario.empresa_id,
      ubicacion_ids: usuario.ubicaciones.map((u) => u.ubicacion_id),
      allowed_ips: usuario.allowed_ips,
    };

    const access_token = await this.signAccessToken(payload);
    const new_refresh_token = await this.createRefreshToken(usuario.id);

    return { access_token, refresh_token: new_refresh_token };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken
      .update({
        where: { token: refreshToken },
        data: { revocado: true },
      })
      .catch(() => {
        // Si no existe el token, no es un error — simplemente ignorar
      });
  }

  async me(userId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      include: {
        empresa: { select: { id: true, nombre: true, logo_url: true } },
        ubicaciones: {
          include: {
            ubicacion: { select: { id: true, nombre: true, tipo: true } },
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

  private async createRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const days = parseInt(expiresIn.replace('d', ''), 10);
    const expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { usuario_id: userId, token, expires_at },
    });

    return token;
  }
}
