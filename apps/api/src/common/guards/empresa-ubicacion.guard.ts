import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';

export const SKIP_EMPRESA_UBICACION_KEY = 'skipEmpresaUbicacion';

@Injectable()
export class EmpresaUbicacionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_EMPRESA_UBICACION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<{
      user: JwtPayload;
      headers: Record<string, string>;
      params: Record<string, string>;
    }>();

    const user = request.user;

    // Super Usuario tiene acceso a todo — no necesita validación de empresa
    if (user.rol === 'SUPER_USUARIO') return true;

    // Obtiene empresa_id del header o del parámetro de ruta
    const empresaId =
      request.headers['x-empresa-id'] ??
      request.params['empresaId'];

    if (!empresaId) {
      throw new ForbiddenException('Se requiere el contexto de empresa (x-empresa-id)');
    }

    if (user.empresa_id !== empresaId) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }

    // Admin tiene acceso a todas las ubicaciones de su empresa
    if (user.rol === 'ADMIN') return true;

    // Para los demás roles, valida también la ubicación
    const ubicacionId =
      request.headers['x-ubicacion-id'] ??
      request.params['ubicacionId'];

    if (!ubicacionId) {
      throw new ForbiddenException('Se requiere el contexto de ubicación (x-ubicacion-id)');
    }

    if (!user.ubicacion_ids.includes(ubicacionId)) {
      throw new ForbiddenException('No tienes acceso a esta ubicación');
    }

    return true;
  }
}
