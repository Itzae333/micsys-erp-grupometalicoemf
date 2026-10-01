import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RhService } from './rh.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('RhService.listarUsuariosDisponibles', () => {
  let findMany: ReturnType<typeof vi.fn>;
  let service: RhService;

  beforeEach(() => {
    findMany = vi.fn().mockResolvedValue([]);
    service = new RhService({ usuario: { findMany } } as unknown as PrismaService);
  });

  it('filtra por empresa, activos y sin empleado vinculado', async () => {
    await service.listarUsuariosDisponibles('emp-1');
    const { where } = findMany.mock.calls[0][0];
    expect(where.empresa_id).toBe('emp-1');
    expect(where.activo).toBe(true);
    expect(where.OR).toEqual([{ empleado: null }]);
  });

  it('al editar incluye también el usuario del empleado indicado', async () => {
    await service.listarUsuariosDisponibles('emp-1', 'empleado-9');
    const { where } = findMany.mock.calls[0][0];
    expect(where.OR).toEqual([{ empleado: null }, { empleado: { id: 'empleado-9' } }]);
  });
});
