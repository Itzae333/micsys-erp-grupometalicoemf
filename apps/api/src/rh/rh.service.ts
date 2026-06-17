import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAreaDto, UpdateAreaDto,
  CreateEmpleadoDto, UpdateEmpleadoDto,
  RegistrarAsistenciaDto, EditarAsistenciaDto,
  CreateOrdenProduccionDto, AvanceProduccionDto,
} from './dto/rh.dto';

function serializeDecimal(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
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

@Injectable()
export class RhService {
  constructor(private prisma: PrismaService) {}

  // ── Áreas ──────────────────────────────────────────────────

  async listarAreas(empresaId: string, soloActivas = false) {
    const areas = await this.prisma.area.findMany({
      where: {
        empresa_id: empresaId,
        ...(soloActivas ? { activa: true } : {}),
      },
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { empleados: true } } },
    });
    return serializeDecimal(areas);
  }

  async crearArea(dto: CreateAreaDto, empresaId: string) {
    const area = await this.prisma.area.create({
      data: {
        empresa_id: empresaId,
        nombre:     dto.nombre,
        tipo_pago:  dto.tipo_pago as never,
      },
    });
    return serializeDecimal(area);
  }

  async actualizarArea(id: string, dto: UpdateAreaDto, empresaId: string) {
    const area = await this.prisma.area.findFirst({ where: { id, empresa_id: empresaId } });
    if (!area) throw new NotFoundException('Área no encontrada');
    const updated = await this.prisma.area.update({
      where: { id },
      data: {
        ...(dto.nombre    !== undefined && { nombre:    dto.nombre }),
        ...(dto.tipo_pago !== undefined && { tipo_pago: dto.tipo_pago as never }),
        ...(dto.activa    !== undefined && { activa:    dto.activa }),
      },
    });
    return serializeDecimal(updated);
  }

  // ── Empleados ──────────────────────────────────────────────

  async listarEmpleados(
    empresaId: string,
    opts: { q?: string; areaId?: string; activo?: string; page: number; limit: number },
  ) {
    const where: Record<string, unknown> = { empresa_id: empresaId };
    if (opts.activo !== undefined) where.activo = opts.activo === 'true';
    if (opts.areaId) where.area_id = opts.areaId;
    if (opts.q) {
      where.OR = [
        { nombre:    { contains: opts.q, mode: 'insensitive' } },
        { apellidos: { contains: opts.q, mode: 'insensitive' } },
        { puesto:    { contains: opts.q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.empleado.findMany({
        where,
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        orderBy: [{ apellidos: 'asc' }, { nombre: 'asc' }],
        include: {
          area:    { select: { id: true, nombre: true, tipo_pago: true } },
          usuario: { select: { id: true, nombre: true, apellidos: true, email: true, rol: true } },
        },
      }),
      this.prisma.empleado.count({ where }),
    ]);

    return serializeDecimal({
      data,
      total,
      page: opts.page,
      limit: opts.limit,
      pages: Math.ceil(total / opts.limit),
    });
  }

  async getEmpleado(id: string, empresaId: string) {
    const emp = await this.prisma.empleado.findFirst({
      where: { id, empresa_id: empresaId },
      include: {
        area:    { select: { id: true, nombre: true, tipo_pago: true } },
        usuario: { select: { id: true, nombre: true, apellidos: true, email: true, rol: true } },
      },
    });
    if (!emp) throw new NotFoundException('Empleado no encontrado');
    return serializeDecimal(emp);
  }

  async crearEmpleado(dto: CreateEmpleadoDto, empresaId: string) {
    // Validar que area_id pertenece a la empresa
    if (dto.area_id) {
      const area = await this.prisma.area.findFirst({ where: { id: dto.area_id, empresa_id: empresaId } });
      if (!area) throw new BadRequestException('Área no encontrada en esta empresa');
    }
    // Validar que usuario_id pertenece a la empresa y no tiene ya un empleado
    if (dto.usuario_id) {
      const usuario = await this.prisma.usuario.findFirst({ where: { id: dto.usuario_id, empresa_id: empresaId } });
      if (!usuario) throw new BadRequestException('Usuario no encontrado en esta empresa');
      const yaVinculado = await this.prisma.empleado.findFirst({ where: { usuario_id: dto.usuario_id } });
      if (yaVinculado) throw new BadRequestException('Este usuario ya está vinculado a otro empleado');
    }

    const emp = await this.prisma.empleado.create({
      data: {
        empresa_id:           empresaId,
        nombre:               dto.nombre,
        apellidos:            dto.apellidos,
        puesto:               dto.puesto,
        area_id:              dto.area_id ?? null,
        usuario_id:           dto.usuario_id ?? null,
        salario_diario:       dto.salario_diario,
        telefono:             dto.telefono ?? null,
        fecha_ingreso:        new Date(dto.fecha_ingreso),
        descuento_por_30min:  dto.descuento_por_30min  ?? null,
        minimo_piezas_semana: dto.minimo_piezas_semana ?? null,
        sancion_por_pieza:    dto.sancion_por_pieza    ?? null,
      },
      include: {
        area:    { select: { id: true, nombre: true, tipo_pago: true } },
        usuario: { select: { id: true, nombre: true, apellidos: true, email: true, rol: true } },
      },
    });
    return serializeDecimal(emp);
  }

  async actualizarEmpleado(id: string, dto: UpdateEmpleadoDto, empresaId: string) {
    await this.getEmpleado(id, empresaId);

    if (dto.area_id) {
      const area = await this.prisma.area.findFirst({ where: { id: dto.area_id, empresa_id: empresaId } });
      if (!area) throw new BadRequestException('Área no encontrada en esta empresa');
    }
    if (dto.usuario_id) {
      const usuario = await this.prisma.usuario.findFirst({ where: { id: dto.usuario_id, empresa_id: empresaId } });
      if (!usuario) throw new BadRequestException('Usuario no encontrado en esta empresa');
      const yaVinculado = await this.prisma.empleado.findFirst({ where: { usuario_id: dto.usuario_id, NOT: { id } } });
      if (yaVinculado) throw new BadRequestException('Este usuario ya está vinculado a otro empleado');
    }

    const emp = await this.prisma.empleado.update({
      where: { id },
      data: {
        ...(dto.nombre                !== undefined && { nombre:               dto.nombre }),
        ...(dto.apellidos             !== undefined && { apellidos:            dto.apellidos }),
        ...(dto.puesto                !== undefined && { puesto:               dto.puesto }),
        ...(dto.area_id               !== undefined && { area_id:              dto.area_id }),
        ...(dto.usuario_id            !== undefined && { usuario_id:           dto.usuario_id }),
        ...(dto.salario_diario        !== undefined && { salario_diario:       dto.salario_diario }),
        ...(dto.telefono              !== undefined && { telefono:             dto.telefono }),
        ...(dto.fecha_ingreso         !== undefined && { fecha_ingreso:        new Date(dto.fecha_ingreso) }),
        ...(dto.descuento_por_30min   !== undefined && { descuento_por_30min:  dto.descuento_por_30min }),
        ...(dto.minimo_piezas_semana  !== undefined && { minimo_piezas_semana: dto.minimo_piezas_semana }),
        ...(dto.sancion_por_pieza     !== undefined && { sancion_por_pieza:    dto.sancion_por_pieza }),
      },
      include: {
        area:    { select: { id: true, nombre: true, tipo_pago: true } },
        usuario: { select: { id: true, nombre: true, apellidos: true, email: true, rol: true } },
      },
    });
    return serializeDecimal(emp);
  }

  async toggleEmpleado(id: string, empresaId: string) {
    const emp = await this.getEmpleado(id, empresaId) as { activo: boolean };
    const updated = await this.prisma.empleado.update({
      where: { id },
      data: { activo: !emp.activo },
    });
    return serializeDecimal(updated);
  }

  // ── Asistencia ─────────────────────────────────────────────

  async listarAsistencia(
    empresaId: string,
    opts: { empleadoId?: string; fecha?: string; page: number; limit: number },
  ) {
    const where: Record<string, unknown> = { empresa_id: empresaId };
    if (opts.empleadoId) where.empleado_id = opts.empleadoId;
    if (opts.fecha)      where.fecha = new Date(opts.fecha);

    const [data, total] = await Promise.all([
      this.prisma.registroAsistencia.findMany({
        where,
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        orderBy: [{ fecha: 'desc' }, { created_at: 'desc' }],
        include: {
          empleado: { select: { id: true, nombre: true, apellidos: true, puesto: true } },
          area:     { select: { id: true, nombre: true, tipo_pago: true } },
          usuario:  { select: { id: true, nombre: true, apellidos: true } },
        },
      }),
      this.prisma.registroAsistencia.count({ where }),
    ]);

    return serializeDecimal({ data, total, page: opts.page, limit: opts.limit, pages: Math.ceil(total / opts.limit) });
  }

  async registrarAsistencia(dto: RegistrarAsistenciaDto, empresaId: string, usuarioId: string) {
    const emp = await this.prisma.empleado.findFirst({
      where: { id: dto.empleado_id, empresa_id: empresaId },
    });
    if (!emp) throw new NotFoundException('Empleado no encontrado en esta empresa');

    // Determinar el área efectiva: la del DTO o la del empleado
    const areaId = dto.area_id ?? emp.area_id ?? null;

    // Calcular sanción automática
    let sancionMonto: number | null = null;
    let sancionConcepto: string | null = null;

    if (areaId && (dto.minutos_tarde ?? 0) > 0 && emp.descuento_por_30min) {
      const area = await this.prisma.area.findUnique({ where: { id: areaId } });
      if (area?.tipo_pago === 'POR_HORA') {
        const bloques = Math.floor((dto.minutos_tarde ?? 0) / 30);
        if (bloques > 0) {
          const descuento = Number(emp.descuento_por_30min);
          sancionMonto    = +(bloques * descuento).toFixed(2);
          sancionConcepto = `Tardanza ${dto.minutos_tarde} min (${bloques} bloque${bloques > 1 ? 's' : ''} x $${descuento.toFixed(2)})`;
        }
      }
    }

    const reg = await this.prisma.registroAsistencia.upsert({
      where: { empleado_id_fecha: { empleado_id: dto.empleado_id, fecha: new Date(dto.fecha) } },
      create: {
        empresa_id:        empresaId,
        empleado_id:       dto.empleado_id,
        area_id:           areaId,
        fecha:             new Date(dto.fecha),
        hora_entrada:      dto.hora_entrada ? new Date(dto.hora_entrada) : null,
        hora_salida:       dto.hora_salida  ? new Date(dto.hora_salida)  : null,
        estatus:           dto.estatus as never,
        minutos_tarde:     dto.minutos_tarde ?? null,
        piezas_realizadas: dto.piezas_realizadas ?? null,
        sancion_monto:     sancionMonto,
        sancion_concepto:  sancionConcepto,
        observaciones:     dto.observaciones ?? null,
        usuario_id:        usuarioId,
      },
      update: {
        area_id:           areaId,
        hora_entrada:      dto.hora_entrada ? new Date(dto.hora_entrada) : null,
        hora_salida:       dto.hora_salida  ? new Date(dto.hora_salida)  : null,
        estatus:           dto.estatus as never,
        minutos_tarde:     dto.minutos_tarde ?? null,
        piezas_realizadas: dto.piezas_realizadas ?? null,
        sancion_monto:     sancionMonto,
        sancion_concepto:  sancionConcepto,
        observaciones:     dto.observaciones ?? null,
        usuario_id:        usuarioId,
      },
      include: {
        empleado: { select: { id: true, nombre: true, apellidos: true } },
        area:     { select: { id: true, nombre: true, tipo_pago: true } },
      },
    });
    return serializeDecimal(reg);
  }

  async editarAsistencia(id: string, dto: EditarAsistenciaDto, empresaId: string) {
    const reg = await this.prisma.registroAsistencia.findFirst({ where: { id, empresa_id: empresaId } });
    if (!reg) throw new NotFoundException('Registro no encontrado');

    // Recalcular sanción si cambian minutos_tarde o area_id
    let sancionMonto   = reg.sancion_monto   !== null ? Number(reg.sancion_monto)   : null;
    let sancionConcepto = reg.sancion_concepto ?? null;

    const areaId = dto.area_id ?? reg.area_id;
    const minutosTarde = dto.minutos_tarde ?? (reg.minutos_tarde ?? 0);

    if (areaId && minutosTarde > 0 && (dto.area_id !== undefined || dto.minutos_tarde !== undefined)) {
      const area = await this.prisma.area.findUnique({ where: { id: areaId } });
      if (area?.tipo_pago === 'POR_HORA') {
        const empFull = await this.prisma.empleado.findUnique({ where: { id: reg.empleado_id } });
        if (empFull?.descuento_por_30min) {
          const descuento = Number(empFull.descuento_por_30min);
          const bloques   = Math.floor(minutosTarde / 30);
          sancionMonto    = bloques > 0 ? +(bloques * descuento).toFixed(2) : null;
          sancionConcepto = bloques > 0
            ? `Tardanza ${minutosTarde} min (${bloques} bloque${bloques > 1 ? 's' : ''} x $${descuento.toFixed(2)})`
            : null;
        }
      }
    }

    const updated = await this.prisma.registroAsistencia.update({
      where: { id },
      data: {
        ...(dto.area_id           !== undefined && { area_id:           dto.area_id }),
        ...(dto.hora_entrada      !== undefined && { hora_entrada:      dto.hora_entrada ? new Date(dto.hora_entrada) : null }),
        ...(dto.hora_salida       !== undefined && { hora_salida:       dto.hora_salida  ? new Date(dto.hora_salida)  : null }),
        ...(dto.estatus           !== undefined && { estatus:           dto.estatus as never }),
        ...(dto.minutos_tarde     !== undefined && { minutos_tarde:     dto.minutos_tarde, sancion_monto: sancionMonto, sancion_concepto: sancionConcepto }),
        ...(dto.piezas_realizadas !== undefined && { piezas_realizadas: dto.piezas_realizadas }),
        ...(dto.observaciones     !== undefined && { observaciones:     dto.observaciones }),
      },
      include: {
        empleado: { select: { id: true, nombre: true, apellidos: true } },
        area:     { select: { id: true, nombre: true, tipo_pago: true } },
      },
    });
    return serializeDecimal(updated);
  }

  // ── Producción ─────────────────────────────────────────────

  async listarOrdenes(
    empresaId: string,
    opts: { estatus?: string; articuloId?: string; page: number; limit: number },
  ) {
    const where: Record<string, unknown> = { empresa_id: empresaId };
    if (opts.estatus)    where.estatus     = opts.estatus;
    if (opts.articuloId) where.articulo_id = opts.articuloId;

    const [data, total] = await Promise.all([
      this.prisma.ordenProduccion.findMany({
        where,
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        orderBy: { created_at: 'desc' },
        include: {
          articulo: { select: { id: true, clave: true, descripcion_1: true, descripcion_2: true } },
          usuario:  { select: { id: true, nombre: true, apellidos: true } },
        },
      }),
      this.prisma.ordenProduccion.count({ where }),
    ]);

    return serializeDecimal({ data, total, page: opts.page, limit: opts.limit, pages: Math.ceil(total / opts.limit) });
  }

  async getOrden(id: string, empresaId: string) {
    const op = await this.prisma.ordenProduccion.findFirst({
      where: { id, empresa_id: empresaId },
      include: {
        articulo: { select: { id: true, clave: true, descripcion_1: true, descripcion_2: true } },
        usuario:  { select: { id: true, nombre: true, apellidos: true } },
      },
    });
    if (!op) throw new NotFoundException('Orden de producción no encontrada');
    return serializeDecimal(op);
  }

  async crearOrden(dto: CreateOrdenProduccionDto, empresaId: string, usuarioId: string) {
    const articulo = await this.prisma.articulo.findFirst({ where: { id: dto.articulo_id } });
    if (!articulo) throw new NotFoundException('Artículo no encontrado');

    const op = await this.prisma.$transaction(async (tx) => {
      const agg = await tx.ordenProduccion.aggregate({ where: { empresa_id: empresaId }, _max: { folio: true } });
      const folio = (agg._max.folio ?? 0) + 1;

      return tx.ordenProduccion.create({
        data: {
          folio,
          empresa_id:        empresaId,
          articulo_id:       dto.articulo_id,
          existencia_num:    dto.existencia_num,
          cantidad_objetivo: dto.cantidad_objetivo,
          estatus:           'ABIERTA',
          fecha_inicio:      new Date(dto.fecha_inicio),
          observaciones:     dto.observaciones ?? null,
          usuario_id:        usuarioId,
        },
        include: {
          articulo: { select: { id: true, clave: true, descripcion_1: true, descripcion_2: true } },
        },
      });
    });

    return serializeDecimal(op);
  }

  async registrarAvance(id: string, dto: AvanceProduccionDto, empresaId: string, usuarioId: string) {
    const op = await this.prisma.ordenProduccion.findFirst({
      where: { id, empresa_id: empresaId },
      include: { articulo: true },
    });
    if (!op) throw new NotFoundException('Orden de producción no encontrada');
    if (op.estatus === 'COMPLETADA' || op.estatus === 'CANCELADA') {
      throw new BadRequestException(`No se puede registrar avance en una OP ${op.estatus}`);
    }

    const existenciaKey = `existencia_${op.existencia_num}` as keyof typeof op.articulo;
    const existenciaActual = Number((op.articulo[existenciaKey] as { toNumber?(): number } | null)?.toNumber?.() ?? op.articulo[existenciaKey] ?? 0);

    const nuevaExistencia = existenciaActual + dto.cantidad;
    const nuevaProducida  = Number(op.cantidad_producida.toNumber()) + dto.cantidad;
    const objetivo        = Number(op.cantidad_objetivo.toNumber());
    const nuevoEstatus    = nuevaProducida >= objetivo ? 'COMPLETADA' : 'EN_PROCESO';

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.articulo.update({
        where: { id: op.articulo_id },
        data: { [existenciaKey]: nuevaExistencia },
      });

      await tx.movimientoInventario.create({
        data: {
          ubicacion_id:     op.articulo.ubicacion_id,
          articulo_id:      op.articulo_id,
          tipo:             'ENTRADA',
          existencia_num:   op.existencia_num,
          cantidad:         dto.cantidad,
          cantidad_antes:   existenciaActual,
          cantidad_despues: nuevaExistencia,
          concepto:         `Producción OP-${op.folio}`,
          referencia_id:    op.id,
          usuario_id:       usuarioId,
        },
      });

      return tx.ordenProduccion.update({
        where: { id },
        data: {
          cantidad_producida: nuevaProducida,
          estatus:            nuevoEstatus as never,
          ...(nuevoEstatus === 'COMPLETADA' && { fecha_cierre: new Date() }),
        },
        include: {
          articulo: { select: { id: true, clave: true, descripcion_1: true, descripcion_2: true } },
        },
      });
    });

    return serializeDecimal(result);
  }

  async cerrarOrden(id: string, empresaId: string) {
    const op = await this.prisma.ordenProduccion.findFirst({ where: { id, empresa_id: empresaId } });
    if (!op) throw new NotFoundException('Orden de producción no encontrada');
    if (op.estatus === 'CANCELADA')   throw new BadRequestException('No se puede cerrar una OP cancelada');
    if (op.estatus === 'COMPLETADA')  throw new BadRequestException('La OP ya está completada');

    const updated = await this.prisma.ordenProduccion.update({
      where: { id },
      data: { estatus: 'COMPLETADA', fecha_cierre: new Date() },
    });
    return serializeDecimal(updated);
  }

  async cancelarOrden(id: string, empresaId: string) {
    const op = await this.prisma.ordenProduccion.findFirst({ where: { id, empresa_id: empresaId } });
    if (!op) throw new NotFoundException('Orden de producción no encontrada');
    if (op.estatus === 'COMPLETADA') throw new BadRequestException('No se puede cancelar una OP ya completada');

    const updated = await this.prisma.ordenProduccion.update({ where: { id }, data: { estatus: 'CANCELADA' } });
    return serializeDecimal(updated);
  }

  // ── Nómina ─────────────────────────────────────────────────

  async getNomina(empresaId: string, opts: { desde?: string; hasta?: string }) {
    const desde = opts.desde ? new Date(opts.desde) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const hasta = opts.hasta
      ? new Date(new Date(opts.hasta).setHours(23, 59, 59, 999))
      : new Date(new Date().setHours(23, 59, 59, 999));

    const empleados = await this.prisma.empleado.findMany({
      where: { empresa_id: empresaId, activo: true },
      include: { area: { select: { id: true, nombre: true, tipo_pago: true } } },
      orderBy: [{ apellidos: 'asc' }, { nombre: 'asc' }],
    });

    const resultados = await Promise.all(
      empleados.map(async (emp) => {
        const registros = await this.prisma.registroAsistencia.findMany({
          where: {
            empresa_id:  empresaId,
            empleado_id: emp.id,
            fecha:       { gte: desde, lte: hasta },
          },
          select: {
            fecha:           true,
            estatus:         true,
            minutos_tarde:   true,
            sancion_monto:   true,
            sancion_concepto: true,
          },
        });

        const diasTrabajados = registros.filter(
          (r) => r.estatus === 'PRESENTE' || r.estatus === 'TARDANZA',
        ).length;

        const totalSanciones = registros.reduce(
          (s, r) => s + Number(r.sancion_monto ?? 0), 0,
        );

        const salarioDiario = Number(emp.salario_diario);
        const salarioBase   = +(salarioDiario * diasTrabajados).toFixed(2);
        const totalAPagar   = +Math.max(0, salarioBase - totalSanciones).toFixed(2);

        return {
          empleado: {
            id:       emp.id,
            nombre:   emp.nombre,
            apellidos: emp.apellidos,
            puesto:   emp.puesto,
            area:     emp.area,
            salario_diario: salarioDiario,
          },
          dias_trabajados: diasTrabajados,
          total_registros: registros.length,
          salario_base:    salarioBase,
          total_sanciones: +totalSanciones.toFixed(2),
          total_a_pagar:   totalAPagar,
          detalle:         registros.map((r) => ({
            fecha:           r.fecha,
            estatus:         r.estatus,
            minutos_tarde:   r.minutos_tarde,
            sancion_monto:   Number(r.sancion_monto ?? 0),
            sancion_concepto: r.sancion_concepto,
          })),
        };
      }),
    );

    const totalNomina = +resultados.reduce((s, e) => s + e.total_a_pagar, 0).toFixed(2);

    return {
      desde:        desde.toISOString().slice(0, 10),
      hasta:        hasta.toISOString().slice(0, 10),
      empleados:    resultados,
      total_nomina: totalNomina,
    };
  }
}
