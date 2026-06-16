import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePedidoDto, AddLineaPedidoDto, UpdateLineaPedidoDto,
  RegistrarAnticipoDto, LiquidarPedidoDto, AgregarEvidenciaPedidoDto,
} from './dto/pedidos.dto';
import type { Prisma } from '@grupometalicoemf/database';

const PEDIDO_INCLUDE = {
  cliente: {
    select: { id: true, nombre: true, apellidos: true, razon_social: true, email: true, telefono: true },
  },
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
  anticipos: {
    orderBy: { created_at: 'asc' as const },
    include: { usuario: { select: { id: true, nombre: true, apellidos: true } } },
  },
  evidencias: {
    orderBy: { created_at: 'asc' as const },
    include: { subido_por: { select: { id: true, nombre: true, apellidos: true } } },
  },
} satisfies Prisma.PedidoInclude;

type PedidoRaw = Prisma.PedidoGetPayload<{ include: typeof PEDIDO_INCLUDE }>;

@Injectable()
export class PedidosService {
  constructor(private prisma: PrismaService) {}

  // ─── Listar ───────────────────────────────────────────────────

  async findAll(empresaId: string, query: {
    estatus?: string; page?: number; limit?: number;
    ubicacionId?: string; q?: string; desde?: string;
  } = {}) {
    const { estatus, page = 1, limit = 50, ubicacionId, q, desde } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PedidoWhereInput = { empresa_id: empresaId };
    if (estatus) where.estatus = estatus as any;
    if (ubicacionId) where.ubicacion_id = ubicacionId;
    if (desde) where.created_at = { gte: new Date(desde) };
    if (q) {
      const folioNum = parseInt(q, 10);
      where.OR = [
        ...(isNaN(folioNum) ? [] : [{ folio: folioNum }]),
        { cliente: { nombre: { contains: q, mode: 'insensitive' as const } } },
        { cliente: { razon_social: { contains: q, mode: 'insensitive' as const } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.pedido.count({ where }),
      this.prisma.pedido.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: PEDIDO_INCLUDE,
      }),
    ]);

    return {
      data: data.map((p) => this.serializePedido(p)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, empresaId: string) {
    const pedido = await this.findOneRaw(id, empresaId);
    return this.serializePedido(pedido);
  }

  // ─── Crear pedido ─────────────────────────────────────────────

  async create(dto: CreatePedidoDto, empresaId: string, ubicacionId: string, usuarioId: string) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: dto.cliente_id, empresa_id: empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const folio = await this.nextFolio(empresaId);

    const pedido = await this.prisma.$transaction(async (tx) => {
      const p = await tx.pedido.create({
        data: {
          folio,
          empresa_id: empresaId,
          ubicacion_id: ubicacionId,
          usuario_id: usuarioId,
          cliente_id: dto.cliente_id,
          observaciones: dto.observaciones ?? null,
          subtotal: 0,
          total: 0,
        },
      });

      if (dto.lineas && dto.lineas.length > 0) {
        for (const l of dto.lineas) {
          const art = await tx.articulo.findFirst({
            where: { id: l.articulo_id, empresa_id: empresaId },
          });
          if (!art) throw new NotFoundException(`Artículo ${l.articulo_id} no encontrado`);

          const subtotal = this.calcSubtotal(l.cantidad, l.precio_unitario, l.descuento ?? 0);
          await tx.pedidoLinea.create({
            data: {
              pedido_id: p.id,
              articulo_id: art.id,
              clave: art.clave,
              descripcion: [art.descripcion_1, art.descripcion_2, art.descripcion_3].filter(Boolean).join(' ') || null,
              cantidad: l.cantidad,
              precio_unitario: l.precio_unitario,
              descuento: l.descuento ?? 0,
              subtotal,
            },
          });
        }
        await this.recalcPedido(tx, p.id);
      }

      return tx.pedido.findFirstOrThrow({ where: { id: p.id }, include: PEDIDO_INCLUDE });
    });

    return this.serializePedido(pedido);
  }

  // ─── Líneas ───────────────────────────────────────────────────

  async addLinea(pedidoId: string, dto: AddLineaPedidoDto, empresaId: string) {
    const pedido = await this.findOneRaw(pedidoId, empresaId);
    if (pedido.estatus !== 'ABIERTO' && pedido.estatus !== 'PARCIAL') {
      throw new ForbiddenException('Solo se pueden agregar líneas a pedidos ABIERTO o PARCIAL');
    }

    const art = await this.prisma.articulo.findFirst({
      where: { id: dto.articulo_id, empresa_id: empresaId },
    });
    if (!art) throw new NotFoundException('Artículo no encontrado');
    if (!art.activo) throw new BadRequestException('El artículo está inactivo');

    const subtotal = this.calcSubtotal(dto.cantidad, dto.precio_unitario, dto.descuento ?? 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.pedidoLinea.create({
        data: {
          pedido_id: pedidoId,
          articulo_id: art.id,
          clave: art.clave,
          descripcion: [art.descripcion_1, art.descripcion_2, art.descripcion_3].filter(Boolean).join(' ') || null,
          cantidad: dto.cantidad,
          precio_unitario: dto.precio_unitario,
          descuento: dto.descuento ?? 0,
          subtotal,
        },
      });
      await this.recalcPedido(tx, pedidoId);
    });

    return this.findOne(pedidoId, empresaId);
  }

  async updateLinea(pedidoId: string, lineaId: string, dto: UpdateLineaPedidoDto, empresaId: string) {
    const pedido = await this.findOneRaw(pedidoId, empresaId);
    if (pedido.estatus !== 'ABIERTO' && pedido.estatus !== 'PARCIAL') {
      throw new ForbiddenException('Solo se pueden editar líneas de pedidos ABIERTO o PARCIAL');
    }

    const linea = await this.prisma.pedidoLinea.findFirst({
      where: { id: lineaId, pedido_id: pedidoId },
    });
    if (!linea) throw new NotFoundException('Línea no encontrada');

    const cantidad = dto.cantidad ?? Number(linea.cantidad);
    const precio = dto.precio_unitario ?? Number(linea.precio_unitario);
    const descuento = dto.descuento ?? Number(linea.descuento);
    const subtotal = this.calcSubtotal(cantidad, precio, descuento);

    await this.prisma.$transaction(async (tx) => {
      await tx.pedidoLinea.update({
        where: { id: lineaId },
        data: { cantidad, precio_unitario: precio, descuento, subtotal },
      });
      await this.recalcPedido(tx, pedidoId);
    });

    return this.findOne(pedidoId, empresaId);
  }

  async removeLinea(pedidoId: string, lineaId: string, empresaId: string) {
    const pedido = await this.findOneRaw(pedidoId, empresaId);
    if (pedido.estatus !== 'ABIERTO' && pedido.estatus !== 'PARCIAL') {
      throw new ForbiddenException('Solo se pueden eliminar líneas de pedidos ABIERTO o PARCIAL');
    }

    const linea = await this.prisma.pedidoLinea.findFirst({
      where: { id: lineaId, pedido_id: pedidoId },
    });
    if (!linea) throw new NotFoundException('Línea no encontrada');

    await this.prisma.$transaction(async (tx) => {
      await tx.pedidoLinea.delete({ where: { id: lineaId } });
      await this.recalcPedido(tx, pedidoId);
    });

    return this.findOne(pedidoId, empresaId);
  }

  // ─── Anticipos ────────────────────────────────────────────────

  async registrarAnticipo(
    pedidoId: string,
    dto: RegistrarAnticipoDto,
    empresaId: string,
    ubicacionId: string,
    usuarioId: string,
  ) {
    const pedido = await this.findOneRaw(pedidoId, empresaId);

    if (pedido.estatus !== 'ABIERTO' && pedido.estatus !== 'PARCIAL') {
      throw new ForbiddenException('Solo se pueden registrar anticipos en pedidos ABIERTO o PARCIAL');
    }
    if (pedido.lineas.length === 0) {
      throw new BadRequestException('El pedido no tiene líneas');
    }

    const montoAnticipo = dto.pagos.reduce((s, p) => s + p.monto, 0);
    const anticiposAnteriores = Number(pedido.total_anticipos);
    const totalPedido = Number(pedido.total);
    const saldoActual = +(totalPedido - anticiposAnteriores).toFixed(2);

    if (montoAnticipo > saldoActual + 0.01) {
      throw new BadRequestException(
        `El anticipo ($${montoAnticipo.toFixed(2)}) excede el saldo pendiente ($${saldoActual.toFixed(2)})`,
      );
    }

    const nuevoTotalAnticipos = +(anticiposAnteriores + montoAnticipo).toFixed(2);
    const nuevoSaldo = +(totalPedido - nuevoTotalAnticipos).toFixed(2);
    const nuevoEstatus = nuevoSaldo <= 0.01 ? 'LIQUIDADO' : 'PARCIAL';

    const result = await this.prisma.$transaction(async (tx) => {
      for (const p of dto.pagos) {
        await tx.anticiposPedido.create({
          data: {
            pedido_id: pedidoId,
            empresa_id: empresaId,
            ubicacion_id: ubicacionId,
            usuario_id: usuarioId,
            metodo: p.metodo,
            monto: p.monto,
            referencia: p.referencia ?? null,
          },
        });
      }

      return tx.pedido.update({
        where: { id: pedidoId },
        data: {
          total_anticipos: nuevoTotalAnticipos,
          estatus: nuevoEstatus,
          ...(nuevoEstatus === 'LIQUIDADO' ? { cerrado_at: new Date() } : {}),
        },
        include: PEDIDO_INCLUDE,
      });
    });

    const serialized = this.serializePedido(result);

    // Payload para ticket de anticipo (enviado al print-bridge por el frontend)
    const ticketPayload = {
      tipo: 'anticipo_pedido',
      pedido: {
        folio: pedido.folio,
        fecha: new Date().toISOString(),
        cliente_nombre: pedido.cliente
          ? (pedido.cliente.razon_social ?? `${pedido.cliente.nombre}${pedido.cliente.apellidos ? ' ' + pedido.cliente.apellidos : ''}`)
          : 'Cliente',
      },
      lineas: pedido.lineas.map((l) => ({
        cantidad: Number(l.cantidad),
        descripcion: l.descripcion || l.clave,
        precio: Number(l.precio_unitario),
        subtotal: Number(l.subtotal),
      })),
      totales: {
        total_pedido: totalPedido,
        anticipos_anteriores: anticiposAnteriores,
        este_anticipo: montoAnticipo,
        total_pagado: nuevoTotalAnticipos,
        saldo_pendiente: Math.max(0, nuevoSaldo),
      },
      metodos_pago: dto.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
    };

    return { pedido: serialized, ticket: ticketPayload };
  }

  // ─── Liquidar pedido → crea NotaVenta ────────────────────────

  async liquidar(
    pedidoId: string,
    dto: LiquidarPedidoDto,
    empresaId: string,
    ubicacionId: string,
    usuarioId: string,
  ) {
    const pedido = await this.findOneRaw(pedidoId, empresaId);

    if (pedido.estatus === 'LIQUIDADO') {
      throw new BadRequestException('El pedido ya está liquidado');
    }
    if (pedido.estatus === 'CANCELADO') {
      throw new ForbiddenException('El pedido está cancelado');
    }
    if (pedido.lineas.length === 0) {
      throw new BadRequestException('El pedido no tiene líneas');
    }

    const pagosFinal = dto.pagos ?? [];
    const montoAdicional = pagosFinal.reduce((s, p) => s + p.monto, 0);
    const anticiposActuales = Number(pedido.total_anticipos);
    const totalPedido = Number(pedido.total);
    const saldoRestante = +(totalPedido - anticiposActuales).toFixed(2);

    if (saldoRestante > 0.01 && montoAdicional < saldoRestante - 0.01) {
      throw new BadRequestException(
        `Saldo pendiente $${saldoRestante.toFixed(2)}. Proporciona pagos suficientes para liquidar.`,
      );
    }

    const nuevoTotalAnticipos = +(anticiposActuales + montoAdicional).toFixed(2);

    // Obtener folio de notaVenta para esta empresa
    const ultimaNotaFolio = await this.prisma.notaVenta.findFirst({
      where: { empresa_id: empresaId },
      orderBy: { folio: 'desc' },
      select: { folio: true },
    });
    const folioNota = (ultimaNotaFolio?.folio ?? 0) + 1;

    const result = await this.prisma.$transaction(async (tx) => {
      // Crear NotaVenta en estatus PAGADA
      const nota = await tx.notaVenta.create({
        data: {
          folio: folioNota,
          empresa_id: empresaId,
          ubicacion_id: ubicacionId,
          usuario_id: usuarioId,
          cliente_id: pedido.cliente_id,
          estatus: 'PAGADA',
          subtotal: pedido.subtotal,
          total: pedido.total,
          observaciones: pedido.observaciones ?? null,
          cerrada_at: new Date(),
        },
      });

      // Copiar líneas del pedido a la nota de venta
      for (const l of pedido.lineas) {
        await tx.notaVentaLinea.create({
          data: {
            nota_id: nota.id,
            articulo_id: l.articulo_id,
            clave: l.clave,
            cantidad: l.cantidad,
            precio_unitario: l.precio_unitario,
            descuento: l.descuento,
            subtotal: l.subtotal,
          },
        });
      }

      // Crear registros de Pago por cada anticipo
      for (const ant of pedido.anticipos) {
        await tx.pago.create({
          data: {
            nota_id: nota.id,
            metodo: ant.metodo,
            monto: ant.monto,
            referencia: ant.referencia ?? null,
          },
        });
      }

      // Crear Pagos por pagos adicionales al liquidar
      for (const p of pagosFinal) {
        await tx.pago.create({
          data: { nota_id: nota.id, metodo: p.metodo, monto: p.monto, referencia: p.referencia ?? null },
        });
      }

      // Marcar pedido como LIQUIDADO
      await tx.pedido.update({
        where: { id: pedidoId },
        data: {
          estatus: 'LIQUIDADO',
          nota_venta_id: nota.id,
          total_anticipos: nuevoTotalAnticipos,
          cerrado_at: new Date(),
          ...(montoAdicional > 0 ? {} : {}),
        },
      });

      // Registrar anticipos adicionales si los hay
      if (pagosFinal.length > 0) {
        for (const p of pagosFinal) {
          await tx.anticiposPedido.create({
            data: {
              pedido_id: pedidoId,
              empresa_id: empresaId,
              ubicacion_id: ubicacionId,
              usuario_id: usuarioId,
              metodo: p.metodo,
              monto: p.monto,
              referencia: p.referencia ?? null,
            },
          });
        }
      }

      return nota;
    });

    // Construir payload para ticket de venta con historial de anticipos
    const todosAnticipos = [
      ...pedido.anticipos.map((a) => ({
        fecha: a.created_at.toISOString(),
        metodo: a.metodo,
        monto: Number(a.monto),
      })),
      ...pagosFinal.map((p) => ({
        fecha: new Date().toISOString(),
        metodo: p.metodo,
        monto: p.monto,
      })),
    ];

    const ticketPayload = {
      tipo: 'venta',
      nota: {
        folio: result.folio,
        fecha: result.created_at.toISOString(),
        cliente: pedido.cliente
          ? (pedido.cliente.razon_social ?? `${pedido.cliente.nombre}${pedido.cliente.apellidos ? ' ' + pedido.cliente.apellidos : ''}`)
          : 'Público General',
      },
      lineas: pedido.lineas.map((l) => ({
        cantidad: Number(l.cantidad),
        descripcion: l.descripcion || l.clave,
        clave: l.clave,
        precio: Number(l.precio_unitario),
        subtotal: Number(l.subtotal),
      })),
      totales: {
        subtotal: Number(pedido.subtotal),
        descuento: Number(pedido.descuento),
        total: Number(pedido.total),
      },
      tipo_cierre: 'PAGADA',
      historial_anticipos: todosAnticipos,
    };

    return {
      nota_venta_id: result.id,
      nota_folio: result.folio,
      ticket: ticketPayload,
    };
  }

  // ─── Cancelar ─────────────────────────────────────────────────

  async cancelar(pedidoId: string, empresaId: string) {
    const pedido = await this.findOneRaw(pedidoId, empresaId);

    if (pedido.estatus === 'LIQUIDADO') {
      throw new ForbiddenException('No se puede cancelar un pedido ya liquidado');
    }
    if (pedido.estatus === 'CANCELADO') {
      throw new BadRequestException('El pedido ya está cancelado');
    }
    if (pedido.anticipos.length > 0) {
      throw new ForbiddenException(
        'El pedido tiene anticipos registrados. Contacta al administrador para cancelarlo.',
      );
    }

    const result = await this.prisma.pedido.update({
      where: { id: pedidoId },
      data: { estatus: 'CANCELADO' },
      include: PEDIDO_INCLUDE,
    });

    return this.serializePedido(result);
  }

  // ─── Evidencias ───────────────────────────────────────────────

  async agregarEvidencia(pedidoId: string, dto: AgregarEvidenciaPedidoDto, empresaId: string, usuarioId: string) {
    const pedido = await this.findOneRaw(pedidoId, empresaId);

    if (pedido.estatus === 'CANCELADO') {
      throw new ForbiddenException('No se pueden agregar evidencias a pedidos cancelados');
    }

    const dataJson = dto.data_base64 ? { base64: dto.data_base64 } : undefined;

    await this.prisma.evidenciaPedido.create({
      data: {
        pedido_id: pedidoId,
        empresa_id: empresaId,
        tipo: 'COMPROBANTE_PAGO',
        descripcion: dto.descripcion ?? null,
        archivo_url: dto.archivo_url ?? null,
        data_json: dataJson,
        subido_por_id: usuarioId,
      },
    });

    return this.findOne(pedidoId, empresaId);
  }

  // ─── Privados ─────────────────────────────────────────────────

  private async findOneRaw(id: string, empresaId: string): Promise<PedidoRaw> {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id, empresa_id: empresaId },
      include: PEDIDO_INCLUDE,
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return pedido;
  }

  private calcSubtotal(cantidad: number, precio: number, descuento: number): number {
    return cantidad * precio * (1 - descuento / 100);
  }

  private async nextFolio(empresaId: string): Promise<number> {
    const last = await this.prisma.pedido.findFirst({
      where: { empresa_id: empresaId },
      orderBy: { folio: 'desc' },
      select: { folio: true },
    });
    return (last?.folio ?? 0) + 1;
  }

  private async recalcPedido(tx: Prisma.TransactionClient, pedidoId: string) {
    const lineas = await tx.pedidoLinea.findMany({ where: { pedido_id: pedidoId } });
    const subtotal = lineas.reduce((s, l) => s + Number(l.subtotal), 0);
    await tx.pedido.update({
      where: { id: pedidoId },
      data: { subtotal, total: subtotal },
    });
  }

  private serializePedido(pedido: PedidoRaw) {
    return {
      ...pedido,
      subtotal: Number(pedido.subtotal),
      descuento: Number(pedido.descuento),
      total: Number(pedido.total),
      total_anticipos: Number(pedido.total_anticipos),
      saldo_pendiente: +(Number(pedido.total) - Number(pedido.total_anticipos)).toFixed(2),
      lineas: pedido.lineas.map((l) => ({
        ...l,
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario),
        descuento: Number(l.descuento),
        subtotal: Number(l.subtotal),
      })),
      anticipos: pedido.anticipos.map((a) => ({
        ...a,
        monto: Number(a.monto),
      })),
      evidencias: pedido.evidencias.map((ev) => ({
        ...ev,
        data_json: ev.data_json as { base64?: string } | null,
      })),
    };
  }
}
