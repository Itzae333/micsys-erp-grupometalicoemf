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
import type { RolUsuario } from '@grupometalicoemf/database';
import { refreshExpiresInMs } from './refresh-expiry.util';

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
    const refreshTokenRow = await this.createRefreshTokenRow(usuario.id);

    return {
      access_token,
      refresh_token: refreshTokenRow.token,
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
    // Margen de gracia: si la respuesta de una rotación anterior se perdió
    // (redeploy, tablet dormida, wifi cortado) justo después de que el
    // servidor ya marcó el token viejo como usado, el navegador NO reintenta
    // de inmediato — sigue con el access token viejo hasta que le toque
    // renovar de nuevo (proactivo ~2 min antes de vencer, o hasta 30 min
    // después si nadie usó la app) o hasta que termine su backoff de red.
    // Por eso el margen tiene que ser de minutos, no de segundos, o el
    // reintento real llega después de que ya expiró y rechaza una sesión
    // sana. En vez de rechazarlo, se reentrega el MISMO par ya generado.
    const GRACE_MS = 15 * 60 * 1000;

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        usuario: {
          include: { ubicaciones: { select: { ubicacion_id: true } } },
        },
        replaced_by: true,
      },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (tokenRecord.revocado) {
      const dentroDeGracia = !!tokenRecord.revocado_at
        && Date.now() - tokenRecord.revocado_at.getTime() < GRACE_MS;
      if (!dentroDeGracia || !tokenRecord.replaced_by) {
        throw new UnauthorizedException('Refresh token inválido o expirado');
      }
      const access_token = await this.signAccessToken(this.buildJwtPayload(tokenRecord.usuario));
      return { access_token, refresh_token: tokenRecord.replaced_by.token };
    }

    if (tokenRecord.expires_at < new Date()) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const { usuario } = tokenRecord;
    const access_token = await this.signAccessToken(this.buildJwtPayload(usuario));
    const newTokenRow = await this.createRefreshTokenRow(usuario.id);

    // Rotación: se marca el token viejo como usado y se enlaza al nuevo, en
    // vez de solo revocarlo, para poder recuperar el mismo par si el
    // refresh se repite dentro del margen de gracia de arriba.
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revocado: true, revocado_at: new Date(), replaced_by_id: newTokenRow.id },
    });

    return { access_token, refresh_token: newTokenRow.token };
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

  async getSessions(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { usuario_id: userId, revocado: false, expires_at: { gt: new Date() } },
      select: { id: true, created_at: true, expires_at: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async revokeAllSessions(userId: string, exceptToken?: string) {
    const where: { usuario_id: string; revocado: boolean; token?: { not: string } } = {
      usuario_id: userId,
      revocado: false,
    };
    if (exceptToken) where.token = { not: exceptToken };
    await this.prisma.refreshToken.updateMany({ where, data: { revocado: true } });
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

  private buildJwtPayload(usuario: {
    id: string; email: string; nombre: string; apellidos: string;
    rol: RolUsuario; empresa_id: string; allowed_ips: string[];
    ubicaciones: { ubicacion_id: string }[];
  }): JwtPayload {
    return {
      sub: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      apellidos: usuario.apellidos,
      rol: usuario.rol,
      empresa_id: usuario.empresa_id,
      ubicacion_ids: usuario.ubicaciones.map((u) => u.ubicacion_id),
      allowed_ips: usuario.allowed_ips,
    };
  }

  private async signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      // ms@3 StringValue branded type — config value is a valid ms string at runtime
      expiresIn: (this.config.get('JWT_EXPIRES_IN') ?? '15m') as unknown as number,
    });
  }

  private async createRefreshTokenRow(userId: string) {
    const token = randomBytes(64).toString('hex');
    const expires_at = new Date(Date.now() + refreshExpiresInMs(this.config));

    return this.prisma.refreshToken.create({
      data: { usuario_id: userId, token, expires_at },
    });
  }
}
