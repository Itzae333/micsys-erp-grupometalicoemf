import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma, RolUsuario } from '@grupometalicoemf/database';
import { rangoCierreNota } from '../common/utils/fecha-mx';

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

// Todas las ubicaciones operan en Zona Centro de México (Monterrey, CDMX…),
// que desde el decreto de 2022 no tiene horario de verano — offset fijo -06:00.
// Los `setHours()` de Date operan en la zona horaria del proceso, no la del
// negocio: si el servidor corre en UTC (como casi todo hosting en la nube),
// "hoy" quedaba calculado de 6pm de ayer a 6pm de hoy en hora de México.
const TZ_OFFSET_MEXICO = '-06:00';

function ymdEnMexico(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function startOfDay(d: Date): Date {
  return new Date(`${ymdEnMexico(d)}T00:00:00${TZ_OFFSET_MEXICO}`);
}

function endOfDay(d: Date): Date {
  return new Date(`${ymdEnMexico(d)}T23:59:59.999${TZ_OFFSET_MEXICO}`);
}

function startOfMonth(d: Date): Date {
  const [year, month] = ymdEnMexico(d).split('-');
  return new Date(`${year}-${month}-01T00:00:00${TZ_OFFSET_MEXICO}`);
}

// Los filtros `desde`/`hasta` del front llegan como fecha simple (YYYY-MM-DD,
// de un <input type="date">) sin hora ni zona — se interpretan como el día
// en México, no como medianoche UTC (que sería 6pm del día anterior aquí).
function parseFechaMexico(s: string): Date {
  return new Date(`${s}T12:00:00${TZ_OFFSET_MEXICO}`);
}

type DiaVenta = { dia: string; total: number; count: number };

@Injectable()
export class ReportesService {
  constructor(private prisma: PrismaService) {}

  // ── Dashboard ──────────────────────────────────────────────

  /**
   * Despacha al dashboard según el rol: ADMIN/SUPER_USUARIO ven el completo
   * de siempre; los roles operativos ven una vista mínima acorde a su tarea
   * (evita over-fetch en tablets con conectividad intermitente).
   *
   * FABRICA es la excepción: como no vende, el dashboard de rol (ej. el de
   * ENCARGADO, pensado para mostrador) no aplica ahí — cualquier rol que no
   * sea ADMIN/SUPER_USUARIO ve el mismo dashboard fijo de fábrica.
   */
  async getDashboard(ubicacionId: string, rol: RolUsuario) {
    if (rol !== 'SUPER_USUARIO' && rol !== 'ADMIN') {
      const ubicacion = await this.prisma.ubicacion.findUnique({
        where: { id: ubicacionId },
        select: { empresa_id: true, tipo: true },
      });
      if (ubicacion?.tipo === 'FABRICA') {
        return this.getDashboardFabrica(ubicacionId, ubicacion.empresa_id);
      }
    }

    if (rol === 'ENCARGADO') return this.getDashboardEncargado(ubicacionId);
    if (rol === 'VENDEDOR') return this.getDashboardVendedor(ubicacionId);
    if (rol === 'ALMACENISTA') return this.getDashboardAlmacenista(ubicacionId);
    if (rol === 'JEFE_MANUFACTURA') return this.getDashboardJefeManufactura(ubicacionId);
    if (rol === 'JEFE_RH') return this.getDashboardJefeRH(ubicacionId);
    return this.getDashboardCompleto(ubicacionId);
  }

  private async getDashboardCompleto(ubicacionId: string) {
    const hoy = new Date();
    const iniHoy = startOfDay(hoy);
    const finHoy = endOfDay(hoy);
    const iniMes = startOfMonth(hoy);
    const sieteDiasAtras = startOfDay(new Date(hoy.getTime() - 6 * 24 * 60 * 60 * 1000));

    // Get empresa_id from ubicacion for structural queries
    const ubicacion = await this.prisma.ubicacion.findUnique({
      where: { id: ubicacionId },
      select: { empresa_id: true },
    });
    const empresaId = ubicacion?.empresa_id ?? '';

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
          ubicacion_id: ubicacionId,
          estatus: { in: ['PAGADA', 'CREDITO'] },
          ...rangoCierreNota({ gte: iniHoy, lte: finHoy }),
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.notaVenta.aggregate({
        where: {
          ubicacion_id: ubicacionId,
          estatus: { in: ['PAGADA', 'CREDITO'] },
          ...rangoCierreNota({ gte: iniMes }),
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.notaVenta.count({
        where: { ubicacion_id: ubicacionId, estatus: { in: ['ABIERTA', 'PENDIENTE'] } },
      }),
      this.prisma.cliente.count({
        where: { ubicacion_id: ubicacionId, saldo_pendiente: { gt: 0 } },
      }),
      this.prisma.ordenProduccion.count({
        where: { empresa_id: empresaId, estatus: { in: ['ABIERTA', 'EN_PROCESO'] } },
      }),
      this.prisma.proveedor.count({
        where: { empresa_id: empresaId, saldo_pendiente: { gt: 0 } },
      }),
      this.prisma.movimientoInventario.count({
        where: {
          ubicacion_id: ubicacionId,
          tipo: 'ENTRADA',
          created_at: { gte: iniHoy, lte: finHoy },
        },
      }),
      this.prisma.notaVentaLinea.groupBy({
        by: ['articulo_id', 'clave'],
        where: {
          nota: {
            ubicacion_id: ubicacionId,
            estatus: { in: ['PAGADA', 'CREDITO'] },
            ...rangoCierreNota({ gte: iniMes }),
          },
        },
        _sum: { subtotal: true, cantidad: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 5,
      }),
      this.prisma.$queryRaw<Array<{ dia: string; total: string; count: bigint }>>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', COALESCE(cerrada_at, created_at) - INTERVAL '6 hours'), 'YYYY-MM-DD') AS dia,
          CAST(SUM(total) AS FLOAT8)                          AS total,
          CAST(COUNT(*) AS INT4)                              AS count
        FROM notas_venta
        WHERE ubicacion_id = ${ubicacionId}
          AND estatus IN ('PAGADA', 'CREDITO')
          AND COALESCE(cerrada_at, created_at) >= ${sieteDiasAtras}
        GROUP BY DATE_TRUNC('day', COALESCE(cerrada_at, created_at) - INTERVAL '6 hours')
        ORDER BY dia
      `,
    ]);

    const ventasDiarias: DiaVenta[] = ventasDiariasRaw.map((r) => ({
      dia: r.dia,
      total: Number(r.total),
      count: Number(r.count),
    }));

    // La `clave` del groupBy es la que quedó grabada en la línea al momento de la venta
    // (puede ser un código viejo/migrado); se busca el artículo actual para mostrar su
    // descripción vigente en vez de ese snapshot.
    const articuloIdsTop = topArticulosMes.map((a) => a.articulo_id);
    const articulosTop = articuloIdsTop.length
      ? await this.prisma.articulo.findMany({
          where: { id: { in: articuloIdsTop } },
          select: { id: true, clave: true, descripcion_1: true, descripcion_2: true, descripcion_3: true, descripcion_4: true, descripcion_5: true },
        })
      : [];
    const articuloTopMap = new Map(articulosTop.map((a) => [a.id, a]));

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
        articulo: articuloTopMap.get(a.articulo_id) ?? null,
        cantidad: dec(a._sum?.cantidad),
        subtotal: dec(a._sum?.subtotal),
      })),
      ventas_diarias: ventasDiarias,
    };
  }

  /** Solo lo esencial para operar el día a día de una ubicación: ventas de hoy y quién compra seguido. */
  private async getDashboardEncargado(ubicacionId: string) {
    const hoy = new Date();
    const iniHoy = startOfDay(hoy);
    const finHoy = endOfDay(hoy);
    const sieteDiasAtras = startOfDay(new Date(hoy.getTime() - 6 * 24 * 60 * 60 * 1000));

    const [ventasHoy, clientesFrecuentesRaw] = await Promise.all([
      this.prisma.notaVenta.aggregate({
        where: {
          ubicacion_id: ubicacionId,
          estatus: { in: ['PAGADA', 'CREDITO'] },
          ...rangoCierreNota({ gte: iniHoy, lte: finHoy }),
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.notaVenta.groupBy({
        by: ['cliente_id'],
        where: {
          ubicacion_id: ubicacionId,
          cliente_id: { not: null },
          estatus: { in: ['PAGADA', 'CREDITO'] },
          ...rangoCierreNota({ gte: sieteDiasAtras }),
        },
        _count: { _all: true },
        orderBy: { _count: { cliente_id: 'desc' } },
        take: 5,
      }),
    ]);

    const clienteIds = clientesFrecuentesRaw.map((c) => c.cliente_id).filter((id): id is string => id !== null);
    const clientes = clienteIds.length
      ? await this.prisma.cliente.findMany({
          where: { id: { in: clienteIds } },
          select: { id: true, nombre: true, apellidos: true, razon_social: true },
        })
      : [];
    const clienteMap = new Map(clientes.map((c) => [c.id, c]));

    return {
      ventas_hoy: {
        total: dec(ventasHoy._sum?.total),
        count: ventasHoy._count,
      },
      clientes_frecuentes: clientesFrecuentesRaw.map((c) => ({
        cliente_id: c.cliente_id,
        cliente: c.cliente_id ? (clienteMap.get(c.cliente_id) ?? null) : null,
        notas: c._count._all,
      })),
    };
  }

  /** Top artículos vendidos (por cantidad, no por monto) en los últimos 7 días — base para VENDEDOR/ALMACENISTA. */
  private async getTopArticulosPorCantidad(ubicacionId: string, sieteDiasAtras: Date) {
    return this.prisma.notaVentaLinea.groupBy({
      by: ['articulo_id', 'clave'],
      where: {
        nota: {
          ubicacion_id: ubicacionId,
          estatus: { in: ['PAGADA', 'CREDITO'] },
          ...rangoCierreNota({ gte: sieteDiasAtras }),
        },
      },
      _sum: { cantidad: true },
      orderBy: { _sum: { cantidad: 'desc' } },
      take: 5,
    });
  }

  /** Solo lo que un vendedor de mostrador necesita: qué se está vendiendo y a qué precio. */
  private async getDashboardVendedor(ubicacionId: string) {
    const sieteDiasAtras = startOfDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
    const topRaw = await this.getTopArticulosPorCantidad(ubicacionId, sieteDiasAtras);

    const articuloIds = topRaw.map((a) => a.articulo_id);
    const articulos = articuloIds.length
      ? await this.prisma.articulo.findMany({
          where: { id: { in: articuloIds } },
          select: { id: true, clave: true, descripcion_1: true, precio_1: true },
        })
      : [];
    const articuloMap = new Map(articulos.map((a) => [a.id, a]));

    return {
      top_productos: topRaw.map((a) => ({
        articulo_id: a.articulo_id,
        clave: a.clave,
        descripcion_1: articuloMap.get(a.articulo_id)?.descripcion_1 ?? null,
        cantidad: dec(a._sum?.cantidad),
        precio_1: articuloMap.get(a.articulo_id)?.precio_1 != null ? dec(articuloMap.get(a.articulo_id)?.precio_1) : null,
      })),
    };
  }

  /** Solo lo que un almacenista necesita: qué se vende más y cuánto queda en existencia. */
  private async getDashboardAlmacenista(ubicacionId: string) {
    const sieteDiasAtras = startOfDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
    const topRaw = await this.getTopArticulosPorCantidad(ubicacionId, sieteDiasAtras);

    const articuloIds = topRaw.map((a) => a.articulo_id);
    const articulos = articuloIds.length
      ? await this.prisma.articulo.findMany({
          where: { id: { in: articuloIds } },
          select: { id: true, clave: true, descripcion_1: true, existencia_1: true },
        })
      : [];
    const articuloMap = new Map(articulos.map((a) => [a.id, a]));

    return {
      top_productos: topRaw.map((a) => ({
        articulo_id: a.articulo_id,
        clave: a.clave,
        descripcion_1: articuloMap.get(a.articulo_id)?.descripcion_1 ?? null,
        cantidad: dec(a._sum?.cantidad),
        existencia_1: articuloMap.get(a.articulo_id)?.existencia_1 != null ? dec(articuloMap.get(a.articulo_id)?.existencia_1) : null,
      })),
    };
  }

  /** Solo lo que el jefe de producción necesita: qué órdenes están activas y su avance. */
  private async getDashboardJefeManufactura(ubicacionId: string) {
    const ubicacion = await this.prisma.ubicacion.findUnique({
      where: { id: ubicacionId },
      select: { empresa_id: true },
    });
    const empresaId = ubicacion?.empresa_id ?? '';

    const [opsActivas, ordenesRaw] = await Promise.all([
      this.prisma.ordenProduccion.count({
        where: { empresa_id: empresaId, estatus: { in: ['ABIERTA', 'EN_PROCESO'] } },
      }),
      this.prisma.ordenProduccion.findMany({
        where: { empresa_id: empresaId, estatus: { in: ['ABIERTA', 'EN_PROCESO'] } },
        orderBy: { created_at: 'desc' },
        take: 10,
        select: {
          id: true, folio: true, estatus: true,
          cantidad_objetivo: true, cantidad_producida: true,
          articulo: { select: { id: true, clave: true, descripcion_1: true } },
        },
      }),
    ]);

    return {
      ops_activas: opsActivas,
      ordenes: ordenesRaw.map((o) => ({
        id: o.id,
        folio: o.folio,
        estatus: o.estatus,
        cantidad_objetivo: dec(o.cantidad_objetivo),
        cantidad_producida: dec(o.cantidad_producida),
        articulo: o.articulo,
      })),
    };
  }

  /**
   * Dashboard fijo para cualquier rol (que no sea ADMIN/SUPER_USUARIO) en una
   * ubicación FABRICA — combina el top de productos/existencias de ALMACENISTA
   * con las órdenes activas de JEFE_MANUFACTURA, porque en una fábrica el
   * dashboard de rol (ej. ENCARGADO pensado para mostrador) no aplica.
   */
  private async getDashboardFabrica(ubicacionId: string, empresaId: string) {
    const sieteDiasAtras = startOfDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

    const [topRaw, opsActivas, ordenesRaw] = await Promise.all([
      this.getTopArticulosPorCantidad(ubicacionId, sieteDiasAtras),
      this.prisma.ordenProduccion.count({
        where: { empresa_id: empresaId, estatus: { in: ['ABIERTA', 'EN_PROCESO'] } },
      }),
      this.prisma.ordenProduccion.findMany({
        where: { empresa_id: empresaId, estatus: { in: ['ABIERTA', 'EN_PROCESO'] } },
        orderBy: { created_at: 'desc' },
        take: 10,
        select: {
          id: true, folio: true, estatus: true,
          cantidad_objetivo: true, cantidad_producida: true,
          articulo: { select: { id: true, clave: true, descripcion_1: true } },
        },
      }),
    ]);

    const articuloIds = topRaw.map((a) => a.articulo_id);
    const articulos = articuloIds.length
      ? await this.prisma.articulo.findMany({
          where: { id: { in: articuloIds } },
          select: { id: true, clave: true, descripcion_1: true, existencia_1: true },
        })
      : [];
    const articuloMap = new Map(articulos.map((a) => [a.id, a]));

    return {
      top_productos: topRaw.map((a) => ({
        articulo_id: a.articulo_id,
        clave: a.clave,
        descripcion_1: articuloMap.get(a.articulo_id)?.descripcion_1 ?? null,
        cantidad: dec(a._sum?.cantidad),
        existencia_1: articuloMap.get(a.articulo_id)?.existencia_1 != null ? dec(articuloMap.get(a.articulo_id)?.existencia_1) : null,
      })),
      ops_activas: opsActivas,
      ordenes: ordenesRaw.map((o) => ({
        id: o.id,
        folio: o.folio,
        estatus: o.estatus,
        cantidad_objetivo: dec(o.cantidad_objetivo),
        cantidad_producida: dec(o.cantidad_producida),
        articulo: o.articulo,
      })),
    };
  }

  /** Solo lo que el jefe de RH necesita: quién llegó hoy y quién falta. */
  private async getDashboardJefeRH(ubicacionId: string) {
    const ubicacion = await this.prisma.ubicacion.findUnique({
      where: { id: ubicacionId },
      select: { empresa_id: true },
    });
    const empresaId = ubicacion?.empresa_id ?? '';
    const hoy = startOfDay(new Date());

    const [empleadosActivos, asistenciaHoyRaw, ausentesHoyRaw] = await Promise.all([
      this.prisma.empleado.count({ where: { empresa_id: empresaId, activo: true } }),
      this.prisma.registroAsistencia.groupBy({
        by: ['estatus'],
        where: { empresa_id: empresaId, fecha: hoy },
        _count: { _all: true },
      }),
      this.prisma.registroAsistencia.findMany({
        where: { empresa_id: empresaId, fecha: hoy, estatus: 'AUSENTE' },
        take: 10,
        select: {
          empleado_id: true,
          empleado: { select: { id: true, nombre: true, apellidos: true, puesto: true } },
        },
      }),
    ]);

    return {
      empleados_activos: empleadosActivos,
      asistencia_hoy: asistenciaHoyRaw.map((a) => ({ estatus: a.estatus, count: a._count._all })),
      ausentes_hoy: ausentesHoyRaw.map((a) => ({
        empleado_id: a.empleado_id,
        empleado: a.empleado,
      })),
    };
  }

  // ── Dashboard global (SUPER_USUARIO) ──────────────────────

  async getDashboardGlobal() {
    const hoy    = new Date();
    const iniHoy = startOfDay(hoy);
    const finHoy = endOfDay(hoy);
    const iniMes = startOfMonth(hoy);

    const ubicaciones = await this.prisma.ubicacion.findMany({
      select: {
        id: true,
        nombre: true,
        empresa: { select: { id: true, nombre: true } },
      },
      orderBy: [{ empresa: { nombre: 'asc' } }, { nombre: 'asc' }],
    });

    const resumenPorUbicacion = await Promise.all(
      ubicaciones.map(async (ub) => {
        const [hoyAgg, mesAgg, creditos] = await Promise.all([
          this.prisma.notaVenta.aggregate({
            where: { ubicacion_id: ub.id, estatus: { in: ['PAGADA', 'CREDITO'] }, ...rangoCierreNota({ gte: iniHoy, lte: finHoy }) },
            _sum: { total: true }, _count: true,
          }),
          this.prisma.notaVenta.aggregate({
            where: { ubicacion_id: ub.id, estatus: { in: ['PAGADA', 'CREDITO'] }, ...rangoCierreNota({ gte: iniMes }) },
            _sum: { total: true }, _count: true,
          }),
          this.prisma.cliente.count({ where: { ubicacion_id: ub.id, saldo_pendiente: { gt: 0 } } }),
        ]);

        return {
          empresa_id:      ub.empresa.id,
          empresa_nombre:  ub.empresa.nombre,
          ventas_hoy:   { total: dec(hoyAgg._sum?.total), count: hoyAgg._count },
          ventas_mes:   { total: dec(mesAgg._sum?.total), count: mesAgg._count },
          clientes_con_saldo: creditos,
        };
      }),
    );

    // El super usuario ve por empresa (no por ubicación) — se agregan todas las
    // ubicaciones de cada empresa en un solo renglón.
    const porEmpresa = new Map<string, {
      empresa_id: string; empresa_nombre: string;
      ventas_hoy: { total: number; count: number };
      ventas_mes: { total: number; count: number };
      clientes_con_saldo: number;
    }>();
    for (const r of resumenPorUbicacion) {
      const acc = porEmpresa.get(r.empresa_id) ?? {
        empresa_id: r.empresa_id,
        empresa_nombre: r.empresa_nombre,
        ventas_hoy: { total: 0, count: 0 },
        ventas_mes: { total: 0, count: 0 },
        clientes_con_saldo: 0,
      };
      acc.ventas_hoy.total += r.ventas_hoy.total;
      acc.ventas_hoy.count += r.ventas_hoy.count;
      acc.ventas_mes.total += r.ventas_mes.total;
      acc.ventas_mes.count += r.ventas_mes.count;
      acc.clientes_con_saldo += r.clientes_con_saldo;
      porEmpresa.set(r.empresa_id, acc);
    }

    const empresas = Array.from(porEmpresa.values())
      .sort((a, b) => a.empresa_nombre.localeCompare(b.empresa_nombre))
      .map((e) => ({
        ...e,
        ventas_hoy: { ...e.ventas_hoy, total: +e.ventas_hoy.total.toFixed(2) },
        ventas_mes: { ...e.ventas_mes, total: +e.ventas_mes.total.toFixed(2) },
      }));

    const totalHoy = empresas.reduce((s, e) => s + e.ventas_hoy.total, 0);
    const totalMes = empresas.reduce((s, e) => s + e.ventas_mes.total, 0);

    return {
      total_hoy: +totalHoy.toFixed(2),
      total_mes: +totalMes.toFixed(2),
      empresas,
    };
  }

  // ── Ventas ─────────────────────────────────────────────────

  async getReporteVentas(
    ubicacionId: string,
    opts: { desde?: string; hasta?: string },
  ) {
    const desde = opts.desde ? parseFechaMexico(opts.desde) : startOfMonth(new Date());
    const hasta = opts.hasta ? endOfDay(parseFechaMexico(opts.hasta)) : endOfDay(new Date());

    const baseWhere: Prisma.NotaVentaWhereInput = {
      ubicacion_id: ubicacionId,
      ...rangoCierreNota({ gte: desde, lte: hasta }),
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
              ubicacion_id: ubicacionId,
              estatus: { in: ['PAGADA', 'CREDITO'] },
              ...rangoCierreNota({ gte: desde, lte: hasta }),
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
            TO_CHAR(DATE_TRUNC('day', COALESCE(cerrada_at, created_at) - INTERVAL '6 hours'), 'YYYY-MM-DD') AS dia,
            CAST(SUM(total) AS FLOAT8)                          AS total,
            CAST(COUNT(*) AS INT4)                              AS count
          FROM notas_venta
          WHERE ubicacion_id = ${ubicacionId}
            AND estatus IN ('PAGADA', 'CREDITO')
            AND COALESCE(cerrada_at, created_at) >= ${desde}
            AND COALESCE(cerrada_at, created_at) <= ${hasta}
          GROUP BY DATE_TRUNC('day', COALESCE(cerrada_at, created_at) - INTERVAL '6 hours')
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

  async getReporteInventario(ubicacionId: string) {
    const iniMes = startOfMonth(new Date());

    const [bajoStock, movPorTipo, topMovidosRaw, articulosTotal] = await Promise.all([
      this.prisma.articulo.findMany({
        where: {
          ubicacion_id: ubicacionId,
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
        where: { ubicacion_id: ubicacionId, created_at: { gte: iniMes } },
        _sum: { cantidad: true },
        _count: { _all: true },
      }),
      this.prisma.movimientoInventario.groupBy({
        by: ['articulo_id'],
        where: { ubicacion_id: ubicacionId, created_at: { gte: iniMes } },
        _count: { _all: true },
        _sum: { cantidad: true },
        orderBy: { _count: { articulo_id: 'desc' } },
        take: 10,
      }),
      this.prisma.articulo.count({ where: { ubicacion_id: ubicacionId, activo: true } }),
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

  async getReporteCredito(ubicacionId: string) {
    const [topDeudores, cartera, vencidas] = await Promise.all([
      this.prisma.cliente.findMany({
        where: { ubicacion_id: ubicacionId, saldo_pendiente: { gt: 0 } },
        select: {
          id: true, nombre: true, apellidos: true, razon_social: true,
          saldo_pendiente: true, limite_credito: true, precio_num: true,
        },
        orderBy: { saldo_pendiente: 'desc' },
        take: 15,
      }),
      this.prisma.cliente.aggregate({
        where: { ubicacion_id: ubicacionId, saldo_pendiente: { gt: 0 } },
        _sum: { saldo_pendiente: true },
        _count: true,
      }),
      this.prisma.notaVenta.findMany({
        where: {
          ubicacion_id: ubicacionId,
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
    ubicacionId: string,
    opts: { desde?: string; hasta?: string },
  ) {
    const desde = opts.desde ? parseFechaMexico(opts.desde) : startOfMonth(new Date());
    const hasta = opts.hasta ? endOfDay(parseFechaMexico(opts.hasta)) : endOfDay(new Date());
    const rango = { gte: desde, lte: hasta };

    // Get empresa for proveedor queries (structural data)
    const ubicacion = await this.prisma.ubicacion.findUnique({
      where: { id: ubicacionId },
      select: { empresa_id: true },
    });
    const empresaId = ubicacion?.empresa_id ?? '';

    const [resumen, porEstatus, topProveedoresRaw, cxpRaw] = await Promise.all([
      this.prisma.ordenCompra.aggregate({
        where: { ubicacion_id: ubicacionId, created_at: rango },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.ordenCompra.groupBy({
        by: ['estatus'],
        where: { ubicacion_id: ubicacionId, created_at: rango },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.ordenCompra.groupBy({
        by: ['proveedor_id'],
        where: {
          ubicacion_id: ubicacionId,
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
    const desde = opts.desde ? parseFechaMexico(opts.desde) : startOfMonth(new Date());
    const hasta = opts.hasta ? endOfDay(parseFechaMexico(opts.hasta)) : endOfDay(new Date());
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
    ubicacionId: string,
    opts: { desde?: string; hasta?: string },
  ) {
    const desde = opts.desde ? parseFechaMexico(opts.desde) : startOfDay(new Date());
    const hasta = opts.hasta ? endOfDay(parseFechaMexico(opts.hasta)) : endOfDay(new Date());

    const baseWhere = {
      ubicacion_id: ubicacionId,
      created_at: { gte: desde, lte: hasta },
    };
    // Las notas usan cerrada_at (cuándo se cobraron de verdad) — una cotización
    // convertida a venta días después debe aparecer en el corte del día en que
    // se cobró, no en el de la cotización. Gastos no tienen ese concepto, así
    // que siguen por created_at (baseWhere, sin cambios).
    const whereNotas = {
      ubicacion_id: ubicacionId,
      ...rangoCierreNota({ gte: desde, lte: hasta }),
    };

    const [notas, pagosGrouped, abonosAgg, gastos] = await Promise.all([
      this.prisma.notaVenta.findMany({
        where: { ...whereNotas, estatus: { in: ['PAGADA', 'CREDITO', 'INCOMPLETA', 'FINALIZADA'] } },
        include: {
          cliente: { select: { id: true, nombre: true, apellidos: true, razon_social: true } },
          pagos:   { where: { origen_anticipo_pedido: false }, select: { metodo: true, monto: true } },
        },
        // Ordenado en memoria más abajo por fecha de cierre efectiva.
      }),
      this.prisma.pago.groupBy({
        by: ['metodo'],
        where: {
          // Excluye los Pago que solo replican un anticipo de Pedido ya cobrado
          // (ver PedidosService.liquidar) — ese dinero ya se contó el día del anticipo.
          origen_anticipo_pedido: false,
          nota: {
            ubicacion_id: ubicacionId,
            estatus: { in: ['PAGADA', 'CREDITO', 'INCOMPLETA', 'FINALIZADA'] },
            ...rangoCierreNota({ gte: desde, lte: hasta }),
          },
        },
        _sum: { monto: true },
        _count: { _all: true },
      }),
      this.prisma.movimientoCuenta.aggregate({
        where: {
          ubicacion_id: ubicacionId,
          tipo:         'ABONO',
          created_at:   { gte: desde, lte: hasta },
        },
        _sum:   { monto: true },
        _count: true,
      }),
      this.prisma.gasto.findMany({
        where: baseWhere,
        orderBy: { created_at: 'asc' },
        include: { usuario: { select: { nombre: true, apellidos: true } } },
      }),
    ]);

    // Igual que en ventas.service.ts: una cotización convertida hoy conserva su
    // created_at original — se ordena por cuándo se cobró de verdad.
    notas.sort((a, b) => (a.cerrada_at ?? a.created_at).getTime() - (b.cerrada_at ?? b.created_at).getTime());

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

    let totalGastos = 0;
    for (const g of gastos) {
      const monto = dec(g.monto);
      if (!porMetodo[g.metodo_pago]) porMetodo[g.metodo_pago] = { count: 0, total: 0 };
      porMetodo[g.metodo_pago].total = +(porMetodo[g.metodo_pago].total - monto).toFixed(2);
      totalGastos = +(totalGastos + monto).toFixed(2);
    }
    const totalNeto = +(totalCobrado - totalGastos).toFixed(2);

    return {
      desde:           desde.toISOString().slice(0, 10),
      hasta:           hasta.toISOString().slice(0, 10),
      total_cobrado:   +totalCobrado.toFixed(2),
      total_abonos:    +totalAbonos.toFixed(2),
      total_gastos:    totalGastos,
      total_neto:      totalNeto,
      notas_count:     notas.length,
      por_metodo:      porMetodo,
      por_estatus:     Object.fromEntries(porEstatusMap),
      abonos_count:    abonosAgg._count,
      notas: notas.map((n) => serializeDecimal(n)),
      gastos: gastos.map((g) => ({
        id: g.id,
        concepto: g.concepto,
        categoria: g.categoria,
        monto: dec(g.monto),
        metodo_pago: g.metodo_pago,
        usuario: [g.usuario.nombre, g.usuario.apellidos].filter(Boolean).join(' '),
        created_at: g.created_at,
      })),
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
    const desde = opts.desde ? parseFechaMexico(opts.desde) : startOfMonth(new Date());
    const hasta = opts.hasta ? endOfDay(parseFechaMexico(opts.hasta)) : endOfDay(new Date());
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
