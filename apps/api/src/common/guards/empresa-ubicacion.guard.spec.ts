import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmpresaUbicacionGuard } from './empresa-ubicacion.guard';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';

function mockContext(
  user: Partial<JwtPayload>,
  headers: Record<string, string> = {},
  params: Record<string, string> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, headers, params }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('EmpresaUbicacionGuard', () => {
  let guard: EmpresaUbicacionGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new EmpresaUbicacionGuard(reflector);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
  });

  it('permite SUPER_USUARIO sin validar empresa ni ubicación', () => {
    const ctx = mockContext({ rol: 'SUPER_USUARIO', empresa_id: 'a' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite ADMIN cuando la empresa coincide', () => {
    const ctx = mockContext(
      { rol: 'ADMIN', empresa_id: 'emf-id', ubicacion_ids: [] },
      { 'x-empresa-id': 'emf-id' },
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('niega ADMIN cuando la empresa no coincide', () => {
    const ctx = mockContext(
      { rol: 'ADMIN', empresa_id: 'emf-id', ubicacion_ids: [] },
      { 'x-empresa-id': 'otra-empresa-id' },
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('permite ENCARGADO cuando empresa y ubicación coinciden', () => {
    const ctx = mockContext(
      { rol: 'ENCARGADO', empresa_id: 'emf-id', ubicacion_ids: ['loc-1'] },
      { 'x-empresa-id': 'emf-id', 'x-ubicacion-id': 'loc-1' },
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('niega VENDEDOR cuando la ubicación no está asignada', () => {
    const ctx = mockContext(
      { rol: 'VENDEDOR', empresa_id: 'emf-id', ubicacion_ids: ['loc-1'] },
      { 'x-empresa-id': 'emf-id', 'x-ubicacion-id': 'loc-999' },
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('niega sin x-empresa-id cuando el rol lo requiere', () => {
    const ctx = mockContext(
      { rol: 'ENCARGADO', empresa_id: 'emf-id', ubicacion_ids: ['loc-1'] },
      {},
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
