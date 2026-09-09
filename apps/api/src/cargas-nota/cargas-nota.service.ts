import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@grupometalicoemf/database';
import { PrismaService } from '../prisma/prisma.service';
import type { RegistrarCargaDto } from './dto/cargas-nota.dto';
import { getExistencia, buildExistenciaUpdate } from '../common/utils/existencia';

// Las cargas de nota siempre descuentan del sub-almacén principal (slot 1).
const SLOT_CARGA = 1;

const ESTATUS_CON_CARGA_PERMITIDA = ['PAGADA', 'CREDITO', 'INCOMPLETA'];

@Injectable()
export class CargasNotaService {
  constructor(private prisma: PrismaService) {}

  async getPendientes(notaId: string, ubicacionId: string) {
    const nota = await this.findNotaConCargas(notaId, ubicacionId);
    return this.serializePendientes(nota);
  }

  async registrarCarga(notaId: string, ubicacionId: string, usuarioId: string, dto: RegistrarCargaDto) {
    const nota = await this.findNotaConCargas(notaId, ubicacionId);

    if (!ESTATUS_CON_CARGA_PERMITIDA.includes(nota.estatus)) {
      throw new ForbiddenException(`No se puede registrar carga en una nota en estatus ${nota.estatus}`);
    }

    const lineasMap = new Map(nota.lineas.map((l) => [l.id, l]));
    const pendientePorLinea = new Map<string, number>();
    // Observación sin resolver de una carga ANTERIOR — si existe, la línea
    // sigue incompleta aunque ya no le falte cantidad por cargar.
    const obsPendienteExistente = new Map<string, boolean>();

    for (const linea of nota.lineas) {
      const cargadoPrevio = linea.carga_lineas.reduce((s, c) => s + Number(c.cantidad_cargada), 0);
      pendientePorLinea.set(linea.id, Number(linea.cantidad) - cargadoPrevio);
      obsPendienteExistente.set(linea.id, linea.carga_lineas.some((c) => c.observaciones && !c.resuelta_at));
    }

    for (const item of dto.lineas) {
      const linea = lineasMap.get(item.nota_venta_linea_id);
      if (!linea) throw new BadRequestException(`Línea ${item.nota_venta_linea_id} no pertenece a esta nota`);
      const pendiente = pendientePorLinea.get(linea.id)!;
      if (item.cantidad_cargada > pendiente + 1e-6) {
        throw new BadRequestException(
          `La cantidad a cargar de "${linea.clave}" (${item.cantidad_cargada}) excede lo pendiente (${pendiente})`,
        );
      }
    }

    const { completa } = await this.prisma.$transaction(async (tx) => {
      for (const item of dto.lineas) {
        if (item.cantidad_cargada <= 0) continue;
        const linea = lineasMap.get(item.nota_venta_linea_id)!;
        const tieneObservacion = !!item.observaciones?.trim();

        // Con observación (ej. "faltaron 10 postes" de un juego de anaqueles
        // que se vende como una sola línea) el descuento de inventario se
        // difiere hasta que alguien confirme que la incidencia ya se resolvió
        // — ver resolverObservacion(). Sin observación, se descuenta de inmediato,
        // como siempre.
        if (tieneObservacion) continue;

        const art = await tx.articulo.findUnique({ where: { id: linea.articulo_id } });
        if (!art) throw new NotFoundException(`Artículo de línea ${linea.clave} no encontrado`);

        const cantAntes = getExistencia(art, SLOT_CARGA);
        const cantDespues = cantAntes - item.cantidad_cargada;

        await tx.movimientoInventario.create({
          data: {
            ubicacion_id: ubicacionId,
            articulo_id: linea.articulo_id,
            tipo: 'SALIDA',
            existencia_num: SLOT_CARGA,
            cantidad: item.cantidad_cargada,
            cantidad_antes: cantAntes,
            cantidad_despues: cantDespues,
            concepto: `Carga nota #${nota.folio}`,
            referencia_id: nota.id,
            usuario_id: usuarioId,
          },
        });

        await tx.articulo.update({
          where: { id: linea.articulo_id },
          data: buildExistenciaUpdate(SLOT_CARGA, cantDespues),
        });
      }

      const todaCompleta = nota.lineas.every((l) => {
        const pendiente = pendientePorLinea.get(l.id)!;
        const item = dto.lineas.find((i) => i.nota_venta_linea_id === l.id);
        const nuevoPendiente = pendiente - (item?.cantidad_cargada ?? 0);
        const tieneObservacionNueva = !!item?.observaciones?.trim();
        return nuevoPendiente <= 1e-6 && !tieneObservacionNueva && !obsPendienteExistente.get(l.id);
      });

      await tx.cargaNota.create({
        data: {
          nota_id: nota.id,
          ubicacion_id: ubicacionId,
          estatus: todaCompleta ? 'COMPLETA' : 'INCOMPLETA',
          usuario_id: usuarioId,
          lineas: {
            create: dto.lineas
              .filter((i) => i.cantidad_cargada > 0)
              .map((i) => ({
                nota_venta_linea_id: i.nota_venta_linea_id,
                cantidad_cargada: i.cantidad_cargada,
                observaciones: i.observaciones?.trim() || null,
              })),
          },
        },
      });

      // Solo se toca `estatus_entrega` — el estatus de pago (PAGADA/CREDITO)
      // nunca se sobreescribe aquí, o se pierde que la nota siga a crédito y
      // ya no se le pueda registrar el abono (ver abonar() en ventas.service.ts).
      await tx.notaVenta.update({
        where: { id: nota.id },
        data: { estatus_entrega: todaCompleta ? 'COMPLETA' : 'INCOMPLETA' },
      });

      return { completa: todaCompleta };
    });

    const pendientes = await this.getPendientes(notaId, ubicacionId);
    return {
      ...pendientes,
      imprimir_ticket: !completa,
    };
  }

  /**
   * El cliente regresa, se aclara la incidencia (ej. ya se llevó los postes
   * faltantes) y se confirma la entrega de esa línea: hasta este momento se
   * descuenta el inventario que se había diferido en registrarCarga().
   */
  async resolverObservacion(notaId: string, cargaLineaId: string, ubicacionId: string, usuarioId: string) {
    const cargaLinea = await this.prisma.cargaNotaLinea.findFirst({
      where: { id: cargaLineaId, carga: { nota_id: notaId, ubicacion_id: ubicacionId, anulada: false } },
      include: { linea: true, carga: true },
    });
    if (!cargaLinea) throw new NotFoundException('Línea de carga no encontrada');
    if (!cargaLinea.observaciones) throw new BadRequestException('Esta línea no tiene observaciones pendientes');
    if (cargaLinea.resuelta_at) throw new BadRequestException('Esta observación ya fue resuelta');

    await this.prisma.$transaction(async (tx) => {
      const art = await tx.articulo.findUnique({ where: { id: cargaLinea.linea.articulo_id } });
      if (!art) throw new NotFoundException('Artículo no encontrado');

      const cantAntes = getExistencia(art, SLOT_CARGA);
      const cantidad = Number(cargaLinea.cantidad_cargada);
      const cantDespues = cantAntes - cantidad;

      await tx.movimientoInventario.create({
        data: {
          ubicacion_id: ubicacionId,
          articulo_id: cargaLinea.linea.articulo_id,
          tipo: 'SALIDA',
          existencia_num: SLOT_CARGA,
          cantidad,
          cantidad_antes: cantAntes,
          cantidad_despues: cantDespues,
          concepto: `Resolución observación carga nota #${cargaLinea.carga.nota_id}`,
          referencia_id: cargaLinea.carga.nota_id,
          usuario_id: usuarioId,
        },
      });

      await tx.articulo.update({
        where: { id: cargaLinea.linea.articulo_id },
        data: buildExistenciaUpdate(SLOT_CARGA, cantDespues),
      });

      await tx.cargaNotaLinea.update({
        where: { id: cargaLinea.id },
        data: { resuelta_at: new Date(), resuelta_por_id: usuarioId },
      });

      // Si ya no queda ninguna cantidad pendiente ni observación sin resolver
      // en toda la nota, la entrega pasa de INCOMPLETA a COMPLETA.
      const nota = await this.findNotaConCargasTx(tx, notaId, ubicacionId);
      const todaCompleta = nota.lineas.every((l) => {
        const cargado = l.carga_lineas.reduce((s, c) => s + Number(c.cantidad_cargada), 0);
        const pendiente = Number(l.cantidad) - cargado;
        const hayObsPendiente = l.carga_lineas.some((c) => c.observaciones && !c.resuelta_at && c.id !== cargaLinea.id);
        return pendiente <= 1e-6 && !hayObsPendiente;
      });

      if (todaCompleta) {
        await tx.notaVenta.update({ where: { id: notaId }, data: { estatus_entrega: 'COMPLETA' } });
      }
    });

    return this.getPendientes(notaId, ubicacionId);
  }

  private async findNotaConCargas(notaId: string, ubicacionId: string) {
    return this.findNotaConCargasTx(this.prisma, notaId, ubicacionId);
  }

  private async findNotaConCargasTx(
    tx: PrismaService | Prisma.TransactionClient,
    notaId: string,
    ubicacionId: string,
  ) {
    const nota = await tx.notaVenta.findFirst({
      where: { id: notaId, ubicacion_id: ubicacionId },
      include: {
        lineas: {
          include: {
            articulo: {
              select: {
                id: true, clave: true,
                descripcion_1: true, descripcion_2: true, descripcion_3: true,
                descripcion_4: true, descripcion_5: true,
              },
            },
            carga_lineas: {
              where: { carga: { anulada: false } },
              select: { id: true, cantidad_cargada: true, observaciones: true, resuelta_at: true },
            },
          },
        },
      },
    });
    if (!nota) throw new NotFoundException('Nota no encontrada');
    return nota;
  }

  private serializePendientes(nota: Awaited<ReturnType<CargasNotaService['findNotaConCargas']>>) {
    return {
      nota_id: nota.id,
      folio: nota.folio,
      estatus: nota.estatus,
      estatus_entrega: nota.estatus_entrega,
      lineas: nota.lineas.map((l) => {
        const cargado = l.carga_lineas.reduce((s, c) => s + Number(c.cantidad_cargada), 0);
        const descripcion = [
          l.articulo?.descripcion_1, l.articulo?.descripcion_2, l.articulo?.descripcion_3,
          l.articulo?.descripcion_4, l.articulo?.descripcion_5,
        ].filter(Boolean).join(' · ') || null;
        const observacionesPendientes = l.carga_lineas
          .filter((c) => c.observaciones && !c.resuelta_at)
          .map((c) => ({ id: c.id, observaciones: c.observaciones as string, cantidad_cargada: Number(c.cantidad_cargada) }));
        return {
          id: l.id,
          articulo_id: l.articulo_id,
          clave: l.clave,
          descripcion,
          cantidad: Number(l.cantidad),
          cargado,
          pendiente: +(Number(l.cantidad) - cargado).toFixed(3),
          observaciones_pendientes: observacionesPendientes,
        };
      }),
    };
  }
}
