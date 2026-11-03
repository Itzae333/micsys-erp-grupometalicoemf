import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const n = (v: unknown) => Number(v ?? 0);

// México no usa horario de verano: UTC-6 fijo. "desde"/"hasta" en YYYY-MM-DD abarcan días completos.
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const inicioDia = (s: string) => (SOLO_FECHA.test(s) ? new Date(`${s}T00:00:00-06:00`) : new Date(s));
const finDia = (s: string) => (SOLO_FECHA.test(s) ? new Date(`${s}T23:59:59.999-06:00`) : new Date(s));
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Estatus de una nota que pueden ser un ticket a crédito (las demás no han sido cobradas/cerradas). */
const ESTATUS_TICKET = ['CREDITO', 'PAGADA', 'FINALIZADA', 'INCOMPLETA', 'REABIERTA'] as const;

/** Ventas reales del cliente (ABIERTA es un carrito sin cerrar: no se considera venta). */
const ESTATUS_VENTA = ['PENDIENTE', 'PAGADA', 'CREDITO', 'REABIERTA', 'INCOMPLETA', 'FINALIZADA', 'CANCELADA'];

const MIME_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
const DATA_URL = /^data:([\w.+/-]+);base64,/;

/**
 * Lectura para el CRM. Alcance fijo a UNA empresa (por defecto EMFIMIFAR) y solo lectura:
 * nada de aquí escribe en el ERP.
 */
@Injectable()
export class IntegracionService {
  private empresaId: string | null = null;

  constructor(private prisma: PrismaService) {}

  private async empresa(): Promise<string> {
    if (this.empresaId) return this.empresaId;
    const nombre = process.env.INTEGRACION_EMPRESA ?? 'EMFIMIFAR';
    const e = await this.prisma.empresa.findFirst({
      where: { nombre: { equals: nombre, mode: 'insensitive' }, activa: true },
      select: { id: true },
    });
    if (!e) throw new ServiceUnavailableException(`No se encontró la empresa "${nombre}" para la integración.`);
    this.empresaId = e.id;
    return e.id;
  }

  async ubicaciones() {
    const empresa_id = await this.empresa();
    const rows = await this.prisma.ubicacion.findMany({
      where: { empresa_id, activa: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, tipo: true },
    });
    return rows;
  }

  async clientes(q: { ubicacion_id?: string; search?: string; page?: string; limit?: string; con_saldo?: string; ids?: string }) {
    const empresa_id = await this.empresa();
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    const where: Record<string, unknown> = {
      ubicacion: { empresa_id },
      activo: true,
      // El cliente genérico de mostrador no es un cliente real
      NOT: { nombre: 'MOSTRADOR' },
    };
    if (q.ubicacion_id) where.ubicacion_id = q.ubicacion_id;
    const lista = (q.ids ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (lista.length > 100) throw new BadRequestException('Máximo 100 ids por consulta.');
    if (lista.length) where.id = { in: lista };
    if (q.con_saldo === 'true') where.saldo_pendiente = { gt: 0 };
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { nombre: { contains: s, mode: 'insensitive' } },
        { apellidos: { contains: s, mode: 'insensitive' } },
        { razon_social: { contains: s, mode: 'insensitive' } },
        { rfc: { contains: s, mode: 'insensitive' } },
        { telefono: { contains: s } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.cliente.count({ where }),
      this.prisma.cliente.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { ubicacion: { select: { id: true, nombre: true } } },
      }),
    ]);
    return {
      total,
      page,
      limit,
      items: rows.map((c) => ({
        id: c.id,
        ubicacion_id: c.ubicacion_id,
        ubicacion: c.ubicacion.nombre,
        nombre: c.nombre,
        apellidos: c.apellidos,
        razon_social: c.razon_social,
        rfc: c.rfc,
        telefono: c.telefono,
        email: c.email,
        direccion: c.direccion,
        limite_credito: n(c.limite_credito),
        saldo_pendiente: n(c.saldo_pendiente),
      })),
    };
  }

  /** Saldos actuales de varios clientes en una sola llamada. */
  async saldos(ids: string[]) {
    if (ids.length === 0) return [];
    if (ids.length > 200) throw new BadRequestException('Máximo 200 clientes por consulta.');
    const empresa_id = await this.empresa();
    const rows = await this.prisma.cliente.findMany({
      where: { id: { in: ids }, ubicacion: { empresa_id } },
      select: { id: true, saldo_pendiente: true, limite_credito: true },
    });
    return rows.map((c) => ({ id: c.id, saldo_pendiente: n(c.saldo_pendiente), limite_credito: n(c.limite_credito) }));
  }

  /**
   * Tickets a crédito de uno o varios clientes.
   * pagado = suma de pagos de la nota; saldo = total - pagado.
   * `abonos` cuenta los pagos hechos después del cierre (ligados a un movimiento de cuenta).
   */
  async tickets(clienteIds: string[], q: { estatus?: string; desde?: string; hasta?: string }) {
    if (clienteIds.length === 0) return [];
    if (clienteIds.length > 100) throw new BadRequestException('Máximo 100 clientes por consulta.');
    const empresa_id = await this.empresa();

    const where: Record<string, unknown> = {
      cliente_id: { in: clienteIds },
      ubicacion: { empresa_id },
      estatus: { in: [...ESTATUS_TICKET] },
      OR: [{ es_credito: true }, { estatus: 'CREDITO' }],
    };
    if (q.desde || q.hasta) {
      where.created_at = {
        ...(q.desde ? { gte: inicioDia(q.desde) } : {}),
        ...(q.hasta ? { lte: finDia(q.hasta) } : {}),
      };
    }

    const notas = await this.prisma.notaVenta.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 1000,
      include: {
        pagos: { select: { monto: true, metodo: true, created_at: true, movimiento_cuenta_id: true }, orderBy: { created_at: 'asc' } },
        ubicacion: { select: { id: true, nombre: true } },
      },
    });

    const ahora = Date.now();
    const out = notas.map((nota) => {
      const total = r2(n(nota.total));
      const pagado = r2(nota.pagos.reduce((s, p) => s + n(p.monto), 0));
      const saldo = Math.max(0, r2(total - pagado));
      const abierto = saldo > 0.005;
      const abonos = nota.pagos.filter((p) => p.movimiento_cuenta_id);
      const ultimo = nota.pagos.at(-1);
      return {
        id: nota.id,
        cliente_id: nota.cliente_id,
        ubicacion_id: nota.ubicacion_id,
        ubicacion: nota.ubicacion.nombre,
        folio: nota.folio,
        fecha: nota.created_at.toISOString(),
        vence: nota.fecha_vencimiento?.toISOString() ?? null,
        total,
        pagado,
        saldo,
        abierto,
        vencido: abierto && !!nota.fecha_vencimiento && nota.fecha_vencimiento.getTime() < ahora,
        estatus: nota.estatus,
        abonos_count: abonos.length,
        abonos_monto: r2(abonos.reduce((s, p) => s + n(p.monto), 0)),
        ultimo_pago_at: ultimo?.created_at.toISOString() ?? null,
      };
    });
    return q.estatus === 'abiertos' ? out.filter((t) => t.abierto) : out;
  }

  /**
   * Detalle de una venta: encabezado, productos, pagos (al cierre y abonos), movimientos de cuenta
   * y la lista de evidencias (sin el contenido; cada imagen se baja con `evidencia()`).
   */
  async ticket(id: string) {
    const empresa_id = await this.empresa();
    const nota = await this.prisma.notaVenta.findFirst({
      where: { id, ubicacion: { empresa_id } },
      include: {
        ubicacion: { select: { id: true, nombre: true } },
        cliente: { select: { id: true, nombre: true, apellidos: true, razon_social: true, rfc: true, telefono: true } },
        usuario: { select: { nombre: true, apellidos: true } },
        lineas: {
          orderBy: { created_at: 'asc' },
          include: { articulo: { select: { descripcion_1: true, descripcion_2: true, descripcion_3: true } } },
        },
        pagos: { orderBy: { created_at: 'asc' }, include: { usuario: { select: { nombre: true, apellidos: true } } } },
        movimientos: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!nota) throw new NotFoundException('Venta no encontrada');

    // Solo metadatos de las evidencias: la imagen en base64 puede pesar varios MB.
    const evs = await this.prisma.$queryRaw<
      { id: string; tipo: string; descripcion: string | null; archivo_url: string | null; created_at: Date; inicio: string | null; largo: number | null }[]
    >`SELECT id, tipo::text AS tipo, descripcion, archivo_url, created_at,
             substring(data_json->>'base64' from 1 for 40) AS inicio,
             length(data_json->>'base64') AS largo
      FROM evidencias_nota WHERE nota_id = ${id} ORDER BY created_at ASC`;

    const nombre = (u: { nombre: string; apellidos: string } | null) => (u ? `${u.nombre} ${u.apellidos}`.trim() : null);
    const total = r2(n(nota.total));
    const pagado = r2(nota.pagos.reduce((s, p) => s + n(p.monto), 0));
    const saldo = Math.max(0, r2(total - pagado));

    return {
      id: nota.id,
      folio: nota.folio,
      ubicacion: nota.ubicacion.nombre,
      ubicacion_id: nota.ubicacion.id,
      estatus: nota.estatus,
      es_credito: nota.es_credito,
      tipo: nota.es_credito ? 'CREDITO' : 'CONTADO',
      cancelada_at: nota.cancelado_at?.toISOString() ?? null,
      motivo_cancelacion: nota.motivo_cancelacion,
      fecha: nota.created_at.toISOString(),
      vence: nota.fecha_vencimiento?.toISOString() ?? null,
      cerrada_at: nota.cerrada_at?.toISOString() ?? null,
      observaciones: nota.observaciones,
      cliente: nota.cliente,
      vendedor: nombre(nota.usuario),
      subtotal: r2(n(nota.subtotal)),
      descuento: r2(n(nota.descuento)),
      aplica_iva: nota.aplica_iva,
      iva: r2(n(nota.iva)),
      total,
      pagado,
      saldo,
      lineas: nota.lineas.map((l) => ({
        clave: l.clave,
        descripcion: [l.articulo.descripcion_1, l.articulo.descripcion_2, l.articulo.descripcion_3].filter(Boolean).join(' · '),
        cantidad: n(l.cantidad),
        precio_unitario: r2(n(l.precio_unitario)),
        descuento: n(l.descuento),
        subtotal: r2(n(l.subtotal)),
      })),
      pagos: nota.pagos.map((p) => ({
        id: p.id,
        fecha: p.created_at.toISOString(),
        metodo: p.metodo,
        monto: r2(n(p.monto)),
        referencia: p.referencia,
        registrado_por: nombre(p.usuario),
        // Un pago ligado a un movimiento de cuenta es un abono posterior al cierre
        tipo: p.movimiento_cuenta_id ? 'ABONO' : 'AL_CIERRE',
      })),
      movimientos_cuenta: nota.movimientos.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        monto: r2(n(m.monto)),
        saldo_antes: r2(n(m.saldo_antes)),
        saldo_despues: r2(n(m.saldo_despues)),
        concepto: m.concepto,
        fecha: m.created_at.toISOString(),
      })),
      evidencias: evs.map((e) => {
        const mime = e.inicio?.match(DATA_URL)?.[1] ?? null;
        return {
          id: e.id,
          tipo: e.tipo,
          descripcion: e.descripcion,
          fecha: e.created_at.toISOString(),
          tiene_archivo: !!mime && MIME_OK.has(mime),
          mime: mime && MIME_OK.has(mime) ? mime : null,
          tamano_aprox: e.largo ? Math.round((e.largo * 3) / 4) : null,
          archivo_url: e.archivo_url,
        };
      }),
    };
  }

  /**
   * TODAS las ventas de un cliente (contado y crédito, pagadas, canceladas…), paginadas, con cuándo se
   * liquidó cada una y con qué se pagó. `estatus` acepta uno o varios separados por coma.
   */
  async ventasCliente(
    clienteId: string,
    q: { page?: string; limit?: string; estatus?: string; tipo?: string; desde?: string; hasta?: string; q?: string },
  ) {
    const empresa_id = await this.empresa();
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, ubicacion: { empresa_id } },
      select: { id: true, nombre: true, apellidos: true, razon_social: true },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));

    // Filtros que NO incluyen el estatus: sirven también para contar cuántas hay de cada uno
    const base: Record<string, unknown> = { cliente_id: clienteId, estatus: { in: ESTATUS_VENTA } };
    if (q.tipo === 'credito') base.es_credito = true;
    if (q.tipo === 'contado') {
      base.es_credito = false;
      base.estatus = { in: ESTATUS_VENTA.filter((e) => e !== 'CREDITO') };
    }
    if (q.desde || q.hasta) {
      base.created_at = {
        ...(q.desde ? { gte: inicioDia(q.desde) } : {}),
        ...(q.hasta ? { lte: finDia(q.hasta) } : {}),
      };
    }
    if (q.q && /^\d+$/.test(q.q.trim())) base.folio = Number(q.q.trim());

    const pedidos = (q.estatus ?? '').split(',').map((e) => e.trim().toUpperCase()).filter((e) => ESTATUS_VENTA.includes(e));
    const where = pedidos.length ? { ...base, estatus: { in: pedidos } } : base;
    const vigentes = { ...where, estatus: { in: (pedidos.length ? pedidos : ESTATUS_VENTA).filter((e) => e !== 'CANCELADA') } };
    const abiertas = { ...where, estatus: 'CREDITO' };

    const [total, notas, porEstatus, vendido, pagadoAgg, credito, creditoPagado, rango] = await Promise.all([
      this.prisma.notaVenta.count({ where: where as never }),
      this.prisma.notaVenta.findMany({
        where: where as never,
        orderBy: [{ created_at: 'desc' }, { folio: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          ubicacion: { select: { id: true, nombre: true } },
          usuario: { select: { nombre: true, apellidos: true } },
          lineas: { select: { id: true } },
        },
      }),
      this.prisma.notaVenta.groupBy({ by: ['estatus'], where: base as never, _count: true }),
      this.prisma.notaVenta.aggregate({ where: vigentes as never, _sum: { total: true }, _count: true }),
      this.prisma.pago.aggregate({ where: { nota: vigentes as never }, _sum: { monto: true } }),
      this.prisma.notaVenta.aggregate({ where: abiertas as never, _sum: { total: true } }),
      this.prisma.pago.aggregate({ where: { nota: abiertas as never }, _sum: { monto: true } }),
      this.prisma.notaVenta.aggregate({ where: where as never, _min: { created_at: true }, _max: { created_at: true } }),
    ]);

    // Pagos de las ventas de esta página (una sola consulta)
    const pagos = await this.prisma.pago.findMany({
      where: { nota_id: { in: notas.map((x) => x.id) } },
      select: { nota_id: true, metodo: true, monto: true, created_at: true, movimiento_cuenta_id: true },
      orderBy: { created_at: 'asc' },
    });
    const porNota = new Map<string, typeof pagos>();
    for (const p of pagos) porNota.set(p.nota_id, [...(porNota.get(p.nota_id) ?? []), p]);

    const items = notas.map((nota) => {
      const ps = porNota.get(nota.id) ?? [];
      const totalN = r2(n(nota.total));
      const pagado = r2(ps.reduce((s, p) => s + n(p.monto), 0));
      const saldo = Math.max(0, r2(totalN - pagado));
      // Se liquidó con el pago que hizo que lo pagado alcanzara el total
      let corrido = 0;
      let liquidada: Date | null = null;
      for (const p of ps) {
        corrido += n(p.monto);
        if (corrido >= totalN - 0.005) {
          liquidada = p.created_at;
          break;
        }
      }
      if (!liquidada && nota.estatus !== 'CANCELADA' && saldo <= 0.005 && ps.length) liquidada = ps[ps.length - 1].created_at;
      const dias = liquidada ? Math.max(0, Math.floor((liquidada.getTime() - nota.created_at.getTime()) / 86_400_000)) : null;
      const abonos = ps.filter((p) => p.movimiento_cuenta_id);
      return {
        id: nota.id,
        folio: nota.folio,
        ubicacion: nota.ubicacion.nombre,
        ubicacion_id: nota.ubicacion.id,
        fecha: nota.created_at.toISOString(),
        cerrada_at: nota.cerrada_at?.toISOString() ?? null,
        estatus: nota.estatus,
        tipo: nota.es_credito ? 'CREDITO' : 'CONTADO',
        total: totalN,
        pagado,
        saldo,
        vence: nota.fecha_vencimiento?.toISOString() ?? null,
        productos: nota.lineas.length,
        metodos: [...new Set(ps.map((p) => p.metodo))],
        pagos_count: ps.length,
        abonos_count: abonos.length,
        primer_pago_at: ps[0]?.created_at.toISOString() ?? null,
        ultimo_pago_at: ps.at(-1)?.created_at.toISOString() ?? null,
        liquidada_at: liquidada?.toISOString() ?? null,
        dias_a_liquidar: dias,
        cancelada_at: nota.cancelado_at?.toISOString() ?? null,
        motivo_cancelacion: nota.motivo_cancelacion,
        vendedor: nota.usuario ? `${nota.usuario.nombre} ${nota.usuario.apellidos}`.trim() : null,
      };
    });

    const vendidoN = r2(n(vendido._sum.total));
    const pagadoN = r2(n(pagadoAgg._sum.monto));
    return {
      cliente,
      total,
      page,
      limit,
      items,
      por_estatus: Object.fromEntries(porEstatus.map((e) => [e.estatus, e._count])),
      resumen: {
        ventas: vendido._count,
        vendido: vendidoN,
        pagado: pagadoN,
        por_cobrar: Math.max(0, r2(n(credito._sum.total) - n(creditoPagado._sum.monto))),
        ticket_promedio: vendido._count ? r2(vendidoN / vendido._count) : 0,
        primera_venta: rango._min.created_at?.toISOString() ?? null,
        ultima_venta: rango._max.created_at?.toISOString() ?? null,
      },
    };
  }

  /** Imagen/PDF de una evidencia de una venta. Solo tipos de archivo conocidos. */
  async evidencia(notaId: string, evidenciaId: string) {
    const empresa_id = await this.empresa();
    const nota = await this.prisma.notaVenta.findFirst({ where: { id: notaId, ubicacion: { empresa_id } }, select: { id: true } });
    if (!nota) throw new NotFoundException('Venta no encontrada');
    const rows = await this.prisma.$queryRaw<{ b64: string | null }[]>`
      SELECT data_json->>'base64' AS b64 FROM evidencias_nota WHERE id = ${evidenciaId} AND nota_id = ${notaId}`;
    const b64 = rows[0]?.b64;
    const mime = b64?.match(DATA_URL)?.[1];
    if (!b64 || !mime || !MIME_OK.has(mime)) throw new NotFoundException('La evidencia no tiene un archivo disponible');
    return { mime, buffer: Buffer.from(b64.replace(DATA_URL, ''), 'base64') };
  }

  /** Cargos, abonos y ajustes de la cuenta del cliente en el ERP (para auditar el saldo). */
  async movimientos(clienteId: string, q: { desde?: string; hasta?: string; limit?: string }) {
    const empresa_id = await this.empresa();
    const c = await this.prisma.cliente.findFirst({ where: { id: clienteId, ubicacion: { empresa_id } }, select: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    const rows = await this.prisma.movimientoCuenta.findMany({
      where: {
        cliente_id: clienteId,
        ...(q.desde || q.hasta
          ? { created_at: { ...(q.desde ? { gte: inicioDia(q.desde) } : {}), ...(q.hasta ? { lte: finDia(q.hasta) } : {}) } }
          : {}),
      },
      orderBy: { created_at: 'desc' },
      take: Math.min(500, Number(q.limit) || 100),
    });
    return rows.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      monto: n(m.monto),
      saldo_antes: n(m.saldo_antes),
      saldo_despues: n(m.saldo_despues),
      concepto: m.concepto,
      fecha: m.created_at.toISOString(),
    }));
  }
}
