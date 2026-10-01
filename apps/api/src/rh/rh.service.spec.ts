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

describe('RhService.listarEmpleados — búsqueda', () => {
  function build() {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const service = new RhService({ empleado: { findMany, count } } as unknown as PrismaService);
    return { service, findMany };
  }

  it('cada palabra se busca en nombre, apellidos o puesto', async () => {
    const { service, findMany } = build();
    await service.listarEmpleados('emp-1', { q: 'Pérez  Fer', page: 1, limit: 8 });
    const { where } = findMany.mock.calls[0][0];
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR.map((c: any) => Object.keys(c)[0])).toEqual(['nombre', 'apellidos', 'puesto']);
    expect(where.AND[1].OR[0].nombre.contains).toBe('Fer');
  });

  it('sin texto no agrega filtro de búsqueda', async () => {
    const { service, findMany } = build();
    await service.listarEmpleados('emp-1', { page: 1, limit: 8 });
    expect(findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });
});
