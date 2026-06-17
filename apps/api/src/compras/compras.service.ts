import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOrdenCompraDto, RecibirOrdenCompraDto,
  AbonoProveedorDto, AjusteCuentaProveedorDto,
} from './dto/compras.dto';
import type { EstatusOrdenCompra, OrdenCompra, OrdenCompraLinea } from '@grupometalicoemf/database';

@Injectable()
export class ComprasService {
  constructor(private prisma: PrismaService) {}

  // ── Utilidades ─────────────────────────────────────────────

  private serializeDecimal(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && typeof v === 'object' && typeof (v as { toNumber?: unknown }).toNumber === 'function') {
        result[k] = Number(v);
      } else if (Array.isArray(v)) {
        result[k] = v.map(i =>
          typeof i === 'object' && i !== null ? this.serializeDecimal(i as Record<string, unknown>) : i,
        );
      } else if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
        result[k] = this.serializeDecimal(v as Record<string, unknown>);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  private ser<T>(obj: T): T {
    return this.serializeDecimal(obj as Record<string, unknown>) as T;
  }

  // ── Órdenes de Compra ───────────────────────────────────────

  async listarOrdenes(ubicacionId: string, query: {
    estatus?: string; proveedorId?: string; page?: number; limit?: number;
  }) {
    const page  = Math.max(1, query.page  ?? 1);
    const limit = Math.min(100, query.limit ?? 50);
    const skip  = (page - 1) * limit;

    const where = {
      ubicacion_id: ubicacionId,
      ...(query.estatus    ? { estatus: query.estatus as EstatusOrdenCompra } : {}),
      ...(query.proveedorId ? { proveedor_id: query.proveedorId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.ordenCompra.findMany({
        where,
        include: {
          proveedor: { select: { id: true, nombre: true } },
          usuario:   { select: { id: true, nombre: true, apellidos: true } },
          lineas:    { select: { id: true, clave: true, cantidad_solicitada: true, cantidad_recibida: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.ordenCompra.count({ where }),
    ]);

    return {
      data:  data.map(o => this.ser(o)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getOrden(id: string, ubicacionId: string) {
    const orden = await this.prisma.ordenCompra.findFirst({
      where: { id, ubicacion_id: ubicacionId },
      include: {
        proveedor: { select: { id: true, nombre: true, razon_social: true, rfc: true } },
        usuario:   { select: { id: true, nombre: true, apellidos: true } },
        lineas: {
          include: { articulo: { select: { id: true, clave: true, descripcion_1: true, descripcion_2: true } } },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!orden) throw new NotFoundException('Orden de compra no encontrada');
    return this.ser(orden);
  }

  async crearOrden(dto: CreateOrdenCompraDto, ubicacionId: string, usuarioId: string) {
    if (!dto.lineas || dto.lineas.length === 0) {
      throw new BadRequestException('La orden debe tener al menos una línea');
    }

    const articuloIds = dto.lineas.map(l => l.articulo_id);
    const articulos = await this.prisma.articulo.findMany({
      where: { id: { in: articuloIds }, ubicacion_id: ubicacionId },
      select: { id: true, clave: true, descripcion_1: true, descripcion_2: true },
    });
    if (articulos.length !== articuloIds.length) {
      throw new BadRequestException('Uno o más artículos no pertenecen a la ubicación');
    }

    const artMap = new Map(articulos.map(a => [a.id, a]));

    const lineas = dto.lineas.map(l => {
      const art = artMap.get(l.articulo_id)!;
      const subtotal = l.cantidad_solicitada * l.precio_unitario;
      return {
        articulo_id:         l.articulo_id,
        clave:               art.clave,
        cantidad_solicitada: l.cantidad_solicitada,
        precio_unitario:     l.precio_unitario,
        subtotal,
        existencia_num:      l.existencia_num,
      };
    });

    const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);

    const orden = await this.prisma.$transaction(async (tx) => {
      const last = await tx.ordenCompra.findFirst({
        where: { ubicacion_id: ubicacionId },
        orderBy: { folio: 'desc' },
        select: { folio: true },
      });
      const folio = (last?.folio ?? 0) + 1;

      return tx.ordenCompra.create({
        data: {
          folio,
          ubicacion_id: ubicacionId,
          proveedor_id: dto.proveedor_id,
          subtotal,
          total:        subtotal,
          observaciones: dto.observaciones,
          usuario_id:   usuarioId,
          lineas: { create: lineas },
        },
        include: {
          lineas:    true,
          proveedor: { select: { id: true, nombre: true } },
          usuario:   { select: { id: true, nombre: true, apellidos: true } },
        },
      });
    });

    return this.ser(orden);
  }

  async aprobarOrden(id: string, ubicacionId: string, usuarioId: string) {
    const orden = await this.getOrdenRaw(id, ubicacionId);
    if (orden.estatus !== 'BORRADOR') {
      throw new BadRequestException('Solo se puede aprobar una OC en estado BORRADOR');
    }
    const updated = await this.prisma.ordenCompra.update({
      where: { id },
      data: { estatus: 'APROBADA', aprobada_at: new Date() },
      include: { lineas: true, proveedor: { select: { id: true, nombre: true } } },
    });
    return this.ser(updated);
  }

  async recibirOrden(id: string, dto: RecibirOrdenCompraDto, ubicacionId: string, usuarioId: string) {
    const orden = await this.prisma.ordenCompra.findFirst({
      where: { id, ubicacion_id: ubicacionId },
      include: { lineas: true, proveedor: true },
    });
    if (!orden) throw new NotFoundException('Orden de compra no encontrada');
    if (orden.estatus === 'RECIBIDA')   throw new BadRequestException('La OC ya fue recibida completamente');
    if (orden.estatus === 'CANCELADA')  throw new BadRequestException('La OC está cancelada');
    if (orden.estatus === 'BORRADOR')   throw new BadRequestException('Aprueba la OC antes de recibirla');

    const lineasMap = new Map<string, OrdenCompraLinea>(orden.lineas.map(l => [l.id, l]));

    let montoRecibidoAhora = 0;

    const resultado = await this.prisma.$transaction(async (tx) => {
      for (const recibo of dto.lineas) {
        const linea = lineasMap.get(recibo.linea_id);
        if (!linea) continue;
        if (recibo.cantidad_recibida <= 0) continue;

        const solicitada = Number(linea.cantidad_solicitada);
        const yaRecibida = Number(linea.cantidad_recibida);
        const pendiente  = solicitada - yaRecibida;
        const aCobrar    = Math.min(recibo.cantidad_recibida, pendiente);
        if (aCobrar <= 0) continue;

        const nuevaRecibida = yaRecibida + aCobrar;

        await tx.ordenCompraLinea.update({
          where: { id: recibo.linea_id },
          data: { cantidad_recibida: nuevaRecibida },
        });

        const articulo = await tx.articulo.findUnique({
          where: { id: linea.articulo_id },
          select: { [`existencia_${linea.existencia_num}`]: true },
        }) as Record<string, unknown> | null;

        const cantidadAntes = Number(articulo?.[`existencia_${linea.existencia_num}`] ?? 0);
        const cantidadDespues = cantidadAntes + aCobrar;

        await tx.articulo.update({
          where: { id: linea.articulo_id },
          data: { [`existencia_${linea.existencia_num}`]: cantidadDespues },
        });

        await tx.movimientoInventario.create({
          data: {
            ubicacion_id:    ubicacionId,
            articulo_id:     linea.articulo_id,
            tipo:            'ENTRADA',
            existencia_num:  linea.existencia_num,
            cantidad:        aCobrar,
            cantidad_antes:  cantidadAntes,
            cantidad_despues: cantidadDespues,
            concepto:        `Recepción OC #${orden.folio} - ${linea.clave}`,
            proveedor_id:    orden.proveedor_id,
            referencia_id:   id,
            usuario_id:      usuarioId,
          },
        });

        montoRecibidoAhora += aCobrar * Number(linea.precio_unitario);
      }

      const lineasActualizadas = await tx.ordenCompraLinea.findMany({ where: { orden_id: id } });
      const todasRecibidas = lineasActualizadas.every(
        l => Number(l.cantidad_recibida) >= Number(l.cantidad_solicitada),
      );
      const nuevoEstatus = todasRecibidas ? 'RECIBIDA' : 'RECIBIDA_PARCIAL';

      if (montoRecibidoAhora > 0) {
        const proveedor = await tx.proveedor.findUnique({
          where: { id: orden.proveedor_id },
          select: { saldo_pendiente: true },
        });
        const saldoAntes    = Number(proveedor?.saldo_pendiente ?? 0);
        const saldoDespues  = saldoAntes + montoRecibidoAhora;

        await tx.proveedor.update({
          where: { id: orden.proveedor_id },
          data: { saldo_pendiente: saldoDespues },
        });

        await tx.movimientoCuentaProveedor.create({
          data: {
            ubicacion_id:  ubicacionId,
            proveedor_id:  orden.proveedor_id,
            tipo:          'CARGO',
            monto:         montoRecibidoAhora,
            saldo_antes:   saldoAntes,
            saldo_despues: saldoDespues,
            concepto:      `Recepción OC #${orden.folio}`,
            orden_id:      id,
            usuario_id:    usuarioId,
          },
        });
      }

      return tx.ordenCompra.update({
        where: { id },
        data: {
          estatus:     nuevoEstatus,
          recibida_at: todasRecibidas ? new Date() : undefined,
        },
        include: {
          lineas:    true,
          proveedor: { select: { id: true, nombre: true } },
        },
      });
    });

    return this.ser(resultado);
  }

  async cancelarOrden(id: string, ubicacionId: string) {
    const orden = await this.getOrdenRaw(id, ubicacionId);
    if (orden.estatus === 'RECIBIDA') {
      throw new BadRequestException('No se puede cancelar una OC ya recibida');
    }
    if (orden.estatus === 'CANCELADA') {
      throw new BadRequestException('La OC ya está cancelada');
    }
    const updated = await this.prisma.ordenCompra.update({
      where: { id },
      data: { estatus: 'CANCELADA' },
      include: { lineas: true },
    });
    return this.ser(updated);
  }

  private async getOrdenRaw(id: string, ubicacionId: string): Promise<OrdenCompra> {
    const orden = await this.prisma.ordenCompra.findFirst({
      where: { id, ubicacion_id: ubicacionId },
    });
    if (!orden) throw new NotFoundException('Orden de compra no encontrada');
    return orden;
  }

  // ── Cuentas por Pagar ───────────────────────────────────────

  async getCuentaProveedor(proveedorId: string, ubicacionId: string, query: {
    page?: number; limit?: number;
  }) {
    const page  = Math.max(1, query.page  ?? 1);
    const limit = Math.min(100, query.limit ?? 50);
    const skip  = (page - 1) * limit;

    const proveedor = await this.prisma.proveedor.findFirst({
      where: { id: proveedorId },
      select: { id: true, nombre: true, razon_social: true, rfc: true, telefono: true, saldo_pendiente: true },
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');

    const where = { ubicacion_id: ubicacionId, proveedor_id: proveedorId };

    const [movimientos, total] = await this.prisma.$transaction([
      this.prisma.movimientoCuentaProveedor.findMany({
        where,
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true } },
          orden:   { select: { id: true, folio: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.movimientoCuentaProveedor.count({ where }),
    ]);

    return {
      proveedor:   this.ser(proveedor),
      movimientos: movimientos.map(m => this.ser(m)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async registrarAbono(
    proveedorId: string,
    dto: AbonoProveedorDto,
    ubicacionId: string,
    usuarioId: string,
  ) {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: { id: proveedorId },
      select: { id: true, saldo_pendiente: true },
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');

    const saldoAntes   = Number(proveedor.saldo_pendiente);
    const saldoDespues = Math.max(0, saldoAntes - dto.monto);

    const mov = await this.prisma.$transaction(async (tx) => {
      await tx.proveedor.update({
        where: { id: proveedorId },
        data: { saldo_pendiente: saldoDespues },
      });
      return tx.movimientoCuentaProveedor.create({
        data: {
          ubicacion_id:  ubicacionId,
          proveedor_id:  proveedorId,
          tipo:          'ABONO',
          monto:         dto.monto,
          saldo_antes:   saldoAntes,
          saldo_despues: saldoDespues,
          concepto:      dto.concepto,
          usuario_id:    usuarioId,
        },
        include: { usuario: { select: { id: true, nombre: true, apellidos: true } } },
      });
    });
    return this.ser(mov);
  }

  async registrarAjuste(
    proveedorId: string,
    dto: AjusteCuentaProveedorDto,
    ubicacionId: string,
    usuarioId: string,
  ) {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: { id: proveedorId },
      select: { id: true, saldo_pendiente: true },
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');

    const saldoAntes   = Number(proveedor.saldo_pendiente);
    const saldoDespues = dto.tipo === 'CARGO'
      ? saldoAntes + dto.monto
      : Math.max(0, saldoAntes - dto.monto);

    const mov = await this.prisma.$transaction(async (tx) => {
      await tx.proveedor.update({
        where: { id: proveedorId },
        data: { saldo_pendiente: saldoDespues },
      });
      return tx.movimientoCuentaProveedor.create({
        data: {
          ubicacion_id:  ubicacionId,
          proveedor_id:  proveedorId,
          tipo:          'AJUSTE',
          monto:         dto.monto,
          saldo_antes:   saldoAntes,
          saldo_despues: saldoDespues,
          concepto:      dto.concepto,
          usuario_id:    usuarioId,
        },
        include: { usuario: { select: { id: true, nombre: true, apellidos: true } } },
      });
    });
    return this.ser(mov);
  }
}
