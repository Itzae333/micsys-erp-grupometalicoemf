import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TipoColumna } from '@grupometalicoemf/database';
import { PrismaService } from '../prisma/prisma.service';
import type { UpsertConfigColumnasDto } from './dto/upsert-config-columnas.dto';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { ConfigColumnasSchemaResponse } from '@grupometalicoemf/shared';

const MAX_PRECIOS = 10;
const MAX_EXISTENCIAS = 5;
const MAX_DESCRIPCIONES = 5;

@Injectable()
export class ConfigColumnasService {
  constructor(private prisma: PrismaService) {}

  async findAll(empresaId: string, ubicacionId: string, user: JwtPayload) {
    this.checkReadAccess(empresaId, user);

    return this.prisma.configColumnasUbicacion.findMany({
      where: { empresa_id: empresaId, ubicacion_id: ubicacionId },
      orderBy: [{ tipo: 'asc' }, { orden: 'asc' }, { numero: 'asc' }],
    });
  }

  async getSchema(
    empresaId: string,
    ubicacionId: string,
    user: JwtPayload,
  ): Promise<ConfigColumnasSchemaResponse> {
    this.checkReadAccess(empresaId, user);

    const columnas = await this.prisma.configColumnasUbicacion.findMany({
      where: { empresa_id: empresaId, ubicacion_id: ubicacionId },
      orderBy: [{ tipo: 'asc' }, { orden: 'asc' }, { numero: 'asc' }],
    });

    return {
      precios: columnas
        .filter((c) => c.tipo === TipoColumna.PRECIO)
        .map((c) => ({ numero: c.numero, label: c.label, activa: c.activa })),
      existencias: columnas
        .filter((c) => c.tipo === TipoColumna.EXISTENCIA)
        .map((c) => ({ numero: c.numero, label: c.label, activa: c.activa })),
      descripciones: columnas
        .filter((c) => c.tipo === TipoColumna.DESCRIPCION)
        .map((c) => ({ numero: c.numero, label: c.label, activa: c.activa })),
    };
  }

  async upsert(
    empresaId: string,
    ubicacionId: string,
    dto: UpsertConfigColumnasDto,
    user: JwtPayload,
  ) {
    this.checkAccess(empresaId, user);
    this.validateMaximos(dto.columnas);

    await this.prisma.$transaction(async (tx) => {
      for (const col of dto.columnas) {
        await tx.configColumnasUbicacion.upsert({
          where: {
            empresa_id_ubicacion_id_tipo_numero: {
              empresa_id: empresaId,
              ubicacion_id: ubicacionId,
              tipo: col.tipo,
              numero: col.numero,
            },
          },
          update: {
            label: col.label,
            activa: col.activa,
            orden: col.orden,
          },
          create: {
            empresa_id: empresaId,
            ubicacion_id: ubicacionId,
            tipo: col.tipo,
            numero: col.numero,
            label: col.label,
            activa: col.activa,
            orden: col.orden,
          },
        });
      }
    });

    return this.getSchema(empresaId, ubicacionId, user);
  }

  private checkReadAccess(empresaId: string, user: JwtPayload) {
    if (user.rol === 'SUPER_USUARIO') return;
    if (user.empresa_id !== empresaId) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }
  }

  private checkAccess(empresaId: string, user: JwtPayload) {
    if (user.rol === 'SUPER_USUARIO') return;
    if (!['ADMIN'].includes(user.rol)) {
      throw new ForbiddenException('Solo el Admin puede modificar la configuración de columnas');
    }
    if (user.empresa_id !== empresaId) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }
  }

  private validateMaximos(
    columnas: Array<{ tipo: TipoColumna; numero: number }>,
  ) {
    const precios = columnas.filter((c) => c.tipo === TipoColumna.PRECIO);
    const existencias = columnas.filter((c) => c.tipo === TipoColumna.EXISTENCIA);
    const descripciones = columnas.filter((c) => c.tipo === TipoColumna.DESCRIPCION);

    if (precios.some((c) => c.numero > MAX_PRECIOS)) {
      throw new BadRequestException(`Máximo ${MAX_PRECIOS} columnas de precio`);
    }
    if (existencias.some((c) => c.numero > MAX_EXISTENCIAS)) {
      throw new BadRequestException(`Máximo ${MAX_EXISTENCIAS} columnas de existencia`);
    }
    if (descripciones.some((c) => c.numero > MAX_DESCRIPCIONES)) {
      throw new BadRequestException(`Máximo ${MAX_DESCRIPCIONES} columnas de descripción`);
    }
  }
}
