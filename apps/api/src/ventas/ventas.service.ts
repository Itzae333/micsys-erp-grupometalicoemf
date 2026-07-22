import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateNotaDto, AddLineaDto, UpdateLineaDto, CerrarNotaDto, CancelarNotaDto, AbonarNotaDto, SendEmailDto, AgregarEvidenciaDto, VentaRapidaDto } from './dto/ventas.dto';
import type { Prisma } from '@grupometalicoemf/database';
import { inicioDiaMx, finDiaMx } from '../common/utils/fecha-mx';

const NOTA_INCLUDE = {
  cliente: { select: { id: true, nombre: true, apellidos: true, razon_social: true, email: true, telefono: true, limite_credito: true, saldo_pendiente: true } },
  usuario: { select: { id: true, nombre: true, apellidos: true } },
  lineas: {
    include: {
      articulo: {
        select: {
          id: true, clave: true,
          descripcion_1: true, descripcion_2: true,
          descripcion_3: true, descripcion_4: true, descripcion_5: true,
        },
      },
    },
    orderBy: { created_at: 'asc' as const },
  },
  pagos: { orderBy: { created_at: 'asc' as const } },
  evidencias: {
    orderBy: { created_at: 'asc' as const },
    include: { subido_por: { select: { id: true, nombre: true, apellidos: true } } },
  },
} satisfies Prisma.NotaVentaInclude;

type NotaRaw = Prisma.NotaVentaGetPayload<{ include: typeof NOTA_INCLUDE }>;

// URL pública donde este API sirve /uploads/ (logos) — necesaria para que el logo
// se vea en correos, ya que ahí no hay origen desde el cual resolver rutas relativas.
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL ?? 'http://localhost:3001').replace(/\/$/, '');

function resolveLogoUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_PUBLIC_URL}${url}`;
}

@Injectable()
export class VentasService {
  constructor(private prisma: PrismaService) {}

  // ─── Listar ───────────────────────────────────────────────────

  async findAll(ubicacionId: string, query: {
    estatus?: string; page?: number; limit?: number;
    q?: string; desde?: string;
  } = {}) {
    const { estatus, page = 1, limit = 50, q, desde } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NotaVentaWhereInput = { ubicacion_id: ubicacionId };
    if (estatus) where.estatus = estatus as any;
    if (desde) where.created_at = { gte: inicioDiaMx(desde) };
    if (q) {
      const folioNum = parseInt(q, 10);
      where.OR = [
        ...(isNaN(folioNum) ? [] : [{ folio: folioNum }]),
        { cliente: { nombre: { contains: q, mode: 'insensitive' } } },
        { cliente: { razon_social: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.notaVenta.count({ where }),
      this.prisma.notaVenta.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: NOTA_INCLUDE,
      }),
    ]);

    return {
      data: data.map((n) => this.serializeNota(n)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, ubicacionId: string) {
    const nota = await this.findOneRaw(id, ubicacionId);

    // Si la nota fue reabierta para edición y ya estaba a crédito, el cargo
    // previo en la cuenta del cliente todavía no se revierte (eso solo pasa
    // al volver a cerrarla, ver `cerrar()`). Se expone aquí para que el
    // frontend pueda validar el límite de crédito sin contar ese cargo dos veces.
    let creditoPrevio = 0;
    if (nota.estatus === 'REABIERTA' && nota.es_credito && nota.cliente_id) {
      const cargoPrevio = await this.prisma.movimientoCuenta.aggregate({
        where: { nota_id: id, tipo: 'CARGO' },
        _sum: { monto: true },
      });
      creditoPrevio = Number(cargoPrevio._sum.monto ?? 0);
    }

    return this.serializeNota(nota, creditoPrevio);
  }

  // ─── Crear nota ───────────────────────────────────────────────

  async create(dto: CreateNotaDto, ubicacionId: string, usuarioId: string) {
    const folio = await this.nextFolio(ubicacionId);

    const nota = await this.prisma.$transaction(async (tx) => {
      const n = await tx.notaVenta.create({
        data: {
          folio,
          ubicacion_id: ubicacionId,
          usuario_id: usuarioId,
          cliente_id: dto.cliente_id ?? null,
          observaciones: dto.observaciones ?? null,
          estatus: dto.es_cotizacion ? 'COTIZACION' : 'ABIERTA',
          subtotal: 0,
          total: 0,
        },
      });

      if (dto.lineas && dto.lineas.length > 0) {
        for (const l of dto.lineas) {
          const art = await tx.articulo.findFirst({
            where: { id: l.articulo_id, ubicacion_id: ubicacionId },
          });
          if (!art) throw new NotFoundException(`Artículo ${l.articulo_id} no encontrado`);

          const subtotal = this.calcSubtotal(l.cantidad, l.precio_unitario, l.descuento ?? 0);
          await tx.notaVentaLinea.create({
            data: {
              nota_id: n.id,
              articulo_id: art.id,
              clave: art.clave,
              cantidad: l.cantidad,
              precio_unitario: l.precio_unitario,
              descuento: l.descuento ?? 0,
              subtotal,
            },
          });
        }
        await this.recalcNota(tx, n.id);
      }

      return tx.notaVenta.findFirstOrThrow({ where: { id: n.id }, include: NOTA_INCLUDE });
    });

    return this.serializeNota(nota);
  }

  // ─── Líneas ───────────────────────────────────────────────────

  async addLinea(notaId: string, dto: AddLineaDto, ubicacionId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);
    if (!['ABIERTA', 'COTIZACION', 'REABIERTA'].includes(nota.estatus)) {
      throw new ForbiddenException('Solo se pueden agregar líneas a notas ABIERTA, COTIZACION o REABIERTA');
    }

    const art = await this.prisma.articulo.findFirst({
      where: { id: dto.articulo_id, ubicacion_id: ubicacionId },
    });
    if (!art) throw new NotFoundException('Artículo no encontrado');
    if (!art.activo) throw new BadRequestException('El artículo está inactivo');

    const subtotal = this.calcSubtotal(dto.cantidad, dto.precio_unitario, dto.descuento ?? 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.notaVentaLinea.create({
        data: {
          nota_id: notaId,
          articulo_id: art.id,
          clave: art.clave,
          cantidad: dto.cantidad,
          precio_unitario: dto.precio_unitario,
          descuento: dto.descuento ?? 0,
          subtotal,
        },
      });
      await this.recalcNota(tx, notaId);
    });

    return this.findOne(notaId, ubicacionId);
  }

  async updateLinea(notaId: string, lineaId: string, dto: UpdateLineaDto, ubicacionId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);
    if (!['ABIERTA', 'COTIZACION', 'REABIERTA'].includes(nota.estatus)) {
      throw new ForbiddenException('Solo se pueden editar líneas de notas ABIERTA, COTIZACION o REABIERTA');
    }

    const linea = await this.prisma.notaVentaLinea.findFirst({
      where: { id: lineaId, nota_id: notaId },
    });
    if (!linea) throw new NotFoundException('Línea no encontrada');

    const cantidad = dto.cantidad ?? Number(linea.cantidad);
    const precio = dto.precio_unitario ?? Number(linea.precio_unitario);
    const descuento = dto.descuento ?? Number(linea.descuento);
    const subtotal = this.calcSubtotal(cantidad, precio, descuento);

    await this.prisma.$transaction(async (tx) => {
      await tx.notaVentaLinea.update({
        where: { id: lineaId },
        data: { cantidad, precio_unitario: precio, descuento, subtotal },
      });
      await this.recalcNota(tx, notaId);
    });

    return this.findOne(notaId, ubicacionId);
  }

  async removeLinea(notaId: string, lineaId: string, ubicacionId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);
    if (!['ABIERTA', 'COTIZACION', 'REABIERTA'].includes(nota.estatus)) {
      throw new ForbiddenException('Solo se pueden eliminar líneas de notas ABIERTA, COTIZACION o REABIERTA');
    }

    const linea = await this.prisma.notaVentaLinea.findFirst({
      where: { id: lineaId, nota_id: notaId },
    });
    if (!linea) throw new NotFoundException('Línea no encontrada');

    await this.prisma.$transaction(async (tx) => {
      await tx.notaVentaLinea.delete({ where: { id: lineaId } });
      await this.recalcNota(tx, notaId);
    });

    return this.findOne(notaId, ubicacionId);
  }

  // ─── Cerrar / Cobrar ─────────────────────────────────────────

  async cerrar(notaId: string, dto: CerrarNotaDto, ubicacionId: string, usuarioId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);

    if (!['ABIERTA', 'PENDIENTE', 'REABIERTA'].includes(nota.estatus)) {
      throw new ForbiddenException(`No se puede cobrar una nota en estatus ${nota.estatus}`);
    }
    if (nota.lineas.length === 0) {
      throw new BadRequestException('La nota no tiene líneas');
    }

    const esReedicion = nota.estatus === 'REABIERTA';

    const totalPagado = dto.pagos.reduce((s, p) => s + p.monto, 0);
    const totalNota = Number(nota.total);
    const diferencia = +Math.max(0, totalNota - totalPagado).toFixed(2);

    if (diferencia > 0 && !nota.cliente_id) {
      throw new BadRequestException(
        `Se requiere cliente asignado para registrar el saldo restante ($${diferencia.toFixed(2)}) a crédito`,
      );
    }

    const esCredito = diferencia > 0;
    const nuevoEstatus: 'PAGADA' | 'CREDITO' = esCredito ? 'CREDITO' : 'PAGADA';

    const result = await this.prisma.$transaction(async (tx) => {
      if (esReedicion) {
        // Reemplaza los pagos previos y, si la venta original fue a crédito,
        // revierte el cargo aplicado a la cuenta del cliente antes de recalcular.
        await tx.pago.deleteMany({ where: { nota_id: notaId } });

        if (nota.es_credito && nota.cliente_id) {
          const cargoPrevio = await tx.movimientoCuenta.aggregate({
            where: { nota_id: notaId, tipo: 'CARGO' },
            _sum: { monto: true },
          });
          const montoPrevio = Number(cargoPrevio._sum.monto ?? 0);

          if (montoPrevio > 0) {
            const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: nota.cliente_id } });
            const saldoAntes = Number(cliente.saldo_pendiente);
            const saldoDespues = Math.max(0, saldoAntes - montoPrevio);

            await tx.movimientoCuenta.create({
              data: {
                ubicacion_id: ubicacionId,
                cliente_id: nota.cliente_id,
                tipo: 'AJUSTE',
                monto: montoPrevio,
                saldo_antes: saldoAntes,
                saldo_despues: saldoDespues,
                concepto: `Reversión de crédito por edición autorizada — nota #${nota.folio}`,
                nota_id: notaId,
                usuario_id: usuarioId,
              },
            });

            await tx.cliente.update({ where: { id: nota.cliente_id }, data: { saldo_pendiente: saldoDespues } });
          }
        }
      }

      for (const p of dto.pagos) {
        await tx.pago.create({
          data: {
            nota_id: notaId,
            metodo: p.metodo,
            monto: p.monto,
            referencia: p.referencia ?? null,
            // En una reedición el pago corrige el cobro original: debe quedar
            // fechado el día de la venta, no el día de la corrección.
            ...(esReedicion ? { created_at: nota.created_at } : {}),
          },
        });
      }

      if (dto.observaciones) {
        await tx.notaVenta.update({ where: { id: notaId }, data: { observaciones: dto.observaciones } });
      }

      if (esCredito && nota.cliente_id) {
        await this.aplicarCargoCredito(tx, {
          ubicacionId,
          clienteId: nota.cliente_id,
          monto: diferencia,
          notaId,
          folio: nota.folio,
          usuarioId,
          totalPagado,
        });
      }

      if (esReedicion) {
        const ubicacion = await tx.ubicacion.findUniqueOrThrow({ where: { id: ubicacionId }, select: { empresa_id: true } });
        const lineasActuales = await tx.notaVentaLinea.findMany({ where: { nota_id: notaId } });

        await tx.evidenciaNota.create({
          data: {
            nota_id: notaId,
            empresa_id: ubicacion.empresa_id,
            tipo: 'TICKET_REEDITADO',
            descripcion: `Ticket regenerado tras edición autorizada (v${nota.version + 1})`,
            data_json: {
              version: nota.version + 1,
              total: totalNota,
              lineas: lineasActuales.map((l) => ({
                articulo_id: l.articulo_id, clave: l.clave, cantidad: Number(l.cantidad),
                precio_unitario: Number(l.precio_unitario), descuento: Number(l.descuento), subtotal: Number(l.subtotal),
              })),
              pagos: dto.pagos,
            } as any,
            subido_por_id: usuarioId,
          },
        });
      }

      return tx.notaVenta.update({
        where: { id: notaId },
        data: {
          estatus: nuevoEstatus,
          es_credito: esCredito,
          version: esReedicion ? { increment: 1 } : undefined,
          fecha_vencimiento: dto.fecha_vencimiento ? new Date(dto.fecha_vencimiento) : null,
          cerrada_at: new Date(),
        },
        include: NOTA_INCLUDE,
      });
    });

    return this.serializeNota(result);
  }

  // ─── Marcar como pendiente de pago ───────────────────────────

  async marcarPendiente(notaId: string, ubicacionId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);
    if (nota.estatus !== 'ABIERTA') {
      throw new BadRequestException('Solo se pueden marcar como pendiente notas ABIERTA');
    }
    if (nota.lineas.length === 0) {
      throw new BadRequestException('La nota no tiene líneas');
    }
    const result = await this.prisma.notaVenta.update({
      where: { id: notaId },
      data: { estatus: 'PENDIENTE' },
      include: NOTA_INCLUDE,
    });
    return this.serializeNota(result);
  }

  // ─── Convertir cotización a nota abierta ──────────────────────

  async convertirAVenta(notaId: string, ubicacionId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);
    if (nota.estatus !== 'COTIZACION') {
      throw new BadRequestException('Solo se pueden convertir cotizaciones a notas de venta');
    }
    const result = await this.prisma.notaVenta.update({
      where: { id: notaId },
      data: { estatus: 'ABIERTA' },
      include: NOTA_INCLUDE,
    });
    return this.serializeNota(result);
  }

  // ─── Cancelar ─────────────────────────────────────────────────

  async cancelar(notaId: string, dto: CancelarNotaDto, ubicacionId: string, usuarioId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);

    if (nota.estatus === 'PAGADA' || nota.estatus === 'CANCELADA') {
      throw new ForbiddenException(`No se puede cancelar una nota en estatus ${nota.estatus}`);
    }

    if (dto.motivo === 'OTRO' && !dto.comentario?.trim()) {
      throw new BadRequestException('El comentario es obligatorio cuando el motivo es "Otro"');
    }

    // El cargo a la cuenta del cliente puede ser menor a nota.total (si hubo
    // anticipo), y una nota REABIERTA que ya estaba a crédito conserva el cargo
    // previo sin revertir hasta que se vuelva a cerrar (ver `cerrar()` y
    // `findOne()`) — por eso se recalcula desde MovimientoCuenta en vez de
    // asumir nota.total, y se revierte también si sigue REABIERTA.
    const teniaCredito = nota.estatus === 'CREDITO' || (nota.estatus === 'REABIERTA' && nota.es_credito);
    if (teniaCredito && nota.cliente_id) {
      const cargoPrevio = await this.prisma.movimientoCuenta.aggregate({
        where: { nota_id: notaId, tipo: 'CARGO' },
        _sum: { monto: true },
      });
      const montoCargo = Number(cargoPrevio._sum.monto ?? 0);
      if (montoCargo > 0) {
        await this.prisma.cliente.update({
          where: { id: nota.cliente_id },
          data: { saldo_pendiente: { decrement: montoCargo } },
        });
      }
    }

    const result = await this.prisma.notaVenta.update({
      where: { id: notaId },
      data: {
        estatus: 'CANCELADA',
        motivo_cancelacion: dto.motivo,
        motivo_cancelacion_comentario: dto.comentario?.trim() || null,
        cancelado_por_id: usuarioId,
        cancelado_at: new Date(),
      },
      include: NOTA_INCLUDE,
    });

    return this.serializeNota(result);
  }

  // ─── Privados ─────────────────────────────────────────────────

  private async findOneRaw(id: string, ubicacionId: string): Promise<NotaRaw> {
    const nota = await this.prisma.notaVenta.findFirst({
      where: { id, ubicacion_id: ubicacionId },
      include: NOTA_INCLUDE,
    });
    if (!nota) throw new NotFoundException('Nota de venta no encontrada');
    return nota;
  }

  private calcSubtotal(cantidad: number, precio: number, descuento: number): number {
    return cantidad * precio * (1 - descuento / 100);
  }

  private async nextFolio(ubicacionId: string): Promise<number> {
    const last = await this.prisma.notaVenta.findFirst({
      where: { ubicacion_id: ubicacionId },
      orderBy: { folio: 'desc' },
      select: { folio: true },
    });
    return (last?.folio ?? 0) + 1;
  }

  private async recalcNota(tx: Prisma.TransactionClient, notaId: string) {
    const lineas = await tx.notaVentaLinea.findMany({ where: { nota_id: notaId } });
    const subtotal = lineas.reduce((s, l) => s + Number(l.subtotal), 0);
    await tx.notaVenta.update({
      where: { id: notaId },
      data: { subtotal, total: subtotal },
    });
  }

  // Aplica el cargo a la cuenta del cliente cuando una nota queda (parcialmente)
  // a crédito. Compartido por `cerrar()` y `ventaRapida()`.
  private async aplicarCargoCredito(
    tx: Prisma.TransactionClient,
    params: {
      ubicacionId: string;
      clienteId: string;
      monto: number;
      notaId: string;
      folio: number;
      usuarioId: string;
      totalPagado: number;
    },
  ): Promise<void> {
    const { ubicacionId, clienteId, monto, notaId, folio, usuarioId, totalPagado } = params;

    const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: clienteId } });
    const saldoAntes = Number(cliente.saldo_pendiente);
    const saldoDespues = saldoAntes + monto;

    const concepto = totalPagado > 0
      ? `Saldo pendiente nota #${folio} (anticipo $${totalPagado.toFixed(2)})`
      : `Venta a crédito nota #${folio}`;

    await tx.movimientoCuenta.create({
      data: {
        ubicacion_id: ubicacionId,
        cliente_id: clienteId,
        tipo: 'CARGO',
        monto,
        saldo_antes: saldoAntes,
        saldo_despues: saldoDespues,
        concepto,
        nota_id: notaId,
        usuario_id: usuarioId,
      },
    });

    await tx.cliente.update({
      where: { id: clienteId },
      data: { saldo_pendiente: saldoDespues },
    });
  }

  // Folio con lock de fila — evita que dos ventas concurrentes (p. ej. varias
  // ventas offline sincronizando casi al mismo tiempo) lean el mismo "próximo folio".
  private async nextFolioLocked(tx: Prisma.TransactionClient, ubicacionId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ folio: number }[]>`
      SELECT folio FROM notas_venta WHERE ubicacion_id = ${ubicacionId} ORDER BY folio DESC LIMIT 1 FOR UPDATE
    `;
    return (rows[0]?.folio ?? 0) + 1;
  }

  // ─── Venta rápida (crea + cierra en una sola operación atómica) ────────
  // Pensado para el flujo offline: una venta completa (contado o crédito) se
  // encola como UNA sola mutación, sin depender de IDs generados en pasos
  // previos. `client_ref` es la clave de idempotencia — reintentos de la cola
  // de sincronización con el mismo valor nunca crean una segunda nota.
  async ventaRapida(dto: VentaRapidaDto, ubicacionId: string, usuarioId: string) {
    const existente = await this.prisma.notaVenta.findUnique({
      where: { origen_offline_ref: dto.client_ref },
    });
    if (existente) return this.findOne(existente.id, ubicacionId);

    if (dto.tipo_cierre === 'CREDITO' && !dto.cliente_id) {
      throw new BadRequestException('Se requiere cliente para una venta a crédito');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const folio = await this.nextFolioLocked(tx, ubicacionId);

      const nota = await tx.notaVenta.create({
        data: {
          folio,
          ubicacion_id: ubicacionId,
          usuario_id: usuarioId,
          cliente_id: dto.cliente_id ?? null,
          observaciones: dto.observaciones ?? null,
          estatus: 'ABIERTA',
          subtotal: 0,
          total: 0,
          origen_offline_ref: dto.client_ref,
        },
      });

      let subtotal = 0;
      for (const l of dto.lineas) {
        const art = await tx.articulo.findFirst({
          where: { id: l.articulo_id, ubicacion_id: ubicacionId },
        });
        if (!art) throw new NotFoundException(`Artículo ${l.articulo_id} no encontrado`);

        const lineaSubtotal = this.calcSubtotal(l.cantidad, l.precio_unitario, l.descuento ?? 0);
        subtotal += lineaSubtotal;
        await tx.notaVentaLinea.create({
          data: {
            nota_id: nota.id,
            articulo_id: art.id,
            clave: art.clave,
            cantidad: l.cantidad,
            precio_unitario: l.precio_unitario,
            descuento: l.descuento ?? 0,
            subtotal: lineaSubtotal,
          },
        });
      }
      subtotal = +subtotal.toFixed(2);

      if (dto.tipo_cierre === 'PENDIENTE') {
        return tx.notaVenta.update({
          where: { id: nota.id },
          data: { subtotal, total: subtotal, estatus: 'PENDIENTE' },
          include: NOTA_INCLUDE,
        });
      }

      const totalPagado = dto.pagos.reduce((s, p) => s + p.monto, 0);
      const diferencia = +Math.max(0, subtotal - totalPagado).toFixed(2);
      const esCredito = dto.tipo_cierre === 'CREDITO' || diferencia > 0;

      if (esCredito && !dto.cliente_id) {
        throw new BadRequestException(
          `Se requiere cliente asignado para registrar el saldo restante ($${diferencia.toFixed(2)}) a crédito`,
        );
      }

      if (esCredito && dto.cliente_id) {
        const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: dto.cliente_id } });
        const limite = Number(cliente.limite_credito);
        const saldoActual = Number(cliente.saldo_pendiente);
        if (limite > 0 && saldoActual + diferencia > limite) {
          throw new UnprocessableEntityException(
            `La venta excede el límite de crédito del cliente (límite $${limite.toFixed(2)}, saldo actual $${saldoActual.toFixed(2)}, cargo $${diferencia.toFixed(2)})`,
          );
        }
      }

      for (const p of dto.pagos) {
        await tx.pago.create({
          data: { nota_id: nota.id, metodo: p.metodo, monto: p.monto, referencia: p.referencia ?? null },
        });
      }

      if (esCredito && dto.cliente_id) {
        await this.aplicarCargoCredito(tx, {
          ubicacionId,
          clienteId: dto.cliente_id,
          monto: diferencia,
          notaId: nota.id,
          folio,
          usuarioId,
          totalPagado,
        });
      }

      return tx.notaVenta.update({
        where: { id: nota.id },
        data: {
          subtotal,
          total: subtotal,
          estatus: esCredito ? 'CREDITO' : 'PAGADA',
          es_credito: esCredito,
          fecha_vencimiento: dto.fecha_vencimiento ? new Date(dto.fecha_vencimiento) : null,
          cerrada_at: new Date(),
        },
        include: NOTA_INCLUDE,
      });
    });

    return this.serializeNota(result);
  }

  private serializeNota(nota: NotaRaw, creditoPrevio = 0) {
    return {
      ...nota,
      subtotal: Number(nota.subtotal),
      descuento: Number(nota.descuento),
      total: Number(nota.total),
      credito_previo: creditoPrevio,
      cliente: nota.cliente ? {
        ...nota.cliente,
        limite_credito: Number((nota.cliente as any).limite_credito ?? 0),
        saldo_pendiente: Number((nota.cliente as any).saldo_pendiente ?? 0),
      } : null,
      lineas: nota.lineas.map((l) => ({
        ...l,
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario),
        descuento: Number(l.descuento),
        subtotal: Number(l.subtotal),
      })),
      pagos: nota.pagos.map((p) => ({
        ...p,
        monto: Number(p.monto),
      })),
      evidencias: nota.evidencias.map((ev) => ({
        ...ev,
        data_json: ev.data_json as { base64?: string } | null,
      })),
    };
  }

  // ─── Abonar a nota en crédito ────────────────────────────────

  async abonar(notaId: string, dto: AbonarNotaDto, ubicacionId: string, usuarioId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);

    if (nota.estatus !== 'CREDITO') {
      throw new ForbiddenException('Solo se pueden registrar abonos en notas con estatus CRÉDITO');
    }
    if (!nota.cliente_id) {
      throw new BadRequestException('La nota no tiene cliente asignado');
    }

    const totalPagado = nota.pagos.reduce((s, p) => s + Number(p.monto), 0);
    const totalNota = Number(nota.total);
    const saldoNota = +(totalNota - totalPagado).toFixed(2);

    const montoAbono = dto.pagos.reduce((s, p) => s + p.monto, 0);
    if (montoAbono <= 0) {
      throw new BadRequestException('El monto del abono debe ser mayor a cero');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      for (const p of dto.pagos) {
        await tx.pago.create({
          data: { nota_id: notaId, metodo: p.metodo, monto: p.monto, referencia: p.referencia ?? null },
        });
      }

      const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: nota.cliente_id! } });
      const saldoAntes = Number(cliente.saldo_pendiente);
      const abonoReal = Math.min(montoAbono, saldoNota);
      const saldoDespues = Math.max(0, +(saldoAntes - abonoReal).toFixed(2));

      await tx.movimientoCuenta.create({
        data: {
          ubicacion_id: ubicacionId,
          cliente_id: nota.cliente_id!,
          tipo: 'ABONO',
          monto: abonoReal,
          saldo_antes: saldoAntes,
          saldo_despues: saldoDespues,
          concepto: `Abono nota #${nota.folio} ($${abonoReal.toFixed(2)})`,
          nota_id: notaId,
          usuario_id: usuarioId,
        },
      });

      await tx.cliente.update({
        where: { id: nota.cliente_id! },
        data: { saldo_pendiente: saldoDespues },
      });

      const totalPagadoNuevo = totalPagado + montoAbono;
      const nuevoEstatus = totalPagadoNuevo >= totalNota ? 'PAGADA' : 'CREDITO';

      return tx.notaVenta.update({
        where: { id: notaId },
        data: { estatus: nuevoEstatus },
        include: NOTA_INCLUDE,
      });
    });

    return this.serializeNota(result);
  }

  // ─── Evidencias ───────────────────────────────────────────

  async agregarEvidencia(notaId: string, dto: AgregarEvidenciaDto, empresaId: string, usuarioId: string) {
    // findOneRaw sin empresa para localizar la nota por id solo
    const nota = await this.prisma.notaVenta.findFirst({
      where: { id: notaId },
      include: NOTA_INCLUDE,
    });
    if (!nota) throw new NotFoundException('Nota de venta no encontrada');

    if (!['PAGADA', 'CREDITO'].includes(nota.estatus)) {
      throw new ForbiddenException('Solo se pueden agregar evidencias a notas PAGADA o CRÉDITO');
    }

    const metodosConEvidencia = ['TARJETA', 'TRANSFERENCIA', 'DEPOSITO'];
    const tienePagoElegible = nota.pagos.some((p) => metodosConEvidencia.includes(p.metodo));
    if (!tienePagoElegible) {
      throw new ForbiddenException(
        'Solo se pueden agregar evidencias cuando hay pagos con tarjeta, transferencia o depósito',
      );
    }

    const dataJson = dto.data_base64 ? { base64: dto.data_base64 } : undefined;

    await this.prisma.evidenciaNota.create({
      data: {
        nota_id: notaId,
        empresa_id: empresaId,
        tipo: 'COMPROBANTE_PAGO',
        descripcion: dto.descripcion ?? null,
        archivo_url: dto.archivo_url ?? null,
        data_json: dataJson,
        subido_por_id: usuarioId,
      },
    });

    return this.serializeNota(nota);
  }

  // ─── Enviar email ─────────────────────────────────────────

  async sendEmail(id: string, empresaId: string, dto: SendEmailDto) {
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost) {
      throw new BadRequestException(
        'Email no configurado. Agrega las variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS al entorno del API.',
      );
    }

    const nota = await this.prisma.notaVenta.findFirst({
      where: { id },
      include: NOTA_INCLUDE,
    });
    if (!nota) throw new NotFoundException('Nota de venta no encontrada');

    const [empresa, ubicacion] = await Promise.all([
      this.prisma.empresa.findUnique({ where: { id: empresaId } }),
      nota.ubicacion_id
        ? this.prisma.ubicacion.findUnique({ where: { id: nota.ubicacion_id } })
        : Promise.resolve(null),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require('nodemailer') as typeof import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const folioStr = `#${String(nota.folio).padStart(4, '0')}`;
    const subject = dto.tipo === 'cotizacion'
      ? `Cotización ${folioStr} — ${empresa?.nombre ?? ''}`
      : `Comprobante de venta ${folioStr} — ${empresa?.nombre ?? ''}`;

    const html = this.buildEmailHtml(nota, empresa as any, ubicacion as any, dto);

    await transporter.sendMail({
      from: `"${empresa?.nombre ?? 'GrupoMetalicoEMF'}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
      to: dto.to,
      subject,
      html,
    });

    return { ok: true, to: dto.to, subject };
  }

  private buildEmailHtml(nota: NotaRaw, empresa: any, ubicacion: any, dto: SendEmailDto): string {
    const esCotizacion = dto.tipo === 'cotizacion';
    const folioStr = `#${String(nota.folio).padStart(4, '0')}`;
    const fechaStr = new Date(nota.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const clienteNombre = nota.cliente
      ? (nota.cliente.razon_social ?? `${nota.cliente.nombre}${nota.cliente.apellidos ? ' ' + nota.cliente.apellidos : ''}`)
      : 'Público en general';

    // Logo: ubicacion primero, luego empresa
    const rawLogoUrl = ubicacion?.logo_url ?? empresa?.logo_url ?? null;
    const logoHtml = rawLogoUrl
      ? `<img src="${resolveLogoUrl(rawLogoUrl)}" alt="Logo" style="max-height:70px;max-width:180px;display:block;margin:0 auto 10px;">`
      : '';

    const razonSocial = (ubicacion?.razon_social ?? empresa?.razon_social ?? empresa?.nombre ?? '').toUpperCase();
    const infoLineas: string[] = [];
    const rfc = ubicacion?.rfc ?? empresa?.rfc;
    if (rfc) infoLineas.push(`RFC: ${rfc}`);
    if (ubicacion?.telefono) infoLineas.push(`Tel: ${ubicacion.telefono}`);

    const addrParts = [
      ubicacion?.calle ? `${ubicacion.calle}${ubicacion.num_ext ? ' #' + ubicacion.num_ext : ''}` : null,
      ubicacion?.colonia, ubicacion?.municipio,
      ubicacion?.estado ?? null,
    ].filter(Boolean);
    const direccion = addrParts.join(', ');

    const accentColor = esCotizacion ? '#2563eb' : '#16a34a';
    const badgeLabel = esCotizacion ? 'COTIZACIÓN' : 'COMPROBANTE DE VENTA';

    const lineasHtml = nota.lineas.map((l, idx) => {
      const descs = [l.articulo?.descripcion_1, l.articulo?.descripcion_2,
        (l.articulo as any)?.descripcion_3, (l.articulo as any)?.descripcion_4, (l.articulo as any)?.descripcion_5,
      ].filter(Boolean).join(' · ');
      const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
      return `
        <tr>
          <td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;background:${bg};font-size:12px;color:#475569;">${descs || l.clave}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;background:${bg};text-align:right;font-size:12px;color:#0f172a;">${Number(l.cantidad).toLocaleString('es-MX')}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;background:${bg};text-align:right;font-size:12px;color:#0f172a;">$${fmt(Number(l.precio_unitario))}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;background:${bg};text-align:right;font-size:13px;font-weight:700;color:#0f172a;">$${fmt(Number(l.subtotal))}</td>
        </tr>`;
    }).join('');

    // Totales
    const subtotalRow = `<tr><td colspan="3" style="padding:7px 8px;text-align:right;font-size:12px;color:#64748b;">Subtotal</td><td style="padding:7px 8px;text-align:right;font-size:12px;color:#64748b;">$${fmt(Number(nota.subtotal))}</td></tr>`;
    const descuentoRow = Number(nota.descuento) > 0
      ? `<tr><td colspan="3" style="padding:5px 8px;text-align:right;font-size:12px;color:#dc2626;">Descuento</td><td style="padding:5px 8px;text-align:right;font-size:12px;color:#dc2626;">-$${fmt(Number(nota.descuento))}</td></tr>`
      : '';

    let pagoHtml = '';
    if (!esCotizacion && dto.extra) {
      if (dto.extra.tipo_cierre === 'CREDITO') {
        pagoHtml = `<tr><td colspan="3" style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">A crédito</td><td style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">$${fmt(Number(nota.total))}</td></tr>`;
      } else if (dto.extra.tipo_cierre === 'PENDIENTE') {
        pagoHtml = `<tr><td colspan="3" style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">Pendiente de cobro</td><td style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">$${fmt(Number(nota.total))}</td></tr>`;
      } else {
        pagoHtml = (dto.extra.pagos ?? []).filter((p) => p.monto > 0).map((p) =>
          `<tr><td colspan="3" style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">${p.metodo}</td><td style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">$${fmt(Number(p.monto))}</td></tr>`,
        ).join('');
        if (dto.extra.cambio && dto.extra.cambio > 0) {
          pagoHtml += `<tr><td colspan="3" style="text-align:right;padding:5px 8px;font-size:12px;color:#94a3b8;">Cambio</td><td style="text-align:right;padding:5px 8px;font-size:12px;color:#94a3b8;">$${fmt(Number(dto.extra.cambio))}</td></tr>`;
        }
      }
    }

    const totalRow = `<tr style="background:#0f172a;"><td colspan="3" style="padding:12px 8px;text-align:right;color:#f8fafc;font-weight:700;font-size:14px;letter-spacing:.5px;">TOTAL</td><td style="padding:12px 8px;text-align:right;color:#ffffff;font-weight:900;font-size:18px;">$${fmt(Number(nota.total))}</td></tr>`;

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e2e8f0;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e2e8f0;padding:28px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);">

  <!-- Header empresa -->
  <tr><td style="background:#0f172a;padding:28px 36px;text-align:center;">
    ${logoHtml}
    <p style="margin:0;color:#f1f5f9;font-size:18px;font-weight:800;letter-spacing:1px;">${razonSocial}</p>
    ${ubicacion?.nombre ? `<p style="margin:5px 0 0;color:#94a3b8;font-size:11px;">${ubicacion.nombre}</p>` : ''}
    ${infoLineas.length > 0 ? `<p style="margin:6px 0 0;color:#64748b;font-size:11px;">${infoLineas.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</p>` : ''}
    ${direccion ? `<p style="margin:4px 0 0;color:#64748b;font-size:11px;">${direccion}</p>` : ''}
  </td></tr>

  <!-- Badge folio -->
  <tr><td style="background:${accentColor};padding:11px 36px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${badgeLabel}&nbsp;&nbsp;${folioStr}</td>
        <td style="color:#ffffff;font-size:11px;text-align:right;opacity:.85;">Fecha: ${fechaStr}</td>
      </tr>
    </table>
  </td></tr>

  <!-- Caja cliente -->
  ${nota.cliente ? `
  <tr><td style="padding:16px 36px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-left:3px solid ${accentColor};border-radius:0 4px 4px 0;">
      <tr>
        <td style="padding:10px 14px;">
          <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;">Cliente</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#0f172a;">${clienteNombre}</p>
          ${nota.cliente.email ? `<p style="margin:2px 0 0;font-size:11px;color:#64748b;">${nota.cliente.email}</p>` : ''}
        </td>
        ${esCotizacion ? `<td style="padding:10px 14px;text-align:right;vertical-align:top;">
          <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;">Válida hasta</p>
          <p style="margin:4px 0 0;font-size:12px;font-weight:600;color:${accentColor};">30 días</p>
        </td>` : ''}
      </tr>
    </table>
  </td></tr>` : ''}

  <!-- Tabla de artículos -->
  <tr><td style="padding:18px 36px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#0f172a;">
          <th style="padding:9px 8px;text-align:left;font-size:9px;color:#e2e8f0;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Descripción</th>
          <th style="padding:9px 8px;text-align:right;font-size:9px;color:#e2e8f0;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Cant.</th>
          <th style="padding:9px 8px;text-align:right;font-size:9px;color:#e2e8f0;font-weight:700;letter-spacing:1px;text-transform:uppercase;">P.U.</th>
          <th style="padding:9px 8px;text-align:right;font-size:9px;color:#e2e8f0;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${lineasHtml}</tbody>
      <tfoot style="border-top:2px solid #e2e8f0;">
        ${subtotalRow}
        ${descuentoRow}
        ${pagoHtml}
        ${totalRow}
      </tfoot>
    </table>
  </td></tr>

  <!-- Observaciones -->
  ${nota.observaciones ? `<tr><td style="padding:14px 36px 0;"><div style="background:#fefce8;border-left:3px solid #eab308;padding:10px 14px;border-radius:0 4px 4px 0;font-size:12px;color:#713f12;"><strong>Observaciones:</strong> ${nota.observaciones}</div></td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="padding:20px 36px 26px;text-align:center;border-top:1px solid #e2e8f0;margin-top:16px;">
    ${esCotizacion ? `<p style="margin:0 0 5px;font-size:11px;color:#64748b;">Esta cotización es válida por 30 días a partir de su fecha de emisión.</p>
    <p style="margin:0 0 5px;font-size:11px;color:#94a3b8;">Precios sujetos a cambio sin previo aviso.</p>` : ''}
    <p style="margin:0;font-size:11px;color:#94a3b8;">¡Gracias por su preferencia!</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
  }

  // ─── Corte de caja ────────────────────────────────────────────

  async getCorteCaja(
    ubicacionId: string,
    query: { desde?: string; hasta?: string },
  ) {
    const { desde, hasta } = query;

    const where: Prisma.NotaVentaWhereInput = {
      ubicacion_id: ubicacionId,
      // Las canceladas no son venta ni dinero cobrado: se excluyen por completo
      // del corte (ni lista, ni "por estatus", ni impresión).
      estatus: { in: ['PAGADA', 'CREDITO', 'REABIERTA', 'INCOMPLETA', 'FINALIZADA'] as any[] },
    };
    if (desde || hasta) {
      where.created_at = {
        ...(desde ? { gte: inicioDiaMx(desde) } : {}),
        ...(hasta ? { lte: finDiaMx(hasta) } : {}),
      };
    }

    const whereAnticipos: Prisma.AnticiposPedidoWhereInput = { ubicacion_id: ubicacionId };
    if (desde || hasta) {
      whereAnticipos.created_at = {
        ...(desde ? { gte: inicioDiaMx(desde) } : {}),
        ...(hasta ? { lte: finDiaMx(hasta) } : {}),
      };
    }

    const whereGastos: Prisma.GastoWhereInput = { ubicacion_id: ubicacionId };
    if (desde || hasta) {
      whereGastos.created_at = {
        ...(desde ? { gte: inicioDiaMx(desde) } : {}),
        ...(hasta ? { lte: finDiaMx(hasta) } : {}),
      };
    }

    // Pagos de crédito: abonos cobrados en el rango sobre notas creadas ANTES del rango
    // (ver ClientesService.abonarCuenta, que crea estos Pago sobre la nota original).
    const wherePagosCredito: Prisma.PagoWhereInput = {
      nota: {
        ubicacion_id: ubicacionId,
        ...(desde ? { created_at: { lt: inicioDiaMx(desde) } } : {}),
      },
    };
    if (desde || hasta) {
      wherePagosCredito.created_at = {
        ...(desde ? { gte: inicioDiaMx(desde) } : {}),
        ...(hasta ? { lte: finDiaMx(hasta) } : {}),
      };
    }

    // Igual que wherePagosCredito, pero sobre MovimientoCuenta (tipo ABONO) en vez
    // de Pago — necesario porque Pago no tiene usuario_id y no sabemos quién cobró
    // el abono. Se usa solo para armar el desglose por vendedor de "pagos_credito"
    // (Metálicos Lyeva); los montos/método de pagos_credito siguen viniendo de Pago.
    const whereMovimientosAbono: Prisma.MovimientoCuentaWhereInput = {
      tipo: 'ABONO',
      nota: {
        ubicacion_id: ubicacionId,
        ...(desde ? { created_at: { lt: inicioDiaMx(desde) } } : {}),
      },
    };
    if (desde || hasta) {
      whereMovimientosAbono.created_at = {
        ...(desde ? { gte: inicioDiaMx(desde) } : {}),
        ...(hasta ? { lte: finDiaMx(hasta) } : {}),
      };
    }

    const [notas, anticiposPedido, gastos, pagosCredito, movimientosAbono] = await Promise.all([
      this.prisma.notaVenta.findMany({
        where,
        orderBy: { created_at: 'asc' },
        include: {
          cliente: { select: { id: true, nombre: true, apellidos: true, razon_social: true } },
          usuario: { select: { id: true, nombre: true, apellidos: true } },
          pagos: true,
        },
      }),
      this.prisma.anticiposPedido.findMany({
        where: whereAnticipos,
        orderBy: { created_at: 'asc' },
        include: {
          pedido: {
            select: {
              folio: true,
              cliente: { select: { nombre: true, apellidos: true, razon_social: true } },
            },
          },
        },
      }),
      this.prisma.gasto.findMany({
        where: whereGastos,
        orderBy: { created_at: 'asc' },
        include: { usuario: { select: { nombre: true, apellidos: true } } },
      }),
      this.prisma.pago.findMany({
        where: wherePagosCredito,
        orderBy: { created_at: 'asc' },
        include: { nota: { select: { folio: true } } },
      }),
      this.prisma.movimientoCuenta.findMany({
        where: whereMovimientosAbono,
        orderBy: { created_at: 'asc' },
        include: {
          nota: { select: { folio: true } },
          usuario: { select: { id: true, nombre: true, apellidos: true } },
        },
      }),
    ]);

    const metodos: Record<string, { count: number; total: number }> = {
      EFECTIVO:     { count: 0, total: 0 },
      TARJETA:      { count: 0, total: 0 },
      TRANSFERENCIA:{ count: 0, total: 0 },
      DEPOSITO:     { count: 0, total: 0 },
    };

    const porEstatus: Record<string, { count: number; total: number }> = {};
    let totalCobrado = 0;
    let totalVentas = 0;

    for (const nota of notas) {
      const est = nota.estatus as string;
      if (!porEstatus[est]) porEstatus[est] = { count: 0, total: 0 };
      porEstatus[est].count++;
      porEstatus[est].total = +(porEstatus[est].total + Number(nota.total)).toFixed(2);

      const notaTotal = Number(nota.total);
      totalVentas = +(totalVentas + notaTotal).toFixed(2);

      // Los pagos que solo replican un anticipo de pedido (ver PedidosService.liquidar)
      // ya se contaron en el corte de caja del día en que se cobró ese anticipo — se
      // excluyen aquí para no duplicarlos, y se resta su monto del total base de hoy
      // para que "efectivo real" (base de hoy − no-efectivo) siga siendo correcto.
      const pagosHoy = nota.pagos.filter((p) => !p.origen_anticipo_pedido);
      const montoAnticipoReplicado = nota.pagos
        .filter((p) => p.origen_anticipo_pedido)
        .reduce((s, p) => s + Number(p.monto), 0);
      const baseHoy = Math.max(0, +(notaTotal - montoAnticipoReplicado).toFixed(2));

      let nonCashSum = 0;
      for (const pago of pagosHoy) {
        if (pago.metodo === 'EFECTIVO') continue;
        const m = pago.metodo as string;
        const monto = Number(pago.monto);
        if (!metodos[m]) metodos[m] = { count: 0, total: 0 };
        metodos[m].count++;
        metodos[m].total = +(metodos[m].total + monto).toFixed(2);
        nonCashSum = +(nonCashSum + monto).toFixed(2);
      }

      const hasEfectivo = pagosHoy.some((p) => p.metodo === 'EFECTIVO');
      const efectivoReal = hasEfectivo ? Math.max(0, +(baseHoy - nonCashSum).toFixed(2)) : 0;

      if (hasEfectivo) {
        metodos['EFECTIVO'].count++;
        metodos['EFECTIVO'].total = +(metodos['EFECTIVO'].total + efectivoReal).toFixed(2);
      }

      totalCobrado = +(totalCobrado + nonCashSum + efectivoReal).toFixed(2);
    }

    const metodoAnticipos: Record<string, { count: number; total: number }> = {
      EFECTIVO:     { count: 0, total: 0 },
      TARJETA:      { count: 0, total: 0 },
      TRANSFERENCIA:{ count: 0, total: 0 },
      DEPOSITO:     { count: 0, total: 0 },
    };
    let totalAnticipos = 0;

    for (const ant of anticiposPedido) {
      const m = ant.metodo as string;
      const monto = Number(ant.monto);
      if (!metodoAnticipos[m]) metodoAnticipos[m] = { count: 0, total: 0 };
      metodoAnticipos[m].count++;
      metodoAnticipos[m].total = +(metodoAnticipos[m].total + monto).toFixed(2);
      totalAnticipos = +(totalAnticipos + monto).toFixed(2);
    }

    // por_metodo queda como cobro bruto de ventas del día (sin gastos ni créditos mezclados).
    let totalGastos = 0;
    let totalGastosEfectivo = 0;
    for (const g of gastos) {
      const monto = Number(g.monto);
      totalGastos = +(totalGastos + monto).toFixed(2);
      if (g.metodo_pago === 'EFECTIVO') {
        totalGastosEfectivo = +(totalGastosEfectivo + monto).toFixed(2);
      }
    }
    const totalNeto = +(totalCobrado - totalGastos).toFixed(2);

    const metodoPagosCredito: Record<string, { count: number; total: number }> = {
      EFECTIVO:     { count: 0, total: 0 },
      TARJETA:      { count: 0, total: 0 },
      TRANSFERENCIA:{ count: 0, total: 0 },
      DEPOSITO:     { count: 0, total: 0 },
    };
    let totalPagosCredito = 0;
    for (const pago of pagosCredito) {
      const m = pago.metodo as string;
      const monto = Number(pago.monto);
      if (!metodoPagosCredito[m]) metodoPagosCredito[m] = { count: 0, total: 0 };
      metodoPagosCredito[m].count++;
      metodoPagosCredito[m].total = +(metodoPagosCredito[m].total + monto).toFixed(2);
      totalPagosCredito = +(totalPagosCredito + monto).toFixed(2);
    }

    // Agrupado por usuario (vendedor) de los pagos de crédito — igual que
    // por_usuario en notas, solo lo usa Metálicos Lyeva; el resto lo ignora.
    const pagosCreditoPorUsuarioMap = new Map<string, { usuario_id: string; nombre: string; total: number; detalle: { folio: number; monto: number; fecha: Date }[] }>();
    for (const mov of movimientosAbono) {
      const usuarioId = mov.usuario?.id ?? 'sin-usuario';
      const nombre = mov.usuario ? `${mov.usuario.nombre} ${mov.usuario.apellidos ?? ''}`.trim() : 'Sin usuario';
      if (!pagosCreditoPorUsuarioMap.has(usuarioId)) {
        pagosCreditoPorUsuarioMap.set(usuarioId, { usuario_id: usuarioId, nombre, total: 0, detalle: [] });
      }
      const grupo = pagosCreditoPorUsuarioMap.get(usuarioId)!;
      const monto = Number(mov.monto);
      grupo.total = +(grupo.total + monto).toFixed(2);
      grupo.detalle.push({ folio: mov.nota?.folio ?? 0, monto, fecha: mov.created_at });
    }
    const pagosCreditoPorUsuario = Array.from(pagosCreditoPorUsuarioMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

    // El efectivo de anticipos de pedido es dinero real que hay que entregar hoy,
    // aunque no venga de una nota — se suma igual que el efectivo de pagos de crédito.
    const totalEntregarEfectivo = +(
      metodos['EFECTIVO'].total +
      metodoPagosCredito['EFECTIVO'].total +
      metodoAnticipos['EFECTIVO'].total -
      totalGastosEfectivo
    ).toFixed(2);

    const notasMapeadas = notas.map((n) => {
      const notaTotal = Number(n.total);
      // Igual que arriba: los pagos que solo replican un anticipo de pedido ya se
      // reportaron en el corte del día del anticipo — no se listan hoy de nuevo.
      const pagosHoy = n.pagos.filter((p) => !p.origen_anticipo_pedido);
      const montoAnticipoReplicado = n.pagos
        .filter((p) => p.origen_anticipo_pedido)
        .reduce((s, p) => s + Number(p.monto), 0);
      const baseHoy = Math.max(0, +(notaTotal - montoAnticipoReplicado).toFixed(2));

      const nonCash = pagosHoy
        .filter((p) => p.metodo !== 'EFECTIVO')
        .reduce((s, p) => s + Number(p.monto), 0);
      const sumTodos = pagosHoy.reduce((s, p) => s + Number(p.monto), 0);
      const cambio = Math.max(0, +(sumTodos - baseHoy).toFixed(2));
      const efectivoReal = Math.max(0, +(baseHoy - nonCash).toFixed(2));

      return {
        id: n.id,
        folio: n.folio,
        estatus: n.estatus,
        total: notaTotal,
        cambio,
        created_at: n.created_at,
        cliente: n.cliente
          ? { nombre: [n.cliente.nombre, n.cliente.apellidos].filter(Boolean).join(' ') || n.cliente.razon_social || 'MOSTRADOR' }
          : { nombre: 'MOSTRADOR' },
        pagos: pagosHoy.map((p) => ({
          metodo: p.metodo,
          monto: p.metodo === 'EFECTIVO' ? efectivoReal : Number(p.monto),
        })),
      };
    });

    // Agrupado por usuario (vendedor) — lo usa Metálicos Lyeva para su corte de
    // caja personalizado (front + ticket impreso); las demás empresas ignoran
    // este campo. Se calcula siempre porque es barato (no hace queries extra) y
    // este método no conoce la empresa, solo la ubicación.
    const porUsuarioMap = new Map<string, { usuario_id: string; nombre: string; notas: typeof notasMapeadas; total_efectivo: number }>();
    notas.forEach((n, i) => {
      const usuarioId = n.usuario?.id ?? 'sin-usuario';
      const nombre = n.usuario ? `${n.usuario.nombre} ${n.usuario.apellidos ?? ''}`.trim() : 'Sin usuario';
      if (!porUsuarioMap.has(usuarioId)) {
        porUsuarioMap.set(usuarioId, { usuario_id: usuarioId, nombre, notas: [], total_efectivo: 0 });
      }
      const grupo = porUsuarioMap.get(usuarioId)!;
      grupo.notas.push(notasMapeadas[i]);
      const efectivoNota = notasMapeadas[i].pagos.find((p) => p.metodo === 'EFECTIVO')?.monto ?? 0;
      grupo.total_efectivo = +(grupo.total_efectivo + efectivoNota).toFixed(2);
    });
    const porUsuario = Array.from(porUsuarioMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

    return {
      desde: desde ?? null,
      hasta: hasta ?? null,
      ubicacion_id: ubicacionId,
      total_ventas: totalVentas,
      total_cobrado: totalCobrado,
      total_gastos: totalGastos,
      total_gastos_efectivo: totalGastosEfectivo,
      total_neto: totalNeto,
      total_entregar_efectivo: totalEntregarEfectivo,
      por_metodo: metodos,
      por_estatus: porEstatus,
      pagos_credito: {
        total: totalPagosCredito,
        count: pagosCredito.length,
        por_metodo: metodoPagosCredito,
        detalle: pagosCredito.map((p) => ({
          folio: p.nota.folio,
          metodo: p.metodo,
          monto: Number(p.monto),
          fecha: p.created_at,
        })),
        por_usuario: pagosCreditoPorUsuario,
      },
      gastos: gastos.map((g) => ({
        id: g.id,
        concepto: g.concepto,
        categoria: g.categoria,
        monto: Number(g.monto),
        metodo_pago: g.metodo_pago,
        usuario: [g.usuario.nombre, g.usuario.apellidos].filter(Boolean).join(' '),
        created_at: g.created_at,
      })),
      anticipos_pedido: {
        total: totalAnticipos,
        count: anticiposPedido.length,
        por_metodo: metodoAnticipos,
        detalle: anticiposPedido.map((a) => ({
          pedido_folio: a.pedido.folio,
          cliente: a.pedido.cliente
            ? (a.pedido.cliente.razon_social ?? `${a.pedido.cliente.nombre}${a.pedido.cliente.apellidos ? ' ' + a.pedido.cliente.apellidos : ''}`)
            : 'Sin cliente',
          metodo: a.metodo,
          monto: Number(a.monto),
          referencia: a.referencia,
          fecha: a.created_at,
        })),
      },
      notas: notasMapeadas,
      por_usuario: porUsuario,
    };
  }
}
