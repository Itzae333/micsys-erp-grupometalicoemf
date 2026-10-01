import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { EntregasMateriaPrimaService } from './entregas-materia-prima.service';
import type { PrismaService } from '../prisma/prisma.service';

function build() {
  const articulo = { id: 'art-1', clave: 'LAM-01', activo: true, existencia_1: 10 };
  const tx: any = {
    entregaMateriaPrima: {
      create: vi.fn().mockResolvedValue({ id: 'ent-1' }),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ lineas: [], devoluciones: [] }),
      update: vi.fn(),
    },
    articulo: {
      findFirst: vi.fn().mockResolvedValue(articulo),
      findUniqueOrThrow: vi.fn().mockResolvedValue(articulo),
      update: vi.fn(),
    },
    movimientoInventario: { create: vi.fn().mockResolvedValue({ id: 'mov-1' }) },
    entregaMateriaPrimaLinea: { create: vi.fn() },
    devolucionMateriaPrima: { create: vi.fn().mockResolvedValue({ id: 'dev-1' }) },
    devolucionMateriaPrimaLinea: { create: vi.fn() },
  };
  const prisma = {
    area: { findFirst: vi.fn().mockResolvedValue({ id: 'area-1', nombre: 'Corte', activa: true }) },
    empleado: { findFirst: vi.fn().mockResolvedValue({ nombre: 'Juan', apellidos: 'Pérez' }) },
    $transaction: vi.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const service = new EntregasMateriaPrimaService(prisma as unknown as PrismaService);
  return { service, tx, prisma };
}

describe('EntregasMateriaPrimaService.crear', () => {
  it('descuenta la existencia y registra el movimiento de SALIDA', async () => {
    const { service, tx } = build();
    await service.crear(
      { area_id: 'area-1', empleado_id: 'emp-1', lineas: [{ articulo_id: 'art-1', existencia_num: 1, cantidad: 3 }] },
      'empresa-1', 'ub-1', 'user-1',
    );
    const mov = tx.movimientoInventario.create.mock.calls[0][0].data;
    expect(mov.tipo).toBe('SALIDA');
    expect(mov.cantidad_antes).toBe(10);
    expect(mov.cantidad_despues).toBe(7);
    expect(mov.concepto).toBe('Entrega a Corte — Juan Pérez');
    expect(tx.articulo.update).toHaveBeenCalledWith({ where: { id: 'art-1' }, data: { existencia_1: 7 } });
  });

  it('rechaza si la existencia es insuficiente', async () => {
    const { service, tx } = build();
    await expect(
      service.crear(
        { area_id: 'area-1', lineas: [{ articulo_id: 'art-1', existencia_num: 1, cantidad: 11 }] },
        'empresa-1', 'ub-1', 'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.movimientoInventario.create).not.toHaveBeenCalled();
  });
});

describe('EntregasMateriaPrimaService.registrarDevolucion', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build();
    ctx.tx.entregaMateriaPrima.findFirst.mockResolvedValue({
      id: 'ent-1',
      estatus: 'ACTIVA',
      area: { nombre: 'Corte' },
      lineas: [{
        id: 'lin-1', articulo_id: 'art-1', existencia_num: 1, cantidad: 5,
        devoluciones: [{ cantidad: 1 }],
        articulo: { clave: 'LAM-01' },
      }],
    });
  });

  it('SOBRANTE regresa existencia con un movimiento de ENTRADA', async () => {
    await ctx.service.registrarDevolucion(
      'ent-1', { lineas: [{ entrega_linea_id: 'lin-1', tipo: 'SOBRANTE', cantidad: 2 }] }, 'ub-1', 'user-1',
    );
    const mov = ctx.tx.movimientoInventario.create.mock.calls[0][0].data;
    expect(mov.tipo).toBe('ENTRADA');
    expect(mov.cantidad_despues).toBe(12);
    expect(ctx.tx.devolucionMateriaPrimaLinea.create.mock.calls[0][0].data.movimiento_id).toBe('mov-1');
  });

  it('MERMA y DEFECTUOSO no tocan la existencia', async () => {
    await ctx.service.registrarDevolucion(
      'ent-1',
      { lineas: [
        { entrega_linea_id: 'lin-1', tipo: 'MERMA', cantidad: 1 },
        { entrega_linea_id: 'lin-1', tipo: 'DEFECTUOSO', cantidad: 1 },
      ] },
      'ub-1', 'user-1',
    );
    expect(ctx.tx.movimientoInventario.create).not.toHaveBeenCalled();
    expect(ctx.tx.articulo.update).not.toHaveBeenCalled();
    expect(ctx.tx.devolucionMateriaPrimaLinea.create).toHaveBeenCalledTimes(2);
  });

  it('rechaza devolver más de lo entregado menos lo ya devuelto', async () => {
    // entregado 5, ya devuelto 1 → quedan 4; 3 + 2 en la misma solicitud excede
    await expect(
      ctx.service.registrarDevolucion(
        'ent-1',
        { lineas: [
          { entrega_linea_id: 'lin-1', tipo: 'SOBRANTE', cantidad: 3 },
          { entrega_linea_id: 'lin-1', tipo: 'MERMA', cantidad: 2 },
        ] },
        'ub-1', 'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza devoluciones sobre una entrega cancelada', async () => {
    ctx.tx.entregaMateriaPrima.findFirst.mockResolvedValue({ id: 'ent-1', estatus: 'CANCELADA', lineas: [] });
    await expect(
      ctx.service.registrarDevolucion(
        'ent-1', { lineas: [{ entrega_linea_id: 'lin-1', tipo: 'SOBRANTE', cantidad: 1 }] }, 'ub-1', 'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('EntregasMateriaPrimaService.cancelar', () => {
  it('no permite cancelar si ya hay devoluciones', async () => {
    const { service, tx } = build();
    tx.entregaMateriaPrima.findFirst.mockResolvedValue({
      id: 'ent-1', estatus: 'ACTIVA', area: { nombre: 'Corte' }, lineas: [], devoluciones: [{ id: 'd1' }],
    });
    await expect(service.cancelar('ent-1', 'ub-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('restituye la existencia de cada línea y marca CANCELADA', async () => {
    const { service, tx } = build();
    tx.entregaMateriaPrima.findFirst.mockResolvedValue({
      id: 'ent-1', estatus: 'ACTIVA', area: { nombre: 'Corte' }, devoluciones: [],
      lineas: [{ articulo_id: 'art-1', existencia_num: 1, cantidad: 4 }],
    });
    await service.cancelar('ent-1', 'ub-1', 'user-1');
    expect(tx.movimientoInventario.create.mock.calls[0][0].data.cantidad_despues).toBe(14);
    expect(tx.entregaMateriaPrima.update).toHaveBeenCalledWith({ where: { id: 'ent-1' }, data: { estatus: 'CANCELADA' } });
  });
});

describe('EntregasMateriaPrimaService.reporte', () => {
  it('agrega por área/empleado separando neto, merma y defectuoso', async () => {
    const { service, prisma } = build();
    (prisma as any).entregaMateriaPrima = {
      findMany: vi.fn().mockResolvedValue([{
        area: { id: 'a1', nombre: 'Corte' },
        empleado: { id: 'e1', nombre: 'Juan', apellidos: 'Pérez' },
        lineas: [{
          cantidad: 10,
          articulo: { id: 'art-1', clave: 'LAM-01', descripcion_1: 'Lámina' },
          devoluciones: [
            { tipo: 'SOBRANTE', cantidad: 2 },
            { tipo: 'MERMA', cantidad: 1 },
            { tipo: 'DEFECTUOSO', cantidad: 1 },
          ],
        }],
      }]),
    };
    const r = await service.reporte('ub-1');
    expect(r.por_area[0]).toMatchObject({ nombre: 'Corte', entregado: 10, devuelto: 2, merma: 1, defectuoso: 1, neto: 8 });
    expect(r.por_empleado[0].nombre).toBe('Juan Pérez');
    expect(r.por_articulo[0].neto).toBe(8);
  });
});
