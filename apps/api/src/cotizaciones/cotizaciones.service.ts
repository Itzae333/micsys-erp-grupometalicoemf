import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { VentasService } from '../ventas/ventas.service';
import type {
  CreateCotizacionDto, AddLineaCotizacionDto, UpdateLineaCotizacionDto,
  CancelarCotizacionDto, SendEmailCotizacionDto,
} from './dto/cotizaciones.dto';
import type { Prisma } from '@grupometalicoemf/database';

const COTIZACION_INCLUDE = {
  cliente: { select: { id: true, nombre: true, apellidos: true, razon_social: true, email: true, telefono: true } },
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
} satisfies Prisma.NotaCotizacionInclude;

type CotizacionRaw = Prisma.NotaCotizacionGetPayload<{ include: typeof COTIZACION_INCLUDE }>;

const API_PUBLIC_URL = (process.env.API_PUBLIC_URL ?? 'http://localhost:3001').replace(/\/$/, '');

function resolveLogoUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_PUBLIC_URL}${url}`;
}

const VIGENCIA_DIAS_DEFAULT = 30;

@Injectable()
export class CotizacionesService {
  constructor(
    private prisma: PrismaService,
    private ventas: VentasService,
  ) {}

  // ─── Listar ───────────────────────────────────────────────────

  async findAll(ubicacionId: string, query: {
    estatus?: string; page?: number; limit?: number; q?: string;
  } = {}) {
    const { estatus, page = 1, limit = 50, q } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NotaCotizacionWhereInput = { ubicacion_id: ubicacionId };
    if (estatus) where.estatus = estatus as any;
    if (q) {
      const folioNum = parseInt(q, 10);
      where.OR = [
        ...(isNaN(folioNum) ? [] : [{ folio: folioNum }]),
        { cliente: { nombre: { contains: q, mode: 'insensitive' } } },
        { cliente: { razon_social: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.notaCotizacion.count({ where }),
      this.prisma.notaCotizacion.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: COTIZACION_INCLUDE,
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

  // ─── Crear ────────────────────────────────────────────────────

  async create(dto: CreateCotizacionDto, ubicacionId: string, usuarioId: string) {
    const vigenciaDias = dto.vigencia_dias ?? VIGENCIA_DIAS_DEFAULT;
    const vigenciaHasta = new Date(Date.now() + vigenciaDias * 24 * 60 * 60 * 1000);

    const nota = await this.prisma.$transaction(async (tx) => {
      const folio = await this.nextFolioLocked(tx, ubicacionId);

      const n = await tx.notaCotizacion.create({
        data: {
          folio,
          ubicacion_id: ubicacionId,
          usuario_id: usuarioId,
          cliente_id: dto.cliente_id ?? null,
          observaciones: dto.observaciones ?? null,
          vigencia_hasta: vigenciaHasta,
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
          await tx.notaCotizacionLinea.create({
            data: {
              nota_cotizacion_id: n.id,
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

      return tx.notaCotizacion.findFirstOrThrow({ where: { id: n.id }, include: COTIZACION_INCLUDE });
    });

    return this.serializeNota(nota);
  }

  // ─── Líneas ───────────────────────────────────────────────────

  async addLinea(notaId: string, dto: AddLineaCotizacionDto, ubicacionId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);
    if (nota.estatus !== 'ACTIVA') {
      throw new ForbiddenException('Solo se pueden agregar líneas a cotizaciones ACTIVA');
    }

    const art = await this.prisma.articulo.findFirst({
      where: { id: dto.articulo_id, ubicacion_id: ubicacionId },
    });
    if (!art) throw new NotFoundException('Artículo no encontrado');
    if (!art.activo) throw new BadRequestException('El artículo está inactivo');

    const subtotal = this.calcSubtotal(dto.cantidad, dto.precio_unitario, dto.descuento ?? 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.notaCotizacionLinea.create({
        data: {
          nota_cotizacion_id: notaId,
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

  async updateLinea(notaId: string, lineaId: string, dto: UpdateLineaCotizacionDto, ubicacionId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);
    if (nota.estatus !== 'ACTIVA') {
      throw new ForbiddenException('Solo se pueden editar líneas de cotizaciones ACTIVA');
    }

    const linea = await this.prisma.notaCotizacionLinea.findFirst({
      where: { id: lineaId, nota_cotizacion_id: notaId },
    });
    if (!linea) throw new NotFoundException('Línea no encontrada');

    const cantidad = dto.cantidad ?? Number(linea.cantidad);
    const precio = dto.precio_unitario ?? Number(linea.precio_unitario);
    const descuento = dto.descuento ?? Number(linea.descuento);
    const subtotal = this.calcSubtotal(cantidad, precio, descuento);

    await this.prisma.$transaction(async (tx) => {
      await tx.notaCotizacionLinea.update({
        where: { id: lineaId },
        data: { cantidad, precio_unitario: precio, descuento, subtotal },
      });
      await this.recalcNota(tx, notaId);
    });

    return this.findOne(notaId, ubicacionId);
  }

  async removeLinea(notaId: string, lineaId: string, ubicacionId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);
    if (nota.estatus !== 'ACTIVA') {
      throw new ForbiddenException('Solo se pueden eliminar líneas de cotizaciones ACTIVA');
    }

    const linea = await this.prisma.notaCotizacionLinea.findFirst({
      where: { id: lineaId, nota_cotizacion_id: notaId },
    });
    if (!linea) throw new NotFoundException('Línea no encontrada');

    await this.prisma.$transaction(async (tx) => {
      await tx.notaCotizacionLinea.delete({ where: { id: lineaId } });
      await this.recalcNota(tx, notaId);
    });

    return this.findOne(notaId, ubicacionId);
  }

  // ─── Cancelar ─────────────────────────────────────────────────

  async cancelar(notaId: string, dto: CancelarCotizacionDto, ubicacionId: string, usuarioId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);
    if (nota.estatus !== 'ACTIVA') {
      throw new ForbiddenException(`No se puede cancelar una cotización en estatus ${nota.estatus}`);
    }
    if (dto.motivo === 'OTRO' && !dto.comentario?.trim()) {
      throw new BadRequestException('El comentario es obligatorio cuando el motivo es "Otro"');
    }

    const result = await this.prisma.notaCotizacion.update({
      where: { id: notaId },
      data: {
        estatus: 'CANCELADA',
        motivo_cancelacion: dto.motivo,
        motivo_cancelacion_comentario: dto.comentario?.trim() || null,
        cancelado_por_id: usuarioId,
        cancelado_at: new Date(),
      },
      include: COTIZACION_INCLUDE,
    });

    return this.serializeNota(result);
  }

  // ─── Convertir a venta ────────────────────────────────────────
  // Crea una NotaVenta nueva (folio propio, created_at = ahora) con las
  // líneas copiadas y enlaza esta cotización como CONVERTIDA. Todo en una
  // sola transacción para que ninguna de las dos mitades quede huérfana.

  async convertirAVenta(notaId: string, ubicacionId: string, usuarioId: string) {
    const nota = await this.findOneRaw(notaId, ubicacionId);

    if (nota.estatus !== 'ACTIVA') {
      throw new BadRequestException(`No se puede convertir una cotización en estatus ${nota.estatus}`);
    }
    if (nota.vigencia_hasta.getTime() < Date.now()) {
      await this.prisma.notaCotizacion.update({ where: { id: notaId }, data: { estatus: 'VENCIDA' } });
      throw new BadRequestException('La cotización ya venció');
    }
    if (nota.lineas.length === 0) {
      throw new BadRequestException('La cotización no tiene líneas');
    }

    const venta = await this.prisma.$transaction(async (tx) => {
      const ventaCreada = await this.ventas.crearDesdeConversion(tx, {
        ubicacionId,
        usuarioId,
        clienteId: nota.cliente_id,
        observaciones: `Convertida de cotización #${String(nota.folio).padStart(4, '0')}${nota.observaciones ? ' — ' + nota.observaciones : ''}`,
        subtotal: Number(nota.subtotal),
        descuento: Number(nota.descuento),
        total: Number(nota.total),
        lineas: nota.lineas.map((l) => ({
          articulo_id: l.articulo_id,
          clave: l.clave,
          cantidad: Number(l.cantidad),
          precio_unitario: Number(l.precio_unitario),
          descuento: Number(l.descuento),
          subtotal: Number(l.subtotal),
        })),
      });

      await tx.notaCotizacion.update({
        where: { id: notaId },
        data: { estatus: 'CONVERTIDA', venta_id: ventaCreada.id, convertida_at: new Date() },
      });

      return ventaCreada;
    });

    return venta;
  }

  // ─── Enviar email ─────────────────────────────────────────────

  async sendEmail(id: string, empresaId: string, dto: SendEmailCotizacionDto) {
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost) {
      throw new BadRequestException(
        'Email no configurado. Agrega las variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS al entorno del API.',
      );
    }

    const nota = await this.prisma.notaCotizacion.findFirst({ where: { id }, include: COTIZACION_INCLUDE });
    if (!nota) throw new NotFoundException('Cotización no encontrada');

    const [empresa, ubicacion] = await Promise.all([
      this.prisma.empresa.findUnique({ where: { id: empresaId } }),
      this.prisma.ubicacion.findUnique({ where: { id: nota.ubicacion_id } }),
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
    const subject = `Cotización ${folioStr} — ${empresa?.nombre ?? ''}`;
    const html = this.buildEmailHtml(nota, empresa as any, ubicacion as any);

    await transporter.sendMail({
      from: `"${empresa?.nombre ?? 'GrupoMetalicoEMF'}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
      to: dto.to,
      subject,
      html,
    });

    return { ok: true, to: dto.to, subject };
  }

  private buildEmailHtml(nota: CotizacionRaw, empresa: any, ubicacion: any): string {
    const folioStr = `#${String(nota.folio).padStart(4, '0')}`;
    const fechaStr = new Date(nota.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    const vigenciaStr = new Date(nota.vigencia_hasta).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const clienteNombre = nota.cliente
      ? (nota.cliente.razon_social ?? `${nota.cliente.nombre}${nota.cliente.apellidos ? ' ' + nota.cliente.apellidos : ''}`)
      : 'Público en general';

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

    const accentColor = '#2563eb';

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

    const subtotalRow = `<tr><td colspan="3" style="padding:7px 8px;text-align:right;font-size:12px;color:#64748b;">Subtotal</td><td style="padding:7px 8px;text-align:right;font-size:12px;color:#64748b;">$${fmt(Number(nota.subtotal))}</td></tr>`;
    const descuentoRow = Number(nota.descuento) > 0
      ? `<tr><td colspan="3" style="padding:5px 8px;text-align:right;font-size:12px;color:#dc2626;">Descuento</td><td style="padding:5px 8px;text-align:right;font-size:12px;color:#dc2626;">-$${fmt(Number(nota.descuento))}</td></tr>`
      : '';
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
        <td style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">COTIZACIÓN&nbsp;&nbsp;${folioStr}</td>
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
        <td style="padding:10px 14px;text-align:right;vertical-align:top;">
          <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;">Válida hasta</p>
          <p style="margin:4px 0 0;font-size:12px;font-weight:600;color:${accentColor};">${vigenciaStr}</p>
        </td>
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
        ${totalRow}
      </tfoot>
    </table>
  </td></tr>

  <!-- Observaciones -->
  ${nota.observaciones ? `<tr><td style="padding:14px 36px 0;"><div style="background:#fefce8;border-left:3px solid #eab308;padding:10px 14px;border-radius:0 4px 4px 0;font-size:12px;color:#713f12;"><strong>Observaciones:</strong> ${nota.observaciones}</div></td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="padding:20px 36px 26px;text-align:center;border-top:1px solid #e2e8f0;margin-top:16px;">
    <p style="margin:0 0 5px;font-size:11px;color:#64748b;">Esta cotización es válida hasta el ${vigenciaStr}.</p>
    <p style="margin:0 0 5px;font-size:11px;color:#94a3b8;">Precios sujetos a cambio sin previo aviso.</p>
    <p style="margin:0;font-size:11px;color:#94a3b8;">¡Gracias por su preferencia!</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
  }

  // ─── Cron: expirar cotizaciones vencidas ──────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async marcarVencidas() {
    await this.prisma.notaCotizacion.updateMany({
      where: { estatus: 'ACTIVA', vigencia_hasta: { lt: new Date() } },
      data: { estatus: 'VENCIDA' },
    });
  }

  // ─── Privados ─────────────────────────────────────────────────

  private async findOneRaw(id: string, ubicacionId: string): Promise<CotizacionRaw> {
    const nota = await this.prisma.notaCotizacion.findFirst({
      where: { id, ubicacion_id: ubicacionId },
      include: COTIZACION_INCLUDE,
    });
    if (!nota) throw new NotFoundException('Cotización no encontrada');
    return nota;
  }

  private calcSubtotal(cantidad: number, precio: number, descuento: number): number {
    return cantidad * precio * (1 - descuento / 100);
  }

  private async recalcNota(tx: Prisma.TransactionClient, notaId: string) {
    const lineas = await tx.notaCotizacionLinea.findMany({ where: { nota_cotizacion_id: notaId } });
    const subtotal = lineas.reduce((s, l) => s + Number(l.subtotal), 0);
    await tx.notaCotizacion.update({
      where: { id: notaId },
      data: { subtotal, total: subtotal },
    });
  }

  // Folio con lock de fila — mismo patrón que VentasService.nextFolioLocked,
  // pero sobre notas_cotizacion (secuencia completamente independiente).
  private async nextFolioLocked(tx: Prisma.TransactionClient, ubicacionId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ folio: number }[]>`
      SELECT folio FROM notas_cotizacion WHERE ubicacion_id = ${ubicacionId} ORDER BY folio DESC LIMIT 1 FOR UPDATE
    `;
    return (rows[0]?.folio ?? 0) + 1;
  }

  // Chequeo perezoso: si ya pasó la vigencia pero el cron aún no corrió, se
  // muestra como VENCIDA en la respuesta sin esperar hasta la próxima hora.
  private serializeNota(nota: CotizacionRaw) {
    const vencidaSinMarcar = nota.estatus === 'ACTIVA' && nota.vigencia_hasta.getTime() < Date.now();
    return {
      ...nota,
      estatus: vencidaSinMarcar ? ('VENCIDA' as const) : nota.estatus,
      subtotal: Number(nota.subtotal),
      descuento: Number(nota.descuento),
      total: Number(nota.total),
      lineas: nota.lineas.map((l) => ({
        ...l,
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario),
        descuento: Number(l.descuento),
        subtotal: Number(l.subtotal),
      })),
    };
  }
}
