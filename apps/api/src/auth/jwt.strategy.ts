import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'fallback-secret',
    });
  }

  // El access token dura años — por sí solo (firma + exp) ya no alcanza para
  // saber si sigue vigente. Esta consulta (barata, por llave primaria, se
  // paga en cada request porque el guard es global) es lo único que permite
  // que "cerrar todas las sesiones" y desactivar un usuario sigan matando la
  // sesión de verdad, sin importar cuánto le falte al token para expirar.
  // De paso se refrescan rol/empresa/ubicaciones/IPs permitidas contra BD en
  // vez de confiar en la foto que traía el JWT firmado hace tiempo.
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sub) throw new UnauthorizedException('Token inválido');

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: {
        activo: true,
        token_version: true,
        rol: true,
        empresa_id: true,
        allowed_ips: true,
        ubicaciones: { select: { ubicacion_id: true } },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Sesión inválida');
    }
    if (usuario.token_version !== payload.token_version) {
      throw new UnauthorizedException('Sesión revocada');
    }

    return {
      ...payload,
      rol: usuario.rol,
      empresa_id: usuario.empresa_id,
      ubicacion_ids: usuario.ubicaciones.map((u) => u.ubicacion_id),
      allowed_ips: usuario.allowed_ips,
    };
  }
}
