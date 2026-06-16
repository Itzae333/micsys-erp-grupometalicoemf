import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateNotaDto, AddLineaDto, UpdateLineaDto, CerrarNotaDto, AbonarNotaDto, SendEmailDto, AgregarEvidenciaDto } from './dto/ventas.dto';
import type { Prisma } from '@grupometalicoemf/database';

const NOTA_INCLUDE = {
  cliente: { select: { id: true, nombre: true, apellidos: true, razon_social: true, email: true, limite_credito: true, saldo_pendiente: true } },
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

@Injectable()
export class VentasService {
  constructor(private prisma: PrismaService) {}

  // ─── Listar ───────────────────────────────────────────────────

  async findAll(empresaId: string, query: {
    estatus?: string; page?: number; limit?: number;
    ubicacionId?: string; q?: string; desde?: string;
  } = {}) {
    const { estatus, page = 1, limit = 50, ubicacionId, q, desde } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NotaVentaWhereInput = { empresa_id: empresaId };
    if (estatus) where.estatus = estatus as any;
    if (ubicacionId) where.ubicacion_id = ubicacionId;
    if (desde) where.created_at = { gte: new Date(desde) };
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

  async findOne(id: string, empresaId: string) {
    const nota = await this.findOneRaw(id, empresaId);
    return this.serializeNota(nota);
  }

  // ─── Crear nota ───────────────────────────────────────────────

  async create(dto: CreateNotaDto, empresaId: string, ubicacionId: string, usuarioId: string) {
    const folio = await this.nextFolio(empresaId);

    const nota = await this.prisma.$transaction(async (tx) => {
      const n = await tx.notaVenta.create({
        data: {
          folio,
          empresa_id: empresaId,
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
            where: { id: l.articulo_id, empresa_id: empresaId },
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

  async addLinea(notaId: string, dto: AddLineaDto, empresaId: string) {
    const nota = await this.findOneRaw(notaId, empresaId);
    if (nota.estatus !== 'ABIERTA' && nota.estatus !== 'COTIZACION') {
      throw new ForbiddenException('Solo se pueden agregar líneas a notas ABIERTA o COTIZACION');
    }

    const art = await this.prisma.articulo.findFirst({
      where: { id: dto.articulo_id, empresa_id: empresaId },
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

    return this.findOne(notaId, empresaId);
  }

  async updateLinea(notaId: string, lineaId: string, dto: UpdateLineaDto, empresaId: string) {
    const nota = await this.findOneRaw(notaId, empresaId);
    if (nota.estatus !== 'ABIERTA' && nota.estatus !== 'COTIZACION') {
      throw new ForbiddenException('Solo se pueden editar líneas de notas ABIERTA o COTIZACION');
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

    return this.findOne(notaId, empresaId);
  }

  async removeLinea(notaId: string, lineaId: string, empresaId: string) {
    const nota = await this.findOneRaw(notaId, empresaId);
    if (nota.estatus !== 'ABIERTA' && nota.estatus !== 'COTIZACION') {
      throw new ForbiddenException('Solo se pueden eliminar líneas de notas ABIERTA o COTIZACION');
    }

    const linea = await this.prisma.notaVentaLinea.findFirst({
      where: { id: lineaId, nota_id: notaId },
    });
    if (!linea) throw new NotFoundException('Línea no encontrada');

    await this.prisma.$transaction(async (tx) => {
      await tx.notaVentaLinea.delete({ where: { id: lineaId } });
      await this.recalcNota(tx, notaId);
    });

    return this.findOne(notaId, empresaId);
  }

  // ─── Cerrar / Cobrar ─────────────────────────────────────────

  async cerrar(notaId: string, dto: CerrarNotaDto, empresaId: string, usuarioId: string) {
    const nota = await this.findOneRaw(notaId, empresaId);

    if (nota.estatus !== 'ABIERTA' && nota.estatus !== 'PENDIENTE') {
      throw new ForbiddenException(`No se puede cobrar una nota en estatus ${nota.estatus}`);
    }
    if (nota.lineas.length === 0) {
      throw new BadRequestException('La nota no tiene líneas');
    }

    const totalPagado = dto.pagos.reduce((s, p) => s + p.monto, 0);
    const totalNota = Number(nota.total);
    const diferencia = +Math.max(0, totalNota - totalPagado).toFixed(2);

    // Pago parcial sin cliente asignado → no se puede registrar crédito
    if (diferencia > 0 && !nota.cliente_id) {
      throw new BadRequestException(
        `Se requiere cliente asignado para registrar el saldo restante ($${diferencia.toFixed(2)}) a crédito`,
      );
    }

    // Si hay diferencia positiva → crédito automático
    const esCredito = diferencia > 0;
    const nuevoEstatus: 'PAGADA' | 'CREDITO' = esCredito ? 'CREDITO' : 'PAGADA';

    const result = await this.prisma.$transaction(async (tx) => {
      for (const p of dto.pagos) {
        await tx.pago.create({
          data: { nota_id: notaId, metodo: p.metodo, monto: p.monto, referencia: p.referencia ?? null },
        });
      }

      if (dto.observaciones) {
        await tx.notaVenta.update({ where: { id: notaId }, data: { observaciones: dto.observaciones } });
      }

      if (esCredito && nota.cliente_id) {
        const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: nota.cliente_id } });
        const saldoAntes = Number(cliente.saldo_pendiente);
        const saldoDespues = saldoAntes + diferencia;

        const concepto = totalPagado > 0
          ? `Saldo pendiente nota #${nota.folio} (anticipo $${totalPagado.toFixed(2)})`
          : `Venta a crédito nota #${nota.folio}`;

        await tx.movimientoCuenta.create({
          data: {
            empresa_id: empresaId,
            cliente_id: nota.cliente_id,
            tipo: 'CARGO',
            monto: diferencia,
            saldo_antes: saldoAntes,
            saldo_despues: saldoDespues,
            concepto,
            nota_id: notaId,
            usuario_id: usuarioId,
          },
        });

        await tx.cliente.update({
          where: { id: nota.cliente_id },
          data: { saldo_pendiente: saldoDespues },
        });
      }

      return tx.notaVenta.update({
        where: { id: notaId },
        data: {
          estatus: nuevoEstatus,
          es_credito: esCredito,
          fecha_vencimiento: dto.fecha_vencimiento ? new Date(dto.fecha_vencimiento) : null,
          cerrada_at: new Date(),
        },
        include: NOTA_INCLUDE,
      });
    });

    return this.serializeNota(result);
  }

  // ─── Marcar como pendiente de pago ───────────────────────────

  async marcarPendiente(notaId: string, empresaId: string) {
    const nota = await this.findOneRaw(notaId, empresaId);
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

  async convertirAVenta(notaId: string, empresaId: string) {
    const nota = await this.findOneRaw(notaId, empresaId);
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

  async cancelar(notaId: string, empresaId: string) {
    const nota = await this.findOneRaw(notaId, empresaId);

    if (nota.estatus === 'PAGADA' || nota.estatus === 'CANCELADA') {
      throw new ForbiddenException(`No se puede cancelar una nota en estatus ${nota.estatus}`);
    }

    if (nota.estatus === 'CREDITO' && nota.cliente_id) {
      await this.prisma.cliente.update({
        where: { id: nota.cliente_id },
        data: { saldo_pendiente: { decrement: Number(nota.total) } },
      });
    }

    const result = await this.prisma.notaVenta.update({
      where: { id: notaId },
      data: { estatus: 'CANCELADA' },
      include: NOTA_INCLUDE,
    });

    return this.serializeNota(result);
  }

  // ─── Privados ─────────────────────────────────────────────────

  private async findOneRaw(id: string, empresaId: string): Promise<NotaRaw> {
    const nota = await this.prisma.notaVenta.findFirst({
      where: { id, empresa_id: empresaId },
      include: NOTA_INCLUDE,
    });
    if (!nota) throw new NotFoundException('Nota de venta no encontrada');
    return nota;
  }

  private calcSubtotal(cantidad: number, precio: number, descuento: number): number {
    return cantidad * precio * (1 - descuento / 100);
  }

  private async nextFolio(empresaId: string): Promise<number> {
    const last = await this.prisma.notaVenta.findFirst({
      where: { empresa_id: empresaId },
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

  private serializeNota(nota: NotaRaw) {
    return {
      ...nota,
      subtotal: Number(nota.subtotal),
      descuento: Number(nota.descuento),
      total: Number(nota.total),
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

  async abonar(notaId: string, dto: AbonarNotaDto, empresaId: string, usuarioId: string) {
    const nota = await this.findOneRaw(notaId, empresaId);

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
          empresa_id: empresaId,
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
    const nota = await this.findOneRaw(notaId, empresaId);

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

    return this.findOne(notaId, empresaId);
  }

  // ─── Enviar email ─────────────────────────────────────────

  async sendEmail(id: string, empresaId: string, dto: SendEmailDto) {
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost) {
      throw new BadRequestException(
        'Email no configurado. Agrega las variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS al entorno del API.',
      );
    }

    const nota = await this.findOneRaw(id, empresaId);

    // Fetch empresa y ubicacion para el encabezado del email
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
    const total = Number(nota.total).toFixed(2);
    const clienteNombre = nota.cliente
      ? (nota.cliente.razon_social ?? `${nota.cliente.nombre}${nota.cliente.apellidos ? ' ' + nota.cliente.apellidos : ''}`)
      : 'Público General';

    const logoHtml = empresa?.logo_url
      ? `<img src="${empresa.logo_url}" alt="Logo" style="max-height:60px;max-width:200px;display:block;margin-bottom:8px;">`
      : '';

    const direccionParts = [ubicacion?.calle, ubicacion?.colonia, ubicacion?.municipio, ubicacion?.estado].filter(Boolean);
    const direccion = direccionParts.length > 0 ? direccionParts.join(', ') : '';
    const rfcTel = [
      ubicacion?.rfc ? `RFC: ${ubicacion.rfc}` : null,
      ubicacion?.telefono ? `Tel: ${ubicacion.telefono}` : null,
    ].filter(Boolean).join('  ·  ');

    const lineasHtml = nota.lineas.map((l) => {
      const descs = [l.articulo?.descripcion_1, l.articulo?.descripcion_2,
        (l.articulo as any)?.descripcion_3, (l.articulo as any)?.descripcion_4, (l.articulo as any)?.descripcion_5,
      ].filter(Boolean).join(' · ');
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${l.clave}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;color:#444;">${descs || '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-size:12px;">${Number(l.cantidad).toLocaleString('es-MX')}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-size:12px;">$${Number(l.precio_unitario).toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-size:12px;font-weight:bold;">$${Number(l.subtotal).toFixed(2)}</td>
        </tr>`;
    }).join('');

    let pagoHtml = '';
    if (!esCotizacion && dto.extra) {
      if (dto.extra.tipo_cierre === 'CREDITO') {
        pagoHtml = `<tr><td colspan="4" style="text-align:right;padding:6px 8px;font-size:12px;">A crédito</td><td style="text-align:right;padding:6px 8px;font-size:12px;">$${total}</td></tr>`;
      } else if (dto.extra.tipo_cierre === 'PENDIENTE') {
        pagoHtml = `<tr><td colspan="4" style="text-align:right;padding:6px 8px;font-size:12px;">Pendiente de cobro</td><td style="text-align:right;padding:6px 8px;font-size:12px;">$${total}</td></tr>`;
      } else {
        pagoHtml = (dto.extra.pagos ?? []).filter((p) => p.monto > 0).map((p) =>
          `<tr><td colspan="4" style="text-align:right;padding:6px 8px;font-size:12px;">${p.metodo}</td><td style="text-align:right;padding:6px 8px;font-size:12px;">$${Number(p.monto).toFixed(2)}</td></tr>`,
        ).join('');
        if (dto.extra.cambio && dto.extra.cambio > 0) {
          pagoHtml += `<tr><td colspan="4" style="text-align:right;padding:6px 8px;font-size:12px;color:#888;">Cambio</td><td style="text-align:right;padding:6px 8px;font-size:12px;color:#888;">$${Number(dto.extra.cambio).toFixed(2)}</td></tr>`;
        }
      }
    }

    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  <!-- Cabecera -->
  <tr><td style="background:#111;padding:24px 32px;text-align:center;">
    ${logoHtml}
    <p style="margin:0;color:#fff;font-size:20px;font-weight:bold;letter-spacing:1px;">${(ubicacion?.razon_social ?? empresa?.nombre ?? '').toUpperCase()}</p>
    ${ubicacion?.nombre ? `<p style="margin:4px 0 0;color:#aaa;font-size:12px;">${ubicacion.nombre}</p>` : ''}
    ${rfcTel ? `<p style="margin:6px 0 0;color:#888;font-size:11px;">${rfcTel}</p>` : ''}
    ${direccion ? `<p style="margin:4px 0 0;color:#888;font-size:11px;">${direccion}</p>` : ''}
  </td></tr>
  <!-- Tipo doc -->
  <tr><td style="background:${esCotizacion ? '#2563eb' : '#16a34a'};padding:10px 32px;text-align:center;">
    <p style="margin:0;color:#fff;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">${esCotizacion ? 'COTIZACIÓN' : 'COMPROBANTE DE VENTA'} ${folioStr}</p>
  </td></tr>
  <!-- Info -->
  <tr><td style="padding:20px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:12px;color:#555;">Fecha: <strong style="color:#111;">${fechaStr}</strong></td>
        <td style="font-size:12px;color:#555;text-align:right;">Cliente: <strong style="color:#111;">${clienteNombre}</strong></td>
      </tr>
    </table>
  </td></tr>
  <!-- Artículos -->
  <tr><td style="padding:16px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px;text-align:left;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;border-bottom:2px solid #e5e5e5;">Clave</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;border-bottom:2px solid #e5e5e5;">Descripción</th>
          <th style="padding:8px;text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;border-bottom:2px solid #e5e5e5;">Cant.</th>
          <th style="padding:8px;text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;border-bottom:2px solid #e5e5e5;">P.U.</th>
          <th style="padding:8px;text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;border-bottom:2px solid #e5e5e5;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${lineasHtml}</tbody>
      <tfoot>
        ${pagoHtml}
        <tr style="background:#111;">
          <td colspan="4" style="padding:10px 8px;text-align:right;color:#fff;font-weight:bold;font-size:14px;">TOTAL</td>
          <td style="padding:10px 8px;text-align:right;color:#fff;font-weight:bold;font-size:16px;">$${total}</td>
        </tr>
      </tfoot>
    </table>
  </td></tr>
  <!-- Observaciones -->
  ${nota.observaciones ? `<tr><td style="padding:16px 32px 0;font-size:12px;color:#555;">Observaciones: ${nota.observaciones}</td></tr>` : ''}
  <!-- Pie -->
  <tr><td style="padding:20px 32px 24px;text-align:center;border-top:1px solid #eee;margin-top:16px;">
    ${esCotizacion ? '<p style="margin:0 0 4px;font-size:11px;color:#888;">Esta cotización es válida por 30 días a partir de su emisión.</p>' : ''}
    <p style="margin:0;font-size:11px;color:#aaa;">¡Gracias por su preferencia!</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  }

  // ─── Corte de caja ────────────────────────────────────────────

  async getCorteCaja(
    empresaId: string,
    query: { desde?: string; hasta?: string; ubicacionId?: string },
  ) {
    const { desde, hasta, ubicacionId } = query;

    const where: Prisma.NotaVentaWhereInput = {
      empresa_id: empresaId,
      estatus: { in: ['PAGADA', 'CREDITO', 'REABIERTA', 'CANCELADA'] as any[] },
    };
    if (ubicacionId) where.ubicacion_id = ubicacionId;
    if (desde || hasta) {
      where.created_at = {
        ...(desde ? { gte: new Date(desde) } : {}),
        ...(hasta ? { lte: new Date(hasta + 'T23:59:59') } : {}),
      };
    }

    const whereAnticipos: Prisma.AnticiposPedidoWhereInput = { empresa_id: empresaId };
    if (ubicacionId) whereAnticipos.ubicacion_id = ubicacionId;
    if (desde || hasta) {
      whereAnticipos.created_at = {
        ...(desde ? { gte: new Date(desde) } : {}),
        ...(hasta ? { lte: new Date(hasta + 'T23:59:59') } : {}),
      };
    }

    const [notas, anticiposPedido] = await Promise.all([
      this.prisma.notaVenta.findMany({
        where,
        orderBy: { created_at: 'asc' },
        include: {
          cliente: { select: { id: true, nombre: true, apellidos: true, razon_social: true } },
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
    ]);

    const metodos: Record<string, { count: number; total: number }> = {
      EFECTIVO:     { count: 0, total: 0 },
      TARJETA:      { count: 0, total: 0 },
      TRANSFERENCIA:{ count: 0, total: 0 },
      DEPOSITO:     { count: 0, total: 0 },
    };

    const porEstatus: Record<string, { count: number; total: number }> = {};
    let totalCobrado = 0;

    for (const nota of notas) {
      const est = nota.estatus as string;
      if (!porEstatus[est]) porEstatus[est] = { count: 0, total: 0 };
      porEstatus[est].count++;
      porEstatus[est].total = +(porEstatus[est].total + Number(nota.total)).toFixed(2);

      const notaTotal = Number(nota.total);

      // Pagos no-efectivo se registran al monto exacto (tarjeta/transferencia/depósito no generan cambio)
      let nonCashSum = 0;
      for (const pago of nota.pagos) {
        if (pago.metodo === 'EFECTIVO') continue;
        const m = pago.metodo as string;
        const monto = Number(pago.monto);
        if (!metodos[m]) metodos[m] = { count: 0, total: 0 };
        metodos[m].count++;
        metodos[m].total = +(metodos[m].total + monto).toFixed(2);
        nonCashSum = +(nonCashSum + monto).toFixed(2);
      }

      // Efectivo real = nota.total − pagos no-efectivo (el excedente fue cambio devuelto)
      const hasEfectivo = nota.pagos.some((p) => p.metodo === 'EFECTIVO');
      const efectivoReal = hasEfectivo ? Math.max(0, +(notaTotal - nonCashSum).toFixed(2)) : 0;

      if (hasEfectivo) {
        metodos['EFECTIVO'].count++;
        metodos['EFECTIVO'].total = +(metodos['EFECTIVO'].total + efectivoReal).toFixed(2);
      }

      totalCobrado = +(totalCobrado + nonCashSum + efectivoReal).toFixed(2);
    }

    // Agregar anticipos de pedidos
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

    return {
      desde: desde ?? null,
      hasta: hasta ?? null,
      ubicacion_id: ubicacionId ?? null,
      total_cobrado: totalCobrado,
      por_metodo: metodos,
      por_estatus: porEstatus,
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
      notas: notas.map((n) => {
        const notaTotal = Number(n.total);
        const nonCash = n.pagos
          .filter((p) => p.metodo !== 'EFECTIVO')
          .reduce((s, p) => s + Number(p.monto), 0);
        const sumTodos = n.pagos.reduce((s, p) => s + Number(p.monto), 0);
        const cambio = Math.max(0, +(sumTodos - notaTotal).toFixed(2));
        const efectivoReal = Math.max(0, +(notaTotal - nonCash).toFixed(2));

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
          pagos: n.pagos.map((p) => ({
            metodo: p.metodo,
            monto: p.metodo === 'EFECTIVO' ? efectivoReal : Number(p.monto),
          })),
        };
      }),
    };
  }
}
