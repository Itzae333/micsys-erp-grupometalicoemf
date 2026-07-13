import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RegistrarCargaDto } from './dto/cargas-nota.dto';

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

    for (const linea of nota.lineas) {
      const cargadoPrevio = linea.carga_lineas.reduce((s, c) => s + Number(c.cantidad_cargada), 0);
      pendientePorLinea.set(linea.id, Number(linea.cantidad) - cargadoPrevio);
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

        const art = await tx.articulo.findUnique({ where: { id: linea.articulo_id } });
        if (!art) throw new NotFoundException(`Artículo de línea ${linea.clave} no encontrado`);

        const cantAntes = Number(art.existencia_1 ?? 0);
        const cantDespues = cantAntes - item.cantidad_cargada;

        await tx.movimientoInventario.create({
          data: {
            ubicacion_id: ubicacionId,
            articulo_id: linea.articulo_id,
            tipo: 'SALIDA',
            existencia_num: 1,
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
          data: { existencia_1: cantDespues },
        });
      }

      const todaCompleta = nota.lineas.every((l) => {
        const pendiente = pendientePorLinea.get(l.id)!;
        const item = dto.lineas.find((i) => i.nota_venta_linea_id === l.id);
        const nuevoPendiente = pendiente - (item?.cantidad_cargada ?? 0);
        return nuevoPendiente <= 1e-6;
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
              })),
          },
        },
      });

      await tx.notaVenta.update({
        where: { id: nota.id },
        data: { estatus: todaCompleta ? 'FINALIZADA' : 'INCOMPLETA' },
      });

      return { completa: todaCompleta };
    });

    const pendientes = await this.getPendientes(notaId, ubicacionId);
    return {
      ...pendientes,
      imprimir_ticket: !completa,
    };
  }

  private async findNotaConCargas(notaId: string, ubicacionId: string) {
    const nota = await this.prisma.notaVenta.findFirst({
      where: { id: notaId, ubicacion_id: ubicacionId },
      include: {
        lineas: {
          include: {
            articulo: { select: { id: true, clave: true, descripcion_1: true } },
            carga_lineas: { where: { carga: { anulada: false } }, select: { cantidad_cargada: true } },
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
      lineas: nota.lineas.map((l) => {
        const cargado = l.carga_lineas.reduce((s, c) => s + Number(c.cantidad_cargada), 0);
        return {
          id: l.id,
          articulo_id: l.articulo_id,
          clave: l.clave,
          descripcion: l.articulo?.descripcion_1 ?? null,
          cantidad: Number(l.cantidad),
          cargado,
          pendiente: +(Number(l.cantidad) - cargado).toFixed(3),
        };
      }),
    };
  }
}
