import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@grupometalicoemf/database';

function serializeDecimal(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'object' && 'toNumber' in (obj as object)) {
    return (obj as { toNumber(): number }).toNumber();
  }
  if (Array.isArray(obj)) return obj.map(serializeDecimal);
  if (typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, serializeDecimal(v)]),
    );
  }
  return obj;
}

function dec(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object' && 'toNumber' in (v as object)) return (v as { toNumber(): number }).toNumber();
  return Number(v);
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

type DiaVenta = { dia: string; total: number; count: number };

@Injectable()
export class ReportesService {
  constructor(private prisma: PrismaService) {}

  // ── Dashboard ──────────────────────────────────────────────

  async getDashboard(empresaId: string) {
    const hoy = new Date();
    const iniHoy = startOfDay(hoy);
    const finHoy = endOfDay(hoy);
    const iniMes = startOfMonth(hoy);

    const [
      ventasHoy,
      ventasMes,
      notasPendientes,
      clientesConSaldo,
      opsActivas,
      proveedoresConSaldo,
      entradasHoy,
      topArticulosMes,
      ventasDiariasRaw,
    ] = await Promise.all([
      this.prisma.notaVenta.aggregate({
        where: {
          empresa_id: empresaId,
          estatus: { in: ['PAGADA', 'CREDITO'] },
          created_at: { gte: iniHoy, lte: finHoy },
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.notaVenta.aggregate({
        where: {
          empresa_id: empresaId,
          estatus: { in: ['PAGADA', 'CREDITO'] },
          created_at: { gte: iniMes },
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.notaVenta.count({
        where: { empresa_id: empresaId, estatus: { in: ['ABIERTA', 'PENDIENTE'] } },
      }),
      this.prisma.cliente.count({
        where: { empresa_id: empresaId, saldo_pendiente: { gt: 0 } },
      }),
      this.prisma.ordenProduccion.count({
        where: { empresa_id: empresaId, estatus: { in: ['ABIERTA', 'EN_PROCESO'] } },
      }),
      this.prisma.proveedor.count({
        where: { empresa_id: empresaId, saldo_pendiente: { gt: 0 } },
      }),
      this.prisma.movimientoInventario.count({
        where: {
          empresa_id: empresaId,
          tipo: 'ENTRADA',
          created_at: { gte: iniHoy, lte: finHoy },
        },
      }),
      this.prisma.notaVentaLinea.groupBy({
        by: ['articulo_id', 'clave'],
        where: {
          nota: {
            empresa_id: empresaId,
            estatus: { in: ['PAGADA', 'CREDITO'] },
            created_at: { gte: iniMes },
          },
        },
        _sum: { subtotal: true, cantidad: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 5,
      }),
      this.prisma.$queryRaw<Array<{ dia: string; total: string; count: bigint }>>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS dia,
          CAST(SUM(total) AS FLOAT8)                          AS total,
          CAST(COUNT(*) AS INT4)                              AS count
        FROM notas_venta
        WHERE empresa_id = ${empresaId}
          AND estatus IN ('PAGADA', 'CREDITO')
          AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY dia
      `,
    ]);

    const ventasDiarias: DiaVenta[] = ventasDiariasRaw.map((r) => ({
      dia: r.dia,
      total: Number(r.total),
      count: Number(r.count),
    }));

    return {
      ventas_hoy: {
        total: dec(ventasHoy._sum?.total),
        count: ventasHoy._count,
      },
      ventas_mes: {
        total: dec(ventasMes._sum?.total),
        count: ventasMes._count,
      },
      notas_pendientes: notasPendientes,
      clientes_con_saldo: clientesConSaldo,
      ops_activas: opsActivas,
      proveedores_con_saldo: proveedoresConSaldo,
      entradas_hoy: entradasHoy,
      top_articulos_mes: topArticulosMes.map((a) => ({
        articulo_id: a.articulo_id,
        clave: a.clave,
        cantidad: dec(a._sum?.cantidad),
        subtotal: dec(a._sum?.subtotal),
      })),
      ventas_diarias: ventasDiarias,
    };
  }

  // ── Ventas ─────────────────────────────────────────────────

  async getReporteVentas(
    empresaId: string,
    opts: { desde?: string; hasta?: string; ubicacionId?: string },
  ) {
    const desde = opts.desde ? new Date(opts.desde) : startOfMonth(new Date());
    const hasta = opts.hasta ? endOfDay(new Date(opts.hasta)) : endOfDay(new Date());

    const baseWhere: Prisma.NotaVentaWhereInput = {
      empresa_id: empresaId,
      created_at: { gte: desde, lte: hasta },
      ...(opts.ubicacionId ? { ubicacion_id: opts.ubicacionId } : {}),
    };
    const cerradasWhere: Prisma.NotaVentaWhereInput = {
      ...baseWhere,
      estatus: { in: ['PAGADA', 'CREDITO'] },
    };

    const [resumen, porEstatus, porMetodoPago, topClientesRaw, ventasDiariasRaw] =
      await Promise.all([
        this.prisma.notaVenta.aggregate({
          where: cerradasWhere,
          _sum: { total: true, subtotal: true, descuento: true },
          _count: true,
        }),
        this.prisma.notaVenta.groupBy({
          by: ['estatus'],
          where: baseWhere,
          _count: { _all: true },
          _sum: { total: true },
        }),
        this.prisma.pago.groupBy({
          by: ['metodo'],
          where: {
            nota: {
              empresa_id: empresaId,
              estatus: { in: ['PAGADA', 'CREDITO'] },
              created_at: { gte: desde, lte: hasta },
            },
          },
          _sum: { monto: true },
          _count: { _all: true },
        }),
        this.prisma.notaVenta.groupBy({
          by: ['cliente_id'],
          where: { ...cerradasWhere, cliente_id: { not: null } },
          _sum: { total: true },
          _count: { _all: true },
          orderBy: { _sum: { total: 'desc' } },
          take: 10,
        }),
        this.prisma.$queryRaw<Array<{ dia: string; total: string; count: bigint }>>`
          SELECT
            TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS dia,
            CAST(SUM(total) AS FLOAT8)                          AS total,
            CAST(COUNT(*) AS INT4)                              AS count
          FROM notas_venta
          WHERE empresa_id = ${empresaId}
            AND estatus IN ('PAGADA', 'CREDITO')
            AND created_at >= ${desde}
            AND created_at <= ${hasta}
          GROUP BY DATE_TRUNC('day', created_at)
          ORDER BY dia
        `,
      ]);

    const clienteIds = topClientesRaw
      .filter((c) => c.cliente_id)
      .map((c) => c.cliente_id as string);
    const clientes = clienteIds.length
      ? await this.prisma.cliente.findMany({
          where: { id: { in: clienteIds } },
          select: { id: true, nombre: true, apellidos: true, razon_social: true },
        })
      : [];
    const clienteMap = new Map(clientes.map((c) => [c.id, c]));

    return {
      resumen: {
        total: dec(resumen._sum?.total),
        subtotal: dec(resumen._sum?.subtotal),
        descuento: dec(resumen._sum?.descuento),
        count: resumen._count,
      },
      por_estatus: porEstatus.map((e) => ({
        estatus: e.estatus,
        count: e._count._all,
        total: dec(e._sum?.total),
      })),
      por_metodo_pago: porMetodoPago.map((m) => ({
        metodo: m.metodo,
        count: m._count._all,
        total: dec(m._sum?.monto),
      })),
      top_clientes: topClientesRaw.map((c) => ({
        cliente_id: c.cliente_id,
        cliente: c.cliente_id ? (clienteMap.get(c.cliente_id) ?? null) : null,
        notas: c._count._all,
        total: dec(c._sum?.total),
      })),
      ventas_diarias: ventasDiariasRaw.map((r) => ({
        dia: r.dia,
        total: Number(r.total),
        count: Number(r.count),
      })),
    };
  }

  // ── Inventario ─────────────────────────────────────────────

  async getReporteInventario(empresaId: string) {
    const iniMes = startOfMonth(new Date());

    const [bajoStock, movPorTipo, topMovidosRaw, articulosTotal] = await Promise.all([
      this.prisma.articulo.findMany({
        where: {
          empresa_id: empresaId,
          activo: true,
          existencia_1: { gt: 0, lte: 10 },
        },
        select: {
          id: true, clave: true, descripcion_1: true, descripcion_2: true, descripcion_3: true, descripcion_4: true, descripcion_5: true,
          existencia_1: true, existencia_2: true, existencia_3: true,
        },
        orderBy: { existencia_1: 'asc' },
        take: 20,
      }),
      this.prisma.movimientoInventario.groupBy({
        by: ['tipo'],
        where: { empresa_id: empresaId, created_at: { gte: iniMes } },
        _sum: { cantidad: true },
        _count: { _all: true },
      }),
      this.prisma.movimientoInventario.groupBy({
        by: ['articulo_id'],
        where: { empresa_id: empresaId, created_at: { gte: iniMes } },
        _count: { _all: true },
        _sum: { cantidad: true },
        orderBy: { _count: { articulo_id: 'desc' } },
        take: 10,
      }),
      this.prisma.articulo.count({ where: { empresa_id: empresaId, activo: true } }),
    ]);

    const articuloIds = topMovidosRaw.map((m) => m.articulo_id);
    const articulos = articuloIds.length
      ? await this.prisma.articulo.findMany({
          where: { id: { in: articuloIds } },
          select: { id: true, clave: true, descripcion_1: true, descripcion_2: true, descripcion_3: true, descripcion_4: true, descripcion_5: true },
        })
      : [];
    const articuloMap = new Map(articulos.map((a) => [a.id, a]));

    return {
      articulos_total: articulosTotal,
      bajo_stock: bajoStock.map((a) => serializeDecimal(a)),
      movimientos_por_tipo: movPorTipo.map((m) => ({
        tipo: m.tipo,
        count: m._count._all,
        cantidad: dec(m._sum?.cantidad),
      })),
      top_movidos: topMovidosRaw.map((m) => ({
        articulo_id: m.articulo_id,
        articulo: articuloMap.get(m.articulo_id) ?? null,
        movimientos: m._count._all,
        cantidad: dec(m._sum?.cantidad),
      })),
    };
  }

  // ── Crédito ────────────────────────────────────────────────

  async getReporteCredito(empresaId: string) {
    const [topDeudores, cartera, vencidas] = await Promise.all([
      this.prisma.cliente.findMany({
        where: { empresa_id: empresaId, saldo_pendiente: { gt: 0 } },
        select: {
          id: true, nombre: true, apellidos: true, razon_social: true,
          saldo_pendiente: true, limite_credito: true, precio_num: true,
        },
        orderBy: { saldo_pendiente: 'desc' },
        take: 15,
      }),
      this.prisma.cliente.aggregate({
        where: { empresa_id: empresaId, saldo_pendiente: { gt: 0 } },
        _sum: { saldo_pendiente: true },
        _count: true,
      }),
      this.prisma.notaVenta.findMany({
        where: {
          empresa_id: empresaId,
          estatus: 'CREDITO',
          fecha_vencimiento: { lte: new Date() },
        },
        select: {
          id: true, folio: true, total: true, fecha_vencimiento: true,
          cliente: { select: { id: true, nombre: true, apellidos: true, razon_social: true } },
        },
        orderBy: { fecha_vencimiento: 'asc' },
        take: 20,
      }),
    ]);

    return {
      cartera_total: dec(cartera._sum?.saldo_pendiente),
      clientes_con_saldo: cartera._count,
      top_deudores: topDeudores.map((c) => serializeDecimal(c)),
      cuentas_vencidas: vencidas.map((n) => serializeDecimal(n)),
    };
  }

  // ── Compras ────────────────────────────────────────────────

  async getReporteCompras(
    empresaId: string,
    opts: { desde?: string; hasta?: string },
  ) {
    const desde = opts.desde ? new Date(opts.desde) : startOfMonth(new Date());
    const hasta = opts.hasta ? endOfDay(new Date(opts.hasta)) : endOfDay(new Date());
    const rango = { gte: desde, lte: hasta };

    const [resumen, porEstatus, topProveedoresRaw, cxpRaw] = await Promise.all([
      this.prisma.ordenCompra.aggregate({
        where: { empresa_id: empresaId, created_at: rango },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.ordenCompra.groupBy({
        by: ['estatus'],
        where: { empresa_id: empresaId, created_at: rango },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.ordenCompra.groupBy({
        by: ['proveedor_id'],
        where: {
          empresa_id: empresaId,
          estatus: { in: ['APROBADA', 'RECIBIDA_PARCIAL', 'RECIBIDA'] },
          created_at: rango,
        },
        _sum: { total: true },
        _count: { _all: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
      this.prisma.proveedor.findMany({
        where: { empresa_id: empresaId, saldo_pendiente: { gt: 0 } },
        select: { id: true, nombre: true, razon_social: true, saldo_pendiente: true },
        orderBy: { saldo_pendiente: 'desc' },
        take: 15,
      }),
    ]);

    const proveedorIds = topProveedoresRaw.map((p) => p.proveedor_id);
    const proveedores = proveedorIds.length
      ? await this.prisma.proveedor.findMany({
          where: { id: { in: proveedorIds } },
          select: { id: true, nombre: true, razon_social: true },
        })
      : [];
    const proveedorMap = new Map(proveedores.map((p) => [p.id, p]));

    const cxpSer = cxpRaw.map((p) => serializeDecimal(p)) as Array<{
      id: string; nombre: string; razon_social: string | null; saldo_pendiente: number;
    }>;

    return {
      resumen: {
        total: dec(resumen._sum?.total),
        ordenes: resumen._count,
      },
      por_estatus: porEstatus.map((e) => ({
        estatus: e.estatus,
        count: e._count._all,
        total: dec(e._sum?.total),
      })),
      top_proveedores: topProveedoresRaw.map((p) => ({
        proveedor_id: p.proveedor_id,
        proveedor: proveedorMap.get(p.proveedor_id) ?? null,
        ordenes: p._count._all,
        total: dec(p._sum?.total),
      })),
      cuentas_por_pagar: {
        total: cxpSer.reduce((s, p) => s + p.saldo_pendiente, 0),
        proveedores: cxpSer,
      },
    };
  }

  // ── Producción ─────────────────────────────────────────────

  async getReporteProduccion(
    empresaId: string,
    opts: { desde?: string; hasta?: string },
  ) {
    const desde = opts.desde ? new Date(opts.desde) : startOfMonth(new Date());
    const hasta = opts.hasta ? endOfDay(new Date(opts.hasta)) : endOfDay(new Date());
    const rango = { gte: desde, lte: hasta };

    const [resumen, porEstatus, topArticulosRaw] = await Promise.all([
      this.prisma.ordenProduccion.aggregate({
        where: { empresa_id: empresaId, created_at: rango },
        _sum: { cantidad_objetivo: true, cantidad_producida: true },
        _count: true,
      }),
      this.prisma.ordenProduccion.groupBy({
        by: ['estatus'],
        where: { empresa_id: empresaId, created_at: rango },
        _count: { _all: true },
        _sum: { cantidad_objetivo: true, cantidad_producida: true },
      }),
      this.prisma.ordenProduccion.groupBy({
        by: ['articulo_id'],
        where: {
          empresa_id: empresaId,
          estatus: { in: ['COMPLETADA', 'EN_PROCESO'] },
          created_at: rango,
        },
        _sum: { cantidad_producida: true },
        _count: { _all: true },
        orderBy: { _sum: { cantidad_producida: 'desc' } },
        take: 10,
      }),
    ]);

    const articuloIds = topArticulosRaw.map((a) => a.articulo_id);
    const articulos = articuloIds.length
      ? await this.prisma.articulo.findMany({
          where: { id: { in: articuloIds } },
          select: { id: true, clave: true, descripcion_1: true, descripcion_2: true, descripcion_3: true, descripcion_4: true, descripcion_5: true },
        })
      : [];
    const articuloMap = new Map(articulos.map((a) => [a.id, a]));

    const objetivo = dec(resumen._sum?.cantidad_objetivo);
    const producida = dec(resumen._sum?.cantidad_producida);

    return {
      total_ops: resumen._count,
      cantidad_objetivo: objetivo,
      cantidad_producida: producida,
      eficiencia: objetivo > 0 ? Math.round((producida / objetivo) * 100) : 0,
      por_estatus: porEstatus.map((e) => ({
        estatus: e.estatus,
        ops: e._count._all,
        objetivo: dec(e._sum?.cantidad_objetivo),
        producida: dec(e._sum?.cantidad_producida),
      })),
      top_articulos: topArticulosRaw.map((a) => ({
        articulo_id: a.articulo_id,
        articulo: articuloMap.get(a.articulo_id) ?? null,
        ops: a._count._all,
        producida: dec(a._sum?.cantidad_producida),
      })),
    };
  }

  // ── Corte de caja ──────────────────────────────────────────

  async getCorteCaja(
    empresaId: string,
    opts: { desde?: string; hasta?: string; ubicacionId?: string },
  ) {
    const desde = opts.desde ? new Date(opts.desde) : startOfDay(new Date());
    const hasta = opts.hasta ? endOfDay(new Date(opts.hasta)) : endOfDay(new Date());

    const baseWhere = {
      empresa_id: empresaId,
      created_at: { gte: desde, lte: hasta },
      ...(opts.ubicacionId ? { ubicacion_id: opts.ubicacionId } : {}),
    };

    const [notas, pagosGrouped, abonosAgg] = await Promise.all([
      this.prisma.notaVenta.findMany({
        where: { ...baseWhere, estatus: { in: ['PAGADA', 'CREDITO'] } },
        include: {
          cliente: { select: { id: true, nombre: true, apellidos: true, razon_social: true } },
          pagos:   { select: { metodo: true, monto: true } },
        },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.pago.groupBy({
        by: ['metodo'],
        where: {
          nota: {
            empresa_id: empresaId,
            estatus: { in: ['PAGADA', 'CREDITO'] },
            created_at: { gte: desde, lte: hasta },
            ...(opts.ubicacionId ? { ubicacion_id: opts.ubicacionId } : {}),
          },
        },
        _sum: { monto: true },
        _count: { _all: true },
      }),
      this.prisma.movimientoCuenta.aggregate({
        where: {
          empresa_id: empresaId,
          tipo:       'ABONO',
          created_at: { gte: desde, lte: hasta },
        },
        _sum:   { monto: true },
        _count: true,
      }),
    ]);

    const porMetodo: Record<string, { count: number; total: number }> = {};
    for (const p of pagosGrouped) {
      porMetodo[p.metodo] = {
        count: p._count._all,
        total: +dec(p._sum?.monto).toFixed(2),
      };
    }

    const porEstatusMap = new Map<string, { count: number; total: number }>();
    for (const n of notas) {
      const key = n.estatus;
      const cur = porEstatusMap.get(key) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total  = +(cur.total + dec(n.total)).toFixed(2);
      porEstatusMap.set(key, cur);
    }

    const totalCobrado = Object.values(porMetodo).reduce((s, m) => s + m.total, 0);
    const totalAbonos  = dec(abonosAgg._sum?.monto);

    return {
      desde:           desde.toISOString().slice(0, 10),
      hasta:           hasta.toISOString().slice(0, 10),
      total_cobrado:   +totalCobrado.toFixed(2),
      total_abonos:    +totalAbonos.toFixed(2),
      notas_count:     notas.length,
      por_metodo:      porMetodo,
      por_estatus:     Object.fromEntries(porEstatusMap),
      abonos_count:    abonosAgg._count,
      notas: notas.map((n) => serializeDecimal(n)),
    };
  }

  // ── Auditoría ──────────────────────────────────────────────

  async getAuditoria(
    empresaId: string,
    opts: { entidad?: string; usuarioId?: string; page: number; limit: number },
  ) {
    const where = {
      empresa_id: empresaId,
      ...(opts.entidad   ? { entidad:    opts.entidad   } : {}),
      ...(opts.usuarioId ? { usuario_id: opts.usuarioId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip:  (opts.page - 1) * opts.limit,
        take:  opts.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page: opts.page, limit: opts.limit, pages: Math.ceil(total / opts.limit) };
  }

  // ── Asistencia ─────────────────────────────────────────────

  async getReporteAsistencia(
    empresaId: string,
    opts: { desde?: string; hasta?: string },
  ) {
    const desde = opts.desde ? new Date(opts.desde) : startOfMonth(new Date());
    const hasta = opts.hasta ? endOfDay(new Date(opts.hasta)) : endOfDay(new Date());
    const rango = { gte: desde, lte: hasta };

    const [totalEmpleados, porEstatus, topAusenciasRaw] = await Promise.all([
      this.prisma.empleado.count({ where: { empresa_id: empresaId, activo: true } }),
      this.prisma.registroAsistencia.groupBy({
        by: ['estatus'],
        where: { empresa_id: empresaId, fecha: rango },
        _count: { _all: true },
      }),
      this.prisma.registroAsistencia.groupBy({
        by: ['empleado_id'],
        where: { empresa_id: empresaId, fecha: rango, estatus: 'AUSENTE' },
        _count: { _all: true },
        orderBy: { _count: { empleado_id: 'desc' } },
        take: 10,
      }),
    ]);

    const empleadoIds = topAusenciasRaw.map((a) => a.empleado_id);
    const empleados = empleadoIds.length
      ? await this.prisma.empleado.findMany({
          where: { id: { in: empleadoIds } },
          select: { id: true, nombre: true, apellidos: true, puesto: true },
        })
      : [];
    const empleadoMap = new Map(empleados.map((e) => [e.id, e]));

    const totalRegistros = porEstatus.reduce((s, e) => s + e._count._all, 0);

    return {
      empleados_activos: totalEmpleados,
      total_registros: totalRegistros,
      por_estatus: porEstatus.map((e) => ({ estatus: e.estatus, count: e._count._all })),
      top_ausencias: topAusenciasRaw.map((a) => ({
        empleado_id: a.empleado_id,
        empleado: empleadoMap.get(a.empleado_id) ?? null,
        ausencias: a._count._all,
      })),
    };
  }
}
