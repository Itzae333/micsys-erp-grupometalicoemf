import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type {
  CrearSolicitudAbonoDto,
  AprobarSolicitudAbonoDto,
  RechazarSolicitudAbonoDto,
} from './dto/solicitudes-abono.dto';
import type { Prisma } from '@grupometalicoemf/database';

const TOKEN_VIGENCIA_HORAS = 72;

const PAGO_INCLUDE = {
  nota: { include: { ubicacion: { select: { empresa_id: true, nombre: true } } } },
  movimiento_cuenta: true,
} satisfies Prisma.PagoInclude;

type PagoConNotaYMovimiento = Prisma.PagoGetPayload<{ include: typeof PAGO_INCLUDE }>;

/**
 * Solicitud de edición/eliminación de UN abono puntual (no de la nota completa).
 *
 * Alcance v1 (deliberadamente limitado, ver plan): solo se puede pedir editar o
 * eliminar un abono si es el movimiento MÁS RECIENTE en la cuenta del cliente y
 * si se registró con UN SOLO método de pago. Fuera de eso se bloquea y sigue
 * requiriendo un ajuste manual — recalcular la cadena completa de movimientos
 * posteriores, o desarmar un abono multi-método, quedó fuera de alcance por
 * complejidad/riesgo sobre datos de cuentas de clientes.
 */
@Injectable()
export class SolicitudesAbonoService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // ─── Crear solicitud (vendedor/encargado/admin) ────────────────

  async crear(pagoId: string, ubicacionId: string, solicitanteId: string, dto: CrearSolicitudAbonoDto) {
    const pago = await this.cargarPago(this.prisma, pagoId);
    if (pago.nota.ubicacion_id !== ubicacionId) throw new NotFoundException('Abono no encontrado');
    await this.validarEditable(this.prisma, pago);

    const existente = await this.prisma.solicitudEdicionAbono.findFirst({
      where: { pago_id: pagoId, estatus: 'PENDIENTE' },
    });
    if (existente) {
      throw new BadRequestException('Ya existe una solicitud pendiente para este abono');
    }

    this.validarDatosAccion(dto);

    const token = randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + TOKEN_VIGENCIA_HORAS * 60 * 60 * 1000);
    const empresaId = pago.nota.ubicacion.empresa_id;

    const solicitud = await this.prisma.solicitudEdicionAbono.create({
      data: {
        pago_id: pagoId,
        nota_id: pago.nota_id,
        empresa_id: empresaId,
        solicitante_id: solicitanteId,
        motivo: dto.motivo,
        accion: dto.accion,
        monto_anterior: pago.monto,
        metodo_anterior: pago.metodo,
        referencia_anterior: pago.referencia,
        nuevo_monto: dto.accion === 'EDITAR' ? dto.nuevo_monto : null,
        nuevo_metodo: dto.accion === 'EDITAR' ? dto.nuevo_metodo : null,
        nueva_referencia: dto.accion === 'EDITAR' ? (dto.nueva_referencia ?? null) : null,
        token,
        token_expires_at: tokenExpiresAt,
      },
    });

    const admins = await this.prisma.usuario.findMany({
      where: { empresa_id: empresaId, rol: 'ADMIN', activo: true },
      select: { email: true, nombre: true },
    });

    const frontendUrl = process.env.APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontendUrl}/aprobaciones/edicion-abono/${token}`;
    const folioStr = `#${String(pago.nota.folio).padStart(4, '0')}`;
    const accionLabel = dto.accion === 'ELIMINAR' ? 'eliminar' : 'editar';

    let notificados = 0;
    for (const admin of admins) {
      const enviado = await this.mail.send({
        to: admin.email,
        subject: `Solicitud de ${accionLabel} abono — Nota ${folioStr} (${pago.nota.ubicacion.nombre})`,
        html: `
          <p>Hola ${admin.nombre},</p>
          <p>Se solicitó ${accionLabel} un abono de la nota <strong>${folioStr}</strong> en <strong>${pago.nota.ubicacion.nombre}</strong>.</p>
          <p><strong>Motivo:</strong> ${dto.motivo}</p>
          <p><a href="${link}">Haz clic aquí para revisar y autorizar/rechazar</a></p>
          <p>Este enlace expira en ${TOKEN_VIGENCIA_HORAS} horas.</p>
        `,
      });
      if (enviado) notificados++;
    }

    // Igual que en solicitudes de edición de nota: sin nadie notificado, la
    // solicitud no tiene sentido dejarla viva.
    if (notificados === 0) {
      await this.prisma.solicitudEdicionAbono.delete({ where: { id: solicitud.id } });
      throw new BadRequestException(
        admins.length === 0
          ? 'No hay administradores activos para notificar — la solicitud no se creó.'
          : 'No se pudo notificar a ningún administrador por correo — la solicitud no se creó. Avisa a soporte para revisar la configuración de correo.',
      );
    }

    return { ok: true, solicitud_id: solicitud.id, admins_notificados: notificados };
  }

  async listarPorPago(pagoId: string, ubicacionId: string) {
    const pago = await this.prisma.pago.findFirst({ where: { id: pagoId, nota: { ubicacion_id: ubicacionId } } });
    if (!pago) throw new NotFoundException('Abono no encontrado');

    return this.prisma.solicitudEdicionAbono.findMany({
      where: { pago_id: pagoId },
      orderBy: { created_at: 'desc' },
      include: {
        solicitante: { select: { id: true, nombre: true, apellidos: true } },
        aprobado_por: { select: { id: true, nombre: true, apellidos: true } },
      },
    });
  }

  // ─── Consulta pública por token ─────────────────────────────────

  async obtenerPorToken(token: string) {
    const solicitud = await this.prisma.solicitudEdicionAbono.findUnique({
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
      accion: solicitud.accion,
      folio: solicitud.nota.folio,
      monto_actual: Number(solicitud.monto_anterior),
      metodo_actual: solicitud.metodo_anterior,
      referencia_actual: solicitud.referencia_anterior,
      nuevo_monto: solicitud.nuevo_monto !== null ? Number(solicitud.nuevo_monto) : null,
      nuevo_metodo: solicitud.nuevo_metodo,
      nueva_referencia: solicitud.nueva_referencia,
      solicitante: solicitud.solicitante,
      admins_disponibles: admins,
    };
  }

  // ─── Aprobar (público, vía token) ──────────────────────────────

  async aprobar(token: string, dto: AprobarSolicitudAbonoDto) {
    const solicitud = await this.consumirToken(token);

    const admin = await this.prisma.usuario.findFirst({
      where: { id: dto.aprobador_usuario_id, empresa_id: solicitud.empresa_id, rol: 'ADMIN', activo: true },
    });
    if (!admin) throw new BadRequestException('El aprobador indicado no es un administrador válido de esta empresa');

    // pago_id solo es null después de que un ELIMINAR ya se aprobó — una
    // solicitud recién consumida por consumirToken() siempre lo trae.
    const pagoId = solicitud.pago_id;
    if (!pagoId) throw new BadRequestException('Esta solicitud ya no tiene un abono asociado');

    // Validado FUERA de la transacción: si el estado ya no es válido (p. ej. se
    // registró un movimiento posterior mientras la solicitud esperaba correo),
    // se marca RECHAZADA y punto — no puede vivir dentro de la misma transacción
    // que aplica el cambio, porque un throw ahí revertiría también el rechazo.
    const pago = await this.cargarPago(this.prisma, pagoId);
    try {
      await this.validarEditable(this.prisma, pago);
    } catch (err) {
      await this.prisma.solicitudEdicionAbono.update({
        where: { id: solicitud.id },
        data: {
          estatus: 'RECHAZADA',
          comentario_admin: `Rechazada automáticamente: ${err instanceof Error ? err.message : 'ya no se puede aplicar'}`,
        },
      });
      throw err;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.aplicarCambio(
        tx,
        pagoId,
        solicitud.accion,
        solicitud.nuevo_monto !== null ? Number(solicitud.nuevo_monto) : null,
        solicitud.nuevo_metodo,
        solicitud.nueva_referencia,
      );

      await tx.solicitudEdicionAbono.update({
        where: { id: solicitud.id },
        data: { estatus: 'APROBADA', aprobado_por_id: admin.id },
      });
    });

    return { ok: true, nota_id: solicitud.nota_id };
  }

  // ─── Apertura directa (ADMIN, sin correo ni token) ──────────────

  async aperturarDirecto(pagoId: string, ubicacionId: string, adminId: string, dto: CrearSolicitudAbonoDto) {
    const pago = await this.cargarPago(this.prisma, pagoId);
    if (pago.nota.ubicacion_id !== ubicacionId) throw new NotFoundException('Abono no encontrado');
    await this.validarEditable(this.prisma, pago);
    this.validarDatosAccion(dto);

    const empresaId = pago.nota.ubicacion.empresa_id;

    return this.prisma.$transaction(async (tx) => {
      // Si un vendedor/encargado ya tenía una solicitud pendiente para este
      // abono, el admin la resuelve al aplicar directo.
      await tx.solicitudEdicionAbono.updateMany({
        where: { pago_id: pagoId, estatus: 'PENDIENTE' },
        data: {
          estatus: 'APROBADA',
          aprobado_por_id: adminId,
          comentario_admin: 'Aplicado directamente por un administrador',
        },
      });

      const solicitud = await tx.solicitudEdicionAbono.create({
        data: {
          pago_id: pagoId,
          nota_id: pago.nota_id,
          empresa_id: empresaId,
          solicitante_id: adminId,
          motivo: dto.motivo,
          accion: dto.accion,
          monto_anterior: pago.monto,
          metodo_anterior: pago.metodo,
          referencia_anterior: pago.referencia,
          nuevo_monto: dto.accion === 'EDITAR' ? dto.nuevo_monto : null,
          nuevo_metodo: dto.accion === 'EDITAR' ? dto.nuevo_metodo : null,
          nueva_referencia: dto.accion === 'EDITAR' ? (dto.nueva_referencia ?? null) : null,
          estatus: 'APROBADA',
          aprobado_por_id: adminId,
        },
      });

      await this.aplicarCambio(tx, pagoId, dto.accion, dto.nuevo_monto ?? null, dto.nuevo_metodo ?? null, dto.nueva_referencia ?? null);

      return { ok: true, nota_id: pago.nota_id, solicitud_id: solicitud.id };
    });
  }

  // ─── Rechazar (público, vía token) ──────────────────────────────

  async rechazar(token: string, dto: RechazarSolicitudAbonoDto) {
    const solicitud = await this.consumirToken(token);

    let aprobadoPorId: string | null = null;
    if (dto.aprobador_usuario_id) {
      const admin = await this.prisma.usuario.findFirst({
        where: { id: dto.aprobador_usuario_id, empresa_id: solicitud.empresa_id, rol: 'ADMIN', activo: true },
      });
      aprobadoPorId = admin?.id ?? null;
    }

    await this.prisma.solicitudEdicionAbono.update({
      where: { id: solicitud.id },
      data: { estatus: 'RECHAZADA', comentario_admin: dto.comentario_admin ?? null, aprobado_por_id: aprobadoPorId },
    });

    return { ok: true };
  }

  // ─── Privados ────────────────────────────────────────────────────

  private async cargarPago(client: Prisma.TransactionClient, pagoId: string): Promise<PagoConNotaYMovimiento> {
    const pago = await client.pago.findUnique({ where: { id: pagoId }, include: PAGO_INCLUDE });
    if (!pago) throw new NotFoundException('Abono no encontrado');
    return pago;
  }

  private validarDatosAccion(dto: CrearSolicitudAbonoDto) {
    if (dto.accion === 'EDITAR' && (!dto.nuevo_monto || !dto.nuevo_metodo)) {
      throw new BadRequestException('Para editar un abono debes indicar el nuevo monto y método');
    }
  }

  /** Reglas del alcance v1: nota en estatus editable, abono trazado, sin "hermanos" (multi-método) y sin movimientos posteriores en la cuenta del cliente. */
  private async validarEditable(client: Prisma.TransactionClient, pago: PagoConNotaYMovimiento) {
    if (!['CREDITO', 'PAGADA'].includes(pago.nota.estatus)) {
      throw new ForbiddenException(`No se puede editar un abono de una nota en estatus ${pago.nota.estatus}`);
    }
    if (!pago.movimiento_cuenta_id || !pago.movimiento_cuenta) {
      throw new BadRequestException(
        'Este abono es anterior a esta función y no puede editarse aquí — contacta a soporte para un ajuste manual.',
      );
    }

    const hermanos = await client.pago.count({ where: { movimiento_cuenta_id: pago.movimiento_cuenta_id } });
    if (hermanos > 1) {
      throw new BadRequestException(
        'Este abono se cobró junto con otro método de pago en la misma operación; no se puede editar individualmente.',
      );
    }

    const posterior = await client.movimientoCuenta.findFirst({
      where: {
        cliente_id: pago.movimiento_cuenta.cliente_id,
        created_at: { gt: pago.movimiento_cuenta.created_at },
      },
    });
    if (posterior) {
      throw new BadRequestException(
        'Ya se registraron movimientos posteriores en la cuenta de este cliente; no se puede editar este abono.',
      );
    }
  }

  /** Aplica EDITAR/ELIMINAR sobre el pago+movimiento+cliente+nota, dentro de una transacción. Asume que ya se validó `validarEditable`. */
  private async aplicarCambio(
    tx: Prisma.TransactionClient,
    pagoId: string,
    accion: 'EDITAR' | 'ELIMINAR',
    nuevoMonto: number | null,
    nuevoMetodo: string | null,
    nuevaReferencia: string | null,
  ) {
    const pago = await tx.pago.findUniqueOrThrow({
      where: { id: pagoId },
      include: { nota: true, movimiento_cuenta: true },
    });
    const movimiento = pago.movimiento_cuenta!;

    const pagosAnteriores = await tx.pago.findMany({
      where: { nota_id: pago.nota_id, created_at: { lt: movimiento.created_at } },
    });
    const totalAnterior = pagosAnteriores.reduce((s, p) => s + Number(p.monto), 0);
    const saldoNotaAlMomento = +(Number(pago.nota.total) - totalAnterior).toFixed(2);

    if (accion === 'ELIMINAR') {
      await tx.pago.delete({ where: { id: pago.id } });
      await tx.movimientoCuenta.delete({ where: { id: movimiento.id } });
      await tx.cliente.update({ where: { id: movimiento.cliente_id }, data: { saldo_pendiente: movimiento.saldo_antes } });
    } else {
      const abonoRealNuevo = Math.min(nuevoMonto!, saldoNotaAlMomento);
      const saldoDespuesNuevo = Math.max(0, +(Number(movimiento.saldo_antes) - abonoRealNuevo).toFixed(2));

      await tx.pago.update({
        where: { id: pago.id },
        data: { monto: nuevoMonto!, metodo: nuevoMetodo as Prisma.PagoUpdateInput['metodo'], referencia: nuevaReferencia },
      });
      await tx.movimientoCuenta.update({
        where: { id: movimiento.id },
        data: { monto: abonoRealNuevo, saldo_despues: saldoDespuesNuevo },
      });
      await tx.cliente.update({ where: { id: movimiento.cliente_id }, data: { saldo_pendiente: saldoDespuesNuevo } });
    }

    const pagosFinales = await tx.pago.findMany({ where: { nota_id: pago.nota_id } });
    const totalPagadoFinal = pagosFinales.reduce((s, p) => s + Number(p.monto), 0);
    const nuevoEstatus = totalPagadoFinal >= Number(pago.nota.total) ? 'PAGADA' : 'CREDITO';
    await tx.notaVenta.update({ where: { id: pago.nota_id }, data: { estatus: nuevoEstatus } });
  }

  private async consumirToken(token: string) {
    const solicitud = await this.prisma.solicitudEdicionAbono.findUnique({ where: { token } });
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada');

    if (
      solicitud.estatus !== 'PENDIENTE'
      || solicitud.token_used_at
      || !solicitud.token_expires_at
      || solicitud.token_expires_at < new Date()
    ) {
      throw new BadRequestException('Esta solicitud ya fue procesada o el enlace expiró');
    }

    const { count } = await this.prisma.solicitudEdicionAbono.updateMany({
      where: { id: solicitud.id, token_used_at: null },
      data: { token_used_at: new Date() },
    });
    if (count !== 1) {
      throw new BadRequestException('Esta solicitud ya fue procesada');
    }

    return solicitud;
  }
}
