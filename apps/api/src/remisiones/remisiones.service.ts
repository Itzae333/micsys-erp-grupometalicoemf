import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArticulosService } from '../articulos/articulos.service';
import type { CreateRemisionDto, RecibirRemisionDto } from './dto/remision.dto';
import type { Prisma, RolUsuario } from '@grupometalicoemf/database';
import { getExistencia, buildExistenciaUpdate } from '../common/utils/existencia';
import {
  rankCandidatos,
  esCandidatoUnicoConfiable,
  type DescripcionesArticulo,
} from '../common/utils/articulo-matching';

const DESCRIPCIONES_SELECT = {
  id: true, clave: true,
  descripcion_1: true, descripcion_2: true,
  descripcion_3: true, descripcion_4: true, descripcion_5: true,
} satisfies Prisma.ArticuloSelect;

const REM_INCLUDE = {
  empresa_origen:  { select: { id: true, nombre: true, logo_url: true } },
  ub_origen:       {
    select: {
      id: true,
      nombre: true,
      tipo: true,
      logo_url: true,
      razon_social: true,
      rfc: true,
      regimen_fiscal: true,
      calle: true,
      num_ext: true,
      num_int: true,
      colonia: true,
      municipio: true,
      estado: true,
      cp: true,
      telefono: true,
    },
  },
  empresa_destino: { select: { id: true, nombre: true } },
  ub_destino:      { select: { id: true, nombre: true } },
  creado_por:      { select: { id: true, nombre: true, apellidos: true } },
  enviado_por:     { select: { id: true, nombre: true, apellidos: true } },
  recibido_por:    { select: { id: true, nombre: true, apellidos: true } },
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
  },
} satisfies Prisma.RemisionInclude;

@Injectable()
export class RemisionesService {
  constructor(
    private prisma: PrismaService,
    private articulos: ArticulosService,
  ) {}

  // ─── Listar ───────────────────────────────────────────────────

  async listar(
    empresaId: string,
    tipo: 'salida' | 'entrada' | 'todas',
    query: { estatus?: string; ubicacionId?: string; rol?: RolUsuario; page?: number; limit?: number } = {},
  ) {
    const { estatus, ubicacionId, rol, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    // Solo SUPER_USUARIO/ADMIN administran toda la empresa — el resto de
    // roles está limitado a su propia ubicación (regla de guard empresa+
    // ubicación), así que "todas" para ellos significa "todas las de mi
    // ubicación", nunca las de otras ubicaciones de la empresa.
    const esAdmin = rol === 'SUPER_USUARIO' || rol === 'ADMIN';

    const where: Prisma.RemisionWhereInput = {};
    if (tipo === 'salida') {
      where.empresa_origen_id = empresaId;
      if (ubicacionId) where.ub_origen_id = ubicacionId;
    } else if (tipo === 'entrada') {
      where.empresa_destino_id = empresaId;
      if (ubicacionId) where.ub_destino_id = ubicacionId;
    } else if (esAdmin || !ubicacionId) {
      where.OR = [{ empresa_origen_id: empresaId }, { empresa_destino_id: empresaId }];
    } else {
      where.OR = [
        { empresa_origen_id: empresaId, ub_origen_id: ubicacionId },
        { empresa_destino_id: empresaId, ub_destino_id: ubicacionId },
      ];
    }
    if (estatus) where.estatus = estatus as any;

    const [total, data] = await Promise.all([
      this.prisma.remision.count({ where }),
      this.prisma.remision.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: REM_INCLUDE,
      }),
    ]);

    return {
      data: data.map((r) => this.serialize(r)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // ─── Detalle por ID ───────────────────────────────────────────

  async getById(id: string, empresaId: string) {
    const rem = await this.prisma.remision.findFirst({
      where: { id, OR: [{ empresa_origen_id: empresaId }, { empresa_destino_id: empresaId }] },
      include: REM_INCLUDE,
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    return this.serialize(rem);
  }

  // ─── Detalle por folio (para QR scan) ────────────────────────

  async getByFolio(folio: string, empresaId: string) {
    const rem = await this.prisma.remision.findFirst({
      where: { folio, OR: [{ empresa_origen_id: empresaId }, { empresa_destino_id: empresaId }] },
      include: REM_INCLUDE,
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    return this.serialize(rem);
  }

  // ─── Crear (BORRADOR) ─────────────────────────────────────────

  async crear(dto: CreateRemisionDto, usuarioId: string) {
    if (!dto.lineas?.length) {
      throw new BadRequestException('La remisión debe tener al menos una línea');
    }

    const folio = await this.nextFolio();

    const rem = await this.prisma.remision.create({
      data: {
        folio,
        empresa_origen_id:  dto.empresa_origen_id,
        ub_origen_id:       dto.ub_origen_id,
        empresa_destino_id: dto.empresa_destino_id,
        ub_destino_id:      dto.ub_destino_id,
        concepto:           dto.concepto ?? null,
        notas:              dto.notas    ?? null,
        creado_por_id:      usuarioId,
        lineas: {
          create: dto.lineas.map((l) => ({
            articulo_id:      l.articulo_id,
            articulo_clave:   l.articulo_clave,
            slot_origen:      l.slot_origen,
            slot_destino:     l.slot_destino,
            cantidad_enviada: l.cantidad,
            notas:            l.notas ?? null,
          })),
        },
      },
      include: REM_INCLUDE,
    });

    return this.serialize(rem);
  }

  // ─── Enviar → EN_TRANSITO ─────────────────────────────────────

  async enviar(id: string, usuarioId: string, empresaId: string) {
    const rem = await this.prisma.remision.findFirst({
      where: { id, empresa_origen_id: empresaId },
      include: { lineas: true },
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    if (rem.estatus !== 'BORRADOR') {
      throw new BadRequestException('Solo se pueden enviar remisiones en BORRADOR');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const linea of rem.lineas) {
        const art = await tx.articulo.findFirst({
          where: { id: linea.articulo_id, ubicacion_id: rem.ub_origen_id },
        });
        if (!art) throw new NotFoundException(`Artículo ${linea.articulo_clave} no encontrado en ubicación origen`);

        const cantAntes   = getExistencia(art, linea.slot_origen);
        const cantDespues = cantAntes - Number(linea.cantidad_enviada);

        await tx.movimientoInventario.create({
          data: {
            ubicacion_id:    rem.ub_origen_id,
            articulo_id:     linea.articulo_id,
            tipo:            'SALIDA',
            existencia_num:  linea.slot_origen,
            cantidad:        linea.cantidad_enviada,
            cantidad_antes:  cantAntes,
            cantidad_despues: cantDespues,
            concepto:        `Remisión ${rem.folio} → ${rem.ub_destino_id}`,
            referencia_id:   rem.id,
            usuario_id:      usuarioId,
          },
        });

        await tx.articulo.update({
          where: { id: linea.articulo_id },
          data: buildExistenciaUpdate(linea.slot_origen, cantDespues),
        });
      }

      await tx.remision.update({
        where: { id },
        data: {
          estatus:         'EN_TRANSITO',
          enviado_por_id:  usuarioId,
          fecha_envio:     new Date(),
        },
      });
    });

    return this.getById(id, empresaId);
  }

  // ─── Búsqueda manual en catálogo destino ────────────────────────
  //
  // El header x-ubicacion-id que usa GET /articulos siempre refleja la
  // ubicación activa del usuario en el front (contexto), que puede no ser
  // ub_destino_id (ej. un ADMIN gestionando la recepción desde otra
  // sucursal). Por eso la búsqueda manual del selector de equivalencia pasa
  // por aquí: valida la remisión y busca explícitamente en su ub_destino_id.

  async buscarArticulosDestino(
    id: string,
    empresaId: string,
    query: { q?: string; page?: number; limit?: number },
  ) {
    const rem = await this.prisma.remision.findFirst({
      where: { id, empresa_destino_id: empresaId },
      select: { ub_destino_id: true },
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    return this.articulos.findAll(rem.ub_destino_id, { ...query, activo: true });
  }

  // ─── Preview de recepción (resolución de equivalencias) ────────
  //
  // Cada ubicación tiene su propio catálogo de artículos, con ids y claves
  // (SKU) independientes entre sí — las claves son legado y no confiables
  // para encontrar el equivalente en destino. Este método resuelve, para
  // cada línea de la remisión, cuál es el artículo del catálogo destino
  // que corresponde: por equivalencia ya guardada, por único candidato
  // confiable según similitud de descripciones, por varios candidatos
  // ambiguos (requiere elegir), o ninguno (requiere búsqueda manual).

  async previewRecepcion(id: string, empresaId: string) {
    const rem = await this.prisma.remision.findFirst({
      where: { id, empresa_destino_id: empresaId },
      include: {
        lineas: {
          include: { articulo: { select: DESCRIPCIONES_SELECT } },
        },
      },
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    if (rem.estatus !== 'EN_TRANSITO') {
      throw new BadRequestException('Solo se puede previsualizar la recepción de remisiones EN_TRANSITO');
    }

    const [catalogoDestino, equivalencias] = await Promise.all([
      this.prisma.articulo.findMany({
        where: { ubicacion_id: rem.ub_destino_id, activo: true },
        select: DESCRIPCIONES_SELECT,
      }),
      this.prisma.articuloEquivalencia.findMany({
        where: {
          ub_destino_id: rem.ub_destino_id,
          articulo_origen_id: { in: rem.lineas.map((l) => l.articulo_id) },
        },
        include: { articulo_destino: { select: DESCRIPCIONES_SELECT } },
      }),
    ]);
    const equivalenciaPorOrigen = new Map(equivalencias.map((e) => [e.articulo_origen_id, e]));

    const lineas = rem.lineas.map((linea) => {
      const base = {
        linea_id: linea.id,
        articulo_origen: linea.articulo as DescripcionesArticulo,
        cantidad_enviada: Number(linea.cantidad_enviada),
        cantidad_recibida: linea.cantidad_recibida != null ? Number(linea.cantidad_recibida) : null,
      };

      const equivalencia = equivalenciaPorOrigen.get(linea.articulo_id);
      if (equivalencia) {
        return {
          ...base,
          resolucion: {
            estado: 'AUTO_EQUIVALENCIA' as const,
            seleccionado: {
              articulo_destino_id: equivalencia.articulo_destino_id,
              ...(equivalencia.articulo_destino as DescripcionesArticulo),
              score: equivalencia.score != null ? Number(equivalencia.score) : null,
            },
            candidatos: [],
          },
        };
      }

      const candidatos = rankCandidatos(linea.articulo as DescripcionesArticulo, catalogoDestino as DescripcionesArticulo[])
        .map((c) => ({ articulo_destino_id: c.articulo.id, ...c.articulo, score: c.score }));
      const autoResuelto = esCandidatoUnicoConfiable(
        candidatos.map((c) => ({ articulo: c, score: c.score })),
      );

      return {
        ...base,
        resolucion: {
          estado: autoResuelto
            ? ('AUTO_UNICO_CANDIDATO' as const)
            : candidatos.length > 0
              ? ('AMBIGUO' as const)
              : ('SIN_CANDIDATOS' as const),
          seleccionado: autoResuelto ? candidatos[0] : null,
          candidatos,
        },
      };
    });

    return { lineas };
  }

  // ─── Recibir ──────────────────────────────────────────────────

  async recibir(id: string, dto: RecibirRemisionDto, usuarioId: string, empresaId: string) {
    const rem = await this.prisma.remision.findFirst({
      where: { id, empresa_destino_id: empresaId },
      include: { lineas: true },
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    if (rem.estatus !== 'EN_TRANSITO') {
      throw new BadRequestException('Solo se pueden recibir remisiones EN_TRANSITO');
    }

    let completa = true;

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.lineas) {
        const linea = rem.lineas.find((l) => l.id === item.linea_id);
        if (!linea) throw new BadRequestException(`Línea ${item.linea_id} no encontrada`);

        const cantRecibida = item.cantidad_recibida;
        if (Number(cantRecibida) < Number(linea.cantidad_enviada)) completa = false;

        if (cantRecibida > 0) {
          let artDstId = item.articulo_destino_id;

          // Fallback defensivo por clave (compat con llamadas que aún no
          // resuelven la equivalencia vía preview-recepcion) — las claves
          // son legado y pueden no coincidir, por eso ya no es el mecanismo
          // principal.
          if (!artDstId) {
            const legacy = await tx.articulo.findFirst({
              where: { clave: linea.articulo_clave, ubicacion_id: rem.ub_destino_id },
            });
            artDstId = legacy?.id;
          }
          if (!artDstId) {
            throw new BadRequestException(
              `Falta resolver el artículo equivalente en destino para "${linea.articulo_clave}"`,
            );
          }

          const artDst = await tx.articulo.findFirst({
            where: { id: artDstId, ubicacion_id: rem.ub_destino_id },
          });
          if (!artDst) {
            throw new BadRequestException('El artículo destino no pertenece a la ubicación destino');
          }

          const cantAntes   = getExistencia(artDst, linea.slot_destino);
          const cantDespues = cantAntes + cantRecibida;

          await tx.movimientoInventario.create({
            data: {
              ubicacion_id:     rem.ub_destino_id,
              articulo_id:      artDst.id,
              tipo:             'ENTRADA',
              existencia_num:   linea.slot_destino,
              cantidad:         cantRecibida,
              cantidad_antes:   cantAntes,
              cantidad_despues: cantDespues,
              concepto:         `Recepción remisión ${rem.folio}`,
              referencia_id:    rem.id,
              usuario_id:       usuarioId,
            },
          });

          await tx.articulo.update({
            where: { id: artDst.id },
            data: buildExistenciaUpdate(linea.slot_destino, cantDespues),
          });

          if (item.origen_resolucion) {
            await tx.articuloEquivalencia.upsert({
              where: {
                articulo_origen_ub_destino: {
                  articulo_origen_id: linea.articulo_id,
                  ub_destino_id: rem.ub_destino_id,
                },
              },
              create: {
                articulo_origen_id:  linea.articulo_id,
                ub_destino_id:       rem.ub_destino_id,
                articulo_destino_id: artDst.id,
                origen:              item.origen_resolucion,
                creado_por_id:       usuarioId,
              },
              update: {
                articulo_destino_id: artDst.id,
                origen:              item.origen_resolucion,
                creado_por_id:       usuarioId,
              },
            });
          }
        }

        await tx.remisionLinea.update({
          where: { id: item.linea_id },
          data: { cantidad_recibida: cantRecibida },
        });
      }

      await tx.remision.update({
        where: { id },
        data: {
          estatus:          completa ? 'RECIBIDA_COMPLETA' : 'RECIBIDA_PARCIAL',
          recibido_por_id:  usuarioId,
          fecha_recepcion:  new Date(),
        },
      });
    });

    return this.getById(id, empresaId);
  }

  // ─── Cancelar (solo BORRADOR) ─────────────────────────────────

  async cancelar(id: string, empresaId: string) {
    const rem = await this.prisma.remision.findFirst({
      where: { id, OR: [{ empresa_origen_id: empresaId }, { empresa_destino_id: empresaId }] },
    });
    if (!rem) throw new NotFoundException('Remisión no encontrada');
    if (rem.estatus !== 'BORRADOR') {
      throw new BadRequestException('Solo se pueden cancelar remisiones en BORRADOR');
    }
    await this.prisma.remision.update({ where: { id }, data: { estatus: 'CANCELADA' } });
    return { ok: true };
  }

  // ─── Destinos disponibles (todas las empresas + ubicaciones) ──

  async getDestinos() {
    const empresas = await this.prisma.empresa.findMany({
      where: { activa: true },
      select: {
        id: true,
        nombre: true,
        ubicaciones: {
          where: { activa: true },
          select: { id: true, nombre: true, tipo: true },
          orderBy: { nombre: 'asc' },
        },
      },
      orderBy: { nombre: 'asc' },
    });
    return empresas;
  }

  // ─── Privados ──────────────────────────────────────────────────

  private async nextFolio(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REM-${year}-`;
    const last = await this.prisma.remision.findFirst({
      where:   { folio: { startsWith: prefix } },
      orderBy: { folio: 'desc' },
    });
    const num = last ? parseInt(last.folio.split('-')[2] ?? '0', 10) + 1 : 1;
    return `${prefix}${String(num).padStart(4, '0')}`;
  }

  private serialize(rem: any) {
    return {
      ...rem,
      lineas: (rem.lineas ?? []).map((l: any) => ({
        ...l,
        cantidad_enviada:  Number(l.cantidad_enviada),
        cantidad_recibida: l.cantidad_recibida != null ? Number(l.cantidad_recibida) : null,
      })),
    };
  }
}
