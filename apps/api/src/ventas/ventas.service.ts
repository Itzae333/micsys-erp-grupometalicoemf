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

  async findAll(ubicacionId: string, query: {
    estatus?: string; page?: number; limit?: number;
    q?: string; desde?: string;
  } = {}) {
    const { estatus, page = 1, limit = 50, q, desde } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NotaVentaWhereInput = { ubicacion_id: ubicacionId };
    if (estatus) where.estatus = estatus as any;
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

  async findOne(id: string, ubicacionId: string) {
    const nota = await this.findOneRaw(id, ubicacionId);
    return this.serializeNota(nota);
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
    if (nota.estatus !== 'ABIERTA' && nota.estatus !== 'COTIZACION') {
      throw new ForbiddenException('Solo se pueden agregar líneas a notas ABIERTA o COTIZACION');
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

    return this.findOne(notaId, ubicacionId);
  }

  async removeLinea(notaId: string, lineaId: string, ubicacionId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);
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

    return this.findOne(notaId, ubicacionId);
  }

  // ─── Cerrar / Cobrar ─────────────────────────────────────────

  async cerrar(notaId: string, dto: CerrarNotaDto, ubicacionId: string, usuarioId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);

    if (nota.estatus !== 'ABIERTA' && nota.estatus !== 'PENDIENTE') {
      throw new ForbiddenException(`No se puede cobrar una nota en estatus ${nota.estatus}`);
    }
    if (nota.lineas.length === 0) {
      throw new BadRequestException('La nota no tiene líneas');
    }

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
            ubicacion_id: ubicacionId,
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

  async cancelar(notaId: string, ubicacionId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);

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
      ? `<img src="${rawLogoUrl}" alt="Logo" style="max-height:70px;max-width:180px;display:block;margin:0 auto 10px;">`
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
          <td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;background:${bg};font-family:monospace;font-size:12px;font-weight:700;color:#0f172a;">${l.clave}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;background:${bg};font-size:12px;color:#475569;">${descs || '—'}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;background:${bg};text-align:right;font-size:12px;color:#0f172a;">${Number(l.cantidad).toLocaleString('es-MX')}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;background:${bg};text-align:right;font-size:12px;color:#0f172a;">$${fmt(Number(l.precio_unitario))}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;background:${bg};text-align:right;font-size:13px;font-weight:700;color:#0f172a;">$${fmt(Number(l.subtotal))}</td>
        </tr>`;
    }).join('');

    // Totales
    const subtotalRow = `<tr><td colspan="4" style="padding:7px 8px;text-align:right;font-size:12px;color:#64748b;">Subtotal</td><td style="padding:7px 8px;text-align:right;font-size:12px;color:#64748b;">$${fmt(Number(nota.subtotal))}</td></tr>`;
    const descuentoRow = Number(nota.descuento) > 0
      ? `<tr><td colspan="4" style="padding:5px 8px;text-align:right;font-size:12px;color:#dc2626;">Descuento</td><td style="padding:5px 8px;text-align:right;font-size:12px;color:#dc2626;">-$${fmt(Number(nota.descuento))}</td></tr>`
      : '';

    let pagoHtml = '';
    if (!esCotizacion && dto.extra) {
      if (dto.extra.tipo_cierre === 'CREDITO') {
        pagoHtml = `<tr><td colspan="4" style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">A crédito</td><td style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">$${fmt(Number(nota.total))}</td></tr>`;
      } else if (dto.extra.tipo_cierre === 'PENDIENTE') {
        pagoHtml = `<tr><td colspan="4" style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">Pendiente de cobro</td><td style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">$${fmt(Number(nota.total))}</td></tr>`;
      } else {
        pagoHtml = (dto.extra.pagos ?? []).filter((p) => p.monto > 0).map((p) =>
          `<tr><td colspan="4" style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">${p.metodo}</td><td style="text-align:right;padding:5px 8px;font-size:12px;color:#64748b;">$${fmt(Number(p.monto))}</td></tr>`,
        ).join('');
        if (dto.extra.cambio && dto.extra.cambio > 0) {
          pagoHtml += `<tr><td colspan="4" style="text-align:right;padding:5px 8px;font-size:12px;color:#94a3b8;">Cambio</td><td style="text-align:right;padding:5px 8px;font-size:12px;color:#94a3b8;">$${fmt(Number(dto.extra.cambio))}</td></tr>`;
        }
      }
    }

    const totalRow = `<tr style="background:#0f172a;"><td colspan="4" style="padding:12px 8px;text-align:right;color:#f8fafc;font-weight:700;font-size:14px;letter-spacing:.5px;">TOTAL</td><td style="padding:12px 8px;text-align:right;color:#ffffff;font-weight:900;font-size:18px;">$${fmt(Number(nota.total))}</td></tr>`;

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
          <th style="padding:9px 8px;text-align:left;font-size:9px;color:#e2e8f0;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Clave</th>
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
      estatus: { in: ['PAGADA', 'CREDITO', 'REABIERTA', 'CANCELADA'] as any[] },
    };
    if (desde || hasta) {
      where.created_at = {
        ...(desde ? { gte: new Date(desde) } : {}),
        ...(hasta ? { lte: new Date(hasta + 'T23:59:59') } : {}),
      };
    }

    const whereAnticipos: Prisma.AnticiposPedidoWhereInput = { ubicacion_id: ubicacionId };
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

      const hasEfectivo = nota.pagos.some((p) => p.metodo === 'EFECTIVO');
      const efectivoReal = hasEfectivo ? Math.max(0, +(notaTotal - nonCashSum).toFixed(2)) : 0;

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

    return {
      desde: desde ?? null,
      hasta: hasta ?? null,
      ubicacion_id: ubicacionId,
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
