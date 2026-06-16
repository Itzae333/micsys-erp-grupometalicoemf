import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Writes an AuditLog row for every mutating request that responds with 2xx. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      headers: Record<string, string | string[] | undefined>;
      user?: JwtPayload;
      params?: Record<string, string>;
      socket?: { remoteAddress?: string };
    }>();

    if (!MUTATING_METHODS.has(req.method)) return next.handle();

    return next.handle().pipe(
      tap(async () => {
        try {
          const user  = req.user;
          const parts = req.url.replace(/\?.*$/, '').split('/').filter(Boolean);

          const empresaId  = (req.headers['x-empresa-id'] as string | undefined) ?? user?.empresa_id ?? null;
          const usuarioId  = user?.sub ?? null;
          const userName   = user ? `${user.nombre ?? ''} ${user.apellidos ?? ''}`.trim() || user.email : null;

          const forwarded = req.headers['x-forwarded-for'];
          const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
            ?? req.socket?.remoteAddress ?? null;

          const userAgent = req.headers['user-agent'] as string | undefined ?? null;

          const entidad   = parts[0] ?? 'unknown';
          const entidadId = parts[1] ?? req.params?.id ?? null;

          const accion = req.method === 'DELETE' ? 'DELETE'
            : req.method === 'POST' ? 'CREATE'
            : 'UPDATE';

          await this.prisma.auditLog.create({
            data: {
              empresa_id:   empresaId,
              usuario_id:   usuarioId,
              usuario_name: userName,
              accion,
              entidad,
              entidad_id:   entidadId,
              ip,
              user_agent:   userAgent ? userAgent.slice(0, 250) : null,
            },
          });
        } catch {
          // Audit failure must never break the request
        }
      }),
    );
  }
}
