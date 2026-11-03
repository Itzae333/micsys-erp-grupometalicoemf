import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

const sha = (s: string) => createHash('sha256').update(s).digest();

/**
 * Autentica las llamadas del CRM con una API key de servicio (`x-api-key`).
 * Si `INTEGRACION_API_KEY` no está definida, el módulo queda apagado (503):
 * nunca se acepta una llave vacía.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const esperada = process.env.INTEGRACION_API_KEY;
    if (!esperada || esperada.length < 24) {
      throw new ServiceUnavailableException('La integración con el CRM no está activada.');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const recibida = req.headers['x-api-key'];
    if (typeof recibida !== 'string' || !timingSafeEqual(sha(recibida), sha(esperada))) {
      throw new UnauthorizedException('API key inválida');
    }
    return true;
  }
}
