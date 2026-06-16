import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import type { Request } from 'express';

@Injectable()
export class IpGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    // Sin autenticar o roles sin restricción
    if (!user || ['SUPER_USUARIO', 'ADMIN'].includes(user.rol)) return true;

    // Sin IPs configuradas = sin restricción
    if (!user.allowed_ips?.length) return true;

    // Obtener IP real del cliente (soporte para proxy/nginx)
    const forwarded = request.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) ??
      request.socket?.remoteAddress ??
      '';

    if (!user.allowed_ips.includes(clientIp)) {
      throw new ForbiddenException(
        `Acceso denegado desde esta red (${clientIp}). Comunícate con el administrador.`,
      );
    }

    return true;
  }
}
