import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';

function mockContext(user: Partial<JwtPayload>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('permite el acceso cuando no hay roles requeridos', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = mockContext({ rol: 'VENDEDOR' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite el acceso cuando el rol del usuario está en la lista', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'SUPER_USUARIO']);
    const ctx = mockContext({ rol: 'ADMIN' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('niega el acceso cuando el rol del usuario no está en la lista', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'SUPER_USUARIO']);
    const ctx = mockContext({ rol: 'VENDEDOR' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('permite SUPER_USUARIO cuando está en la lista', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['SUPER_USUARIO']);
    const ctx = mockContext({ rol: 'SUPER_USUARIO' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('niega ENCARGADO en endpoint solo para ADMIN', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = mockContext({ rol: 'ENCARGADO' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
