import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Prisma } from '@grupometalicoemf/database';
import { PrismaService } from '../prisma/prisma.service';
import { getExistencia, buildExistenciaUpdate } from '../common/utils/existencia';
import { inicioDiaMx, finDiaMx } from '../common/utils/fecha-mx';
import type { CreateEntregaDto, CreateDevolucionDto, TipoDevolucion } from './dto/entregas-materia-prima.dto';

// Devoluciones que regresan la pieza al almacén (suben existencia). MERMA y
// DEFECTUOSO no regresan: quedan imputadas al área como pérdida.
const REGRESA_EXISTENCIA: TipoDevolucion[] = ['SOBRANTE', 'ERROR_ENTREGA'];

// Las cantidades son Decimal(12,3): se redondea a 3 decimales para comparar.
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const ENTREGA_INCLUDE = {
  area:       { select: { id: true, nombre: true } },
  empleado:   { select: { id: true, nombre: true, apellidos: true } },
  entregador: { select: { id: true, nombre: true, apellidos: true } },
  lineas: {
    include: {
      articulo:     { select: { id: true, clave: true, descripcion_1: true, descripcion_2: true } },
      devoluciones: true,
    },
  },
  devoluciones: {
    orderBy: { fecha: 'desc' },
    include: {
      registrador: { select: { id: true, nombre: true, apellidos: true } },
      lineas:      true,
    },
  },
} satisfies Prisma.EntregaMateriaPrimaInclude;

type EntregaRaw = Prisma.EntregaMateriaPrimaGetPayload<{ include: typeof ENTREGA_INCLUDE }>;

@Injectable()
export class EntregasMateriaPrimaService {
  constructor(private prisma: PrismaService) {}

  // ─── Listar / detalle ─────────────────────────────────────────

  async listar(ubicacionId: string, q: {
    areaId?: string; empleadoId?: string; articuloId?: string;
    desde?: string; hasta?: string; estatus?: string; page?: number; limit?: number;
  } = {}) {
    const { page = 1, limit = 50 } = q;
    const where: Prisma.EntregaMateriaPrimaWhereInput = { ubicacion_id: ubicacionId };
    if (q.areaId)     where.area_id = q.areaId;
    if (q.empleadoId) where.empleado_id = q.empleadoId;
    if (q.estatus === 'ACTIVA' || q.estatus === 'CANCELADA') where.estatus = q.estatus;
    if (q.articuloId) where.lineas = { some: { articulo_id: q.articuloId } };
    if (q.desde || q.hasta) {
      where.fecha = {
        ...(q.desde && { gte: inicioDiaMx(q.desde) }),
        ...(q.hasta && { lte: finDiaMx(q.hasta) }),
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.entregaMateriaPrima.count({ where }),
      this.prisma.entregaMateriaPrima.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { fecha: 'desc' },
        include: ENTREGA_INCLUDE,
      }),
    ]);

    return { data: data.map((e) => this.serialize(e)), total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, ubicacionId: string) {
    const e = await this.prisma.entregaMateriaPrima.findFirst({
      where: { id, ubicacion_id: ubicacionId },
      include: ENTREGA_INCLUDE,
    });
    if (!e) throw new NotFoundException('Entrega no encontrada');
    return this.serialize(e);
  }

  // ─── Crear entrega (descuenta inventario) ─────────────────────

  async crear(dto: CreateEntregaDto, empresaId: string, ubicacionId: string, usuarioId: string) {
    const area = await this.prisma.area.findFirst({ where: { id: dto.area_id, empresa_id: empresaId } });
    if (!area) throw new BadRequestException('Área no encontrada en esta empresa');
    if (!area.activa) throw new BadRequestException('El área está inactiva');

    let empleadoNombre = '';
    if (dto.empleado_id) {
      const emp = await this.prisma.empleado.findFirst({ where: { id: dto.empleado_id, empresa_id: empresaId } });
      if (!emp) throw new BadRequestException('Empleado no encontrado en esta empresa');
      empleadoNombre = ` — ${emp.nombre} ${emp.apellidos}`;
    }
    const concepto = `Entrega a ${area.nombre}${empleadoNombre}`;

    return this.prisma.$transaction(async (tx) => {
      const entrega = await tx.entregaMateriaPrima.create({
        data: {
          empresa_id:    empresaId,
          ubicacion_id:  ubicacionId,
          area_id:       dto.area_id,
          empleado_id:   dto.empleado_id ?? null,
          entregado_por: usuarioId,
          observaciones: dto.observaciones ?? null,
        },
      });

      for (const l of dto.lineas) {
        // Se relee el artículo en cada línea: si el mismo artículo/slot aparece
        // dos veces, la segunda ya ve la existencia descontada por la primera.
        const articulo = await tx.articulo.findFirst({ where: { id: l.articulo_id, ubicacion_id: ubicacionId } });
        if (!articulo) throw new NotFoundException('Artículo no encontrado en esta ubicación');
        if (!articulo.activo) throw new BadRequestException(`El artículo ${articulo.clave} está inactivo`);

        const antes = getExistencia(articulo, l.existencia_num);
        if (r3(l.cantidad) > r3(antes)) {
          throw new BadRequestException(
            `Existencia insuficiente de ${articulo.clave}: hay ${antes} y se piden ${l.cantidad}`,
          );
        }
        const despues = r3(antes - l.cantidad);

        const mov = await tx.movimientoInventario.create({
          data: {
            ubicacion_id:     ubicacionId,
            articulo_id:      l.articulo_id,
            tipo:             'SALIDA',
            existencia_num:   l.existencia_num,
            cantidad:         l.cantidad,
            cantidad_antes:   antes,
            cantidad_despues: despues,
            concepto,
            referencia_id:    entrega.id,
            usuario_id:       usuarioId,
          },
        });
        await tx.articulo.update({
          where: { id: l.articulo_id },
          data:  buildExistenciaUpdate(l.existencia_num, despues),
        });
        await tx.entregaMateriaPrimaLinea.create({
          data: {
            entrega_id:     entrega.id,
            articulo_id:    l.articulo_id,
            existencia_num: l.existencia_num,
            cantidad:       l.cantidad,
            movimiento_id:  mov.id,
          },
        });
      }

      const completa = await tx.entregaMateriaPrima.findUniqueOrThrow({
        where: { id: entrega.id },
        include: ENTREGA_INCLUDE,
      });
      return this.serialize(completa);
    });
  }

  // ─── Devolución / merma / defectuoso ──────────────────────────

  async registrarDevolucion(id: string, dto: CreateDevolucionDto, ubicacionId: string, usuarioId: string) {
    return this.prisma.$transaction(async (tx) => {
      const entrega = await tx.entregaMateriaPrima.findFirst({
        where: { id, ubicacion_id: ubicacionId },
        include: { area: true, lineas: { include: { devoluciones: true, articulo: true } } },
      });
      if (!entrega) throw new NotFoundException('Entrega no encontrada');
      if (entrega.estatus !== 'ACTIVA') throw new BadRequestException('La entrega está cancelada');

      const devolucion = await tx.devolucionMateriaPrima.create({
        data: { entrega_id: id, registrada_por: usuarioId, motivo: dto.motivo ?? null },
      });

      // Lo ya devuelto por línea, incluyendo lo acumulado en esta misma solicitud.
      const acumulado = new Map<string, number>();
      for (const l of entrega.lineas) {
        acumulado.set(l.id, r3(l.devoluciones.reduce((s, d) => s + Number(d.cantidad), 0)));
      }

      for (const dl of dto.lineas) {
        const linea = entrega.lineas.find((l) => l.id === dl.entrega_linea_id);
        if (!linea) throw new BadRequestException('La línea no pertenece a esta entrega');

        const yaDevuelto = acumulado.get(linea.id) ?? 0;
        const disponible = r3(Number(linea.cantidad) - yaDevuelto);
        if (r3(dl.cantidad) > disponible) {
          throw new BadRequestException(
            `${linea.articulo.clave}: solo quedan ${disponible} por devolver (entregado ${Number(linea.cantidad)})`,
          );
        }
        acumulado.set(linea.id, r3(yaDevuelto + dl.cantidad));

        let movimientoId: string | null = null;
        if (REGRESA_EXISTENCIA.includes(dl.tipo)) {
          const articulo = await tx.articulo.findUniqueOrThrow({ where: { id: linea.articulo_id } });
          const antes   = getExistencia(articulo, linea.existencia_num);
          const despues = r3(antes + dl.cantidad);
          const mov = await tx.movimientoInventario.create({
            data: {
              ubicacion_id:     ubicacionId,
              articulo_id:      linea.articulo_id,
              tipo:             'ENTRADA',
              existencia_num:   linea.existencia_num,
              cantidad:         dl.cantidad,
              cantidad_antes:   antes,
              cantidad_despues: despues,
              concepto:         `Devolución (${dl.tipo}) de ${entrega.area.nombre}`,
              referencia_id:    id,
              usuario_id:       usuarioId,
            },
          });
          await tx.articulo.update({
            where: { id: linea.articulo_id },
            data:  buildExistenciaUpdate(linea.existencia_num, despues),
          });
          movimientoId = mov.id;
        }

        await tx.devolucionMateriaPrimaLinea.create({
          data: {
            devolucion_id:    devolucion.id,
            entrega_linea_id: linea.id,
            tipo:             dl.tipo,
            cantidad:         dl.cantidad,
            movimiento_id:    movimientoId,
          },
        });
      }

      const completa = await tx.entregaMateriaPrima.findUniqueOrThrow({ where: { id }, include: ENTREGA_INCLUDE });
      return this.serialize(completa);
    });
  }

  // ─── Cancelar (solo si no tiene devoluciones) ─────────────────

  async cancelar(id: string, ubicacionId: string, usuarioId: string) {
    return this.prisma.$transaction(async (tx) => {
      const entrega = await tx.entregaMateriaPrima.findFirst({
        where: { id, ubicacion_id: ubicacionId },
        include: { area: true, lineas: true, devoluciones: { select: { id: true } } },
      });
      if (!entrega) throw new NotFoundException('Entrega no encontrada');
      if (entrega.estatus === 'CANCELADA') throw new BadRequestException('La entrega ya está cancelada');
      if (entrega.devoluciones.length > 0) {
        throw new BadRequestException('No se puede cancelar una entrega que ya tiene devoluciones');
      }

      for (const linea of entrega.lineas) {
        const articulo = await tx.articulo.findUniqueOrThrow({ where: { id: linea.articulo_id } });
        const antes   = getExistencia(articulo, linea.existencia_num);
        const despues = r3(antes + Number(linea.cantidad));
        await tx.movimientoInventario.create({
          data: {
            ubicacion_id:     ubicacionId,
            articulo_id:      linea.articulo_id,
            tipo:             'ENTRADA',
            existencia_num:   linea.existencia_num,
            cantidad:         linea.cantidad,
            cantidad_antes:   antes,
            cantidad_despues: despues,
            concepto:         `Cancelación de entrega a ${entrega.area.nombre}`,
            referencia_id:    id,
            usuario_id:       usuarioId,
          },
        });
        await tx.articulo.update({
          where: { id: linea.articulo_id },
          data:  buildExistenciaUpdate(linea.existencia_num, despues),
        });
      }

      await tx.entregaMateriaPrima.update({ where: { id }, data: { estatus: 'CANCELADA' } });
      const completa = await tx.entregaMateriaPrima.findUniqueOrThrow({ where: { id }, include: ENTREGA_INCLUDE });
      return this.serialize(completa);
    });
  }

  // ─── Reportes de consumo ──────────────────────────────────────

  /** Consumo por área, por empleado y por artículo en el rango dado (ubicación activa).
   *  neto = entregado − devuelto que regresó a existencia (SOBRANTE / ERROR_ENTREGA).
   *  merma y defectuoso se reportan aparte: son pérdida imputada al área. */
  async reporte(ubicacionId: string, q: { desde?: string; hasta?: string } = {}) {
    const where: Prisma.EntregaMateriaPrimaWhereInput = { ubicacion_id: ubicacionId, estatus: 'ACTIVA' };
    if (q.desde || q.hasta) {
      where.fecha = {
        ...(q.desde && { gte: inicioDiaMx(q.desde) }),
        ...(q.hasta && { lte: finDiaMx(q.hasta) }),
      };
    }

    const entregas = await this.prisma.entregaMateriaPrima.findMany({
      where,
      include: {
        area:     { select: { id: true, nombre: true } },
        empleado: { select: { id: true, nombre: true, apellidos: true } },
        lineas: {
          include: {
            articulo:     { select: { id: true, clave: true, descripcion_1: true } },
            devoluciones: true,
          },
        },
      },
    });

    type Fila = {
      id: string; nombre: string; entregas: number;
      entregado: number; devuelto: number; merma: number; defectuoso: number; neto: number;
    };
    const nuevaFila = (id: string, nombre: string): Fila =>
      ({ id, nombre, entregas: 0, entregado: 0, devuelto: 0, merma: 0, defectuoso: 0, neto: 0 });

    const porArea = new Map<string, Fila>();
    const porEmpleado = new Map<string, Fila>();
    const porArticulo = new Map<string, Fila>();
    const getFila = (m: Map<string, Fila>, id: string, nombre: string) => {
      let f = m.get(id);
      if (!f) { f = nuevaFila(id, nombre); m.set(id, f); }
      return f;
    };

    for (const e of entregas) {
      const fArea = getFila(porArea, e.area.id, e.area.nombre);
      const fEmp = e.empleado
        ? getFila(porEmpleado, e.empleado.id, `${e.empleado.nombre} ${e.empleado.apellidos}`)
        : getFila(porEmpleado, 'sin-empleado', 'Sin empleado indicado');
      fArea.entregas++;
      fEmp.entregas++;

      for (const l of e.lineas) {
        const fArt = getFila(
          porArticulo, l.articulo.id,
          `${l.articulo.clave}${l.articulo.descripcion_1 ? ` — ${l.articulo.descripcion_1}` : ''}`,
        );
        const cant = Number(l.cantidad);
        let devuelto = 0, merma = 0, defectuoso = 0;
        for (const d of l.devoluciones) {
          const c = Number(d.cantidad);
          if (d.tipo === 'MERMA') merma += c;
          else if (d.tipo === 'DEFECTUOSO') defectuoso += c;
          else devuelto += c;
        }
        for (const f of [fArea, fEmp, fArt]) {
          f.entregado  += cant;
          f.devuelto   += devuelto;
          f.merma      += merma;
          f.defectuoso += defectuoso;
        }
      }
    }

    const cerrar = (m: Map<string, Fila>) =>
      [...m.values()]
        .map((f) => ({
          ...f,
          entregado: r3(f.entregado), devuelto: r3(f.devuelto),
          merma: r3(f.merma), defectuoso: r3(f.defectuoso),
          neto: r3(f.entregado - f.devuelto),
        }))
        .sort((a, b) => b.neto - a.neto);

    return {
      desde: q.desde ?? null,
      hasta: q.hasta ?? null,
      total_entregas: entregas.length,
      por_area: cerrar(porArea),
      por_empleado: cerrar(porEmpleado),
      por_articulo: cerrar(porArticulo),
    };
  }

  // ─── Privados ─────────────────────────────────────────────────

  private serialize(e: EntregaRaw) {
    return {
      ...e,
      lineas: e.lineas.map((l) => ({
        ...l,
        cantidad: Number(l.cantidad),
        devoluciones: l.devoluciones.map((d) => ({ ...d, cantidad: Number(d.cantidad) })),
      })),
      devoluciones: e.devoluciones.map((d) => ({
        ...d,
        lineas: d.lineas.map((dl) => ({ ...dl, cantidad: Number(dl.cantidad) })),
      })),
    };
  }
}
