import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { CrearSolicitudDto, AprobarSolicitudDto, RechazarSolicitudDto } from './dto/solicitudes-edicion.dto';

const ESTATUS_CON_EDICION_SOLICITABLE = ['PAGADA', 'CREDITO', 'INCOMPLETA', 'FINALIZADA'];
const TOKEN_VIGENCIA_HORAS = 72;

@Injectable()
export class SolicitudesEdicionService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // ─── Crear solicitud (vendedor/encargado/admin) ────────────────

  async crear(notaId: string, ubicacionId: string, solicitanteId: string, dto: CrearSolicitudDto) {
    const nota = await this.prisma.notaVenta.findFirst({
      where: { id: notaId, ubicacion_id: ubicacionId },
      include: { ubicacion: { select: { empresa_id: true, nombre: true } } },
    });
    if (!nota) throw new NotFoundException('Nota no encontrada');

    if (!ESTATUS_CON_EDICION_SOLICITABLE.includes(nota.estatus)) {
      throw new ForbiddenException(`No se puede solicitar edición de una nota en estatus ${nota.estatus}`);
    }

    const existente = await this.prisma.solicitudEdicionNota.findFirst({
      where: { nota_id: notaId, estatus: 'PENDIENTE' },
    });
    if (existente) {
      throw new BadRequestException('Ya existe una solicitud de edición pendiente para esta nota');
    }

    if (nota.estatus === 'CREDITO') {
      const abono = await this.prisma.movimientoCuenta.findFirst({
        where: { nota_id: notaId, tipo: 'ABONO' },
      });
      if (abono) {
        throw new BadRequestException(
          'No se puede solicitar edición de una nota a crédito que ya tiene abonos registrados',
        );
      }
    }

    const token = randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + TOKEN_VIGENCIA_HORAS * 60 * 60 * 1000);
    const empresaId = nota.ubicacion.empresa_id;

    const solicitud = await this.prisma.solicitudEdicionNota.create({
      data: {
        nota_id: notaId,
        empresa_id: empresaId,
        solicitante_id: solicitanteId,
        motivo: dto.motivo,
        token,
        token_expires_at: tokenExpiresAt,
      },
    });

    const admins = await this.prisma.usuario.findMany({
      where: { empresa_id: empresaId, rol: 'ADMIN', activo: true },
      select: { email: true, nombre: true },
    });

    const frontendUrl = process.env.APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontendUrl}/aprobaciones/edicion-nota/${token}`;
    const folioStr = `#${String(nota.folio).padStart(4, '0')}`;

    let notificados = 0;
    for (const admin of admins) {
      const enviado = await this.mail.send({
        to: admin.email,
        subject: `Solicitud de edición — Nota ${folioStr} (${nota.ubicacion.nombre})`,
        html: `
          <p>Hola ${admin.nombre},</p>
          <p>Se solicitó editar la nota de venta <strong>${folioStr}</strong> en <strong>${nota.ubicacion.nombre}</strong>, ya cobrada.</p>
          <p><strong>Motivo:</strong> ${dto.motivo}</p>
          <p><a href="${link}">Haz clic aquí para revisar y autorizar/rechazar la edición</a></p>
          <p>Este enlace expira en ${TOKEN_VIGENCIA_HORAS} horas.</p>
        `,
      });
      if (enviado) notificados++;
    }

    // Si ningún admin quedó notificado (correo caído, mal configurado, o sin
    // admins activos), no tiene sentido dejar la solicitud viva sin nadie que
    // pueda aprobarla — se revierte para que el vendedor sepa que no se envió.
    if (notificados === 0) {
      await this.prisma.solicitudEdicionNota.delete({ where: { id: solicitud.id } });
      throw new BadRequestException(
        admins.length === 0
          ? 'No hay administradores activos para notificar — la solicitud no se creó.'
          : 'No se pudo notificar a ningún administrador por correo — la solicitud no se creó. Avisa a soporte para revisar la configuración de correo.',
      );
    }

    return { ok: true, solicitud_id: solicitud.id, admins_notificados: notificados };
  }

  async listarPorNota(notaId: string, ubicacionId: string) {
    const nota = await this.prisma.notaVenta.findFirst({ where: { id: notaId, ubicacion_id: ubicacionId } });
    if (!nota) throw new NotFoundException('Nota no encontrada');

    const solicitudes = await this.prisma.solicitudEdicionNota.findMany({
      where: { nota_id: notaId },
      orderBy: { created_at: 'desc' },
      include: {
        solicitante: { select: { id: true, nombre: true, apellidos: true } },
        aprobado_por: { select: { id: true, nombre: true, apellidos: true } },
      },
    });
    return solicitudes;
  }

  // ─── Consulta pública por token ─────────────────────────────────

  async obtenerPorToken(token: string) {
    const solicitud = await this.prisma.solicitudEdicionNota.findUnique({
      where: { token },
      include: {
        nota: { select: { id: true, folio: true, estatus: true, total: true } },
        solicitante: { select: { id: true, nombre: true, apellidos: true } },
      },
    });
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada');

    const vigente = solicitud.estatus === 'PENDIENTE'
      && !solicitud.token_used_at
      && !!solicitud.token_expires_at
      && solicitud.token_expires_at > new Date();

    const admins = vigente
      ? await this.prisma.usuario.findMany({
          where: { empresa_id: solicitud.empresa_id, rol: 'ADMIN', activo: true },
          select: { id: true, nombre: true, apellidos: true },
        })
      : [];

    return {
      valido: vigente,
      estatus: solicitud.estatus,
      motivo: solicitud.motivo,
      folio: solicitud.nota.folio,
      total: Number(solicitud.nota.total),
      solicitante: solicitud.solicitante,
      admins_disponibles: admins,
    };
  }

  // ─── Aprobar (público, vía token) ──────────────────────────────

  async aprobar(token: string, dto: AprobarSolicitudDto) {
    const solicitud = await this.consumirToken(token);

    const admin = await this.prisma.usuario.findFirst({
      where: { id: dto.aprobador_usuario_id, empresa_id: solicitud.empresa_id, rol: 'ADMIN', activo: true },
    });
    if (!admin) throw new BadRequestException('El aprobador indicado no es un administrador válido de esta empresa');

    await this.prisma.$transaction(async (tx) => {
      const nota = await tx.notaVenta.findUniqueOrThrow({
        where: { id: solicitud.nota_id },
        include: { lineas: true, pagos: true },
      });

      await tx.evidenciaNota.create({
        data: {
          nota_id: nota.id,
          empresa_id: solicitud.empresa_id,
          tipo: 'TICKET_ORIGINAL',
          descripcion: `Snapshot antes de edición autorizada (solicitud ${solicitud.id})`,
          data_json: {
            version: nota.version,
            total: Number(nota.total),
            lineas: nota.lineas.map((l) => ({
              articulo_id: l.articulo_id, clave: l.clave, cantidad: Number(l.cantidad),
              precio_unitario: Number(l.precio_unitario), descuento: Number(l.descuento), subtotal: Number(l.subtotal),
            })),
            pagos: nota.pagos.map((p) => ({ metodo: p.metodo, monto: Number(p.monto), referencia: p.referencia })),
          } as any,
          subido_por_id: admin.id,
        },
      });

      const cargasActivas = await tx.cargaNota.findMany({
        where: { nota_id: nota.id, anulada: false },
        include: { lineas: { include: { linea: true } } },
      });

      for (const carga of cargasActivas) {
        for (const cl of carga.lineas) {
          const art = await tx.articulo.findUnique({ where: { id: cl.linea.articulo_id } });
          if (!art) continue;

          const cantAntes = Number(art.existencia_1 ?? 0);
          const cantDespues = cantAntes + Number(cl.cantidad_cargada);

          await tx.movimientoInventario.create({
            data: {
              ubicacion_id: nota.ubicacion_id,
              articulo_id: art.id,
              tipo: 'ENTRADA',
              existencia_num: 1,
              cantidad: cl.cantidad_cargada,
              cantidad_antes: cantAntes,
              cantidad_despues: cantDespues,
              concepto: `Reversión por edición autorizada — nota #${nota.folio}`,
              referencia_id: nota.id,
              usuario_id: admin.id,
            },
          });

          await tx.articulo.update({ where: { id: art.id }, data: { existencia_1: cantDespues } });
        }

        await tx.cargaNota.update({ where: { id: carga.id }, data: { anulada: true } });
      }

      await tx.notaVenta.update({ where: { id: nota.id }, data: { estatus: 'REABIERTA' } });

      await tx.solicitudEdicionNota.update({
        where: { id: solicitud.id },
        data: { estatus: 'APROBADA', aprobado_por_id: admin.id },
      });
    });

    return { ok: true, nota_id: solicitud.nota_id };
  }

  // ─── Rechazar (público, vía token) ──────────────────────────────

  async rechazar(token: string, dto: RechazarSolicitudDto) {
    const solicitud = await this.consumirToken(token);

    let aprobadoPorId: string | null = null;
    if (dto.aprobador_usuario_id) {
      const admin = await this.prisma.usuario.findFirst({
        where: { id: dto.aprobador_usuario_id, empresa_id: solicitud.empresa_id, rol: 'ADMIN', activo: true },
      });
      aprobadoPorId = admin?.id ?? null;
    }

    await this.prisma.solicitudEdicionNota.update({
      where: { id: solicitud.id },
      data: { estatus: 'RECHAZADA', comentario_admin: dto.comentario_admin ?? null, aprobado_por_id: aprobadoPorId },
    });

    return { ok: true };
  }

  // ─── Privados ────────────────────────────────────────────────────

  private async consumirToken(token: string) {
    const solicitud = await this.prisma.solicitudEdicionNota.findUnique({ where: { token } });
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada');

    if (
      solicitud.estatus !== 'PENDIENTE'
      || solicitud.token_used_at
      || !solicitud.token_expires_at
      || solicitud.token_expires_at < new Date()
    ) {
      throw new BadRequestException('Esta solicitud ya fue procesada o el enlace expiró');
    }

    const { count } = await this.prisma.solicitudEdicionNota.updateMany({
      where: { id: solicitud.id, token_used_at: null },
      data: { token_used_at: new Date() },
    });
    if (count !== 1) {
      throw new BadRequestException('Esta solicitud ya fue procesada');
    }

    return solicitud;
  }
}
