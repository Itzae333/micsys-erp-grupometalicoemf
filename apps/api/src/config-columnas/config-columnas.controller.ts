import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigColumnasService } from './config-columnas.service';
import { UpsertConfigColumnasDto } from './dto/upsert-config-columnas.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SetMetadata } from '@nestjs/common';
import { SKIP_EMPRESA_UBICACION_KEY } from '../common/guards/empresa-ubicacion.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

const SkipEmpresaUbicacion = () => SetMetadata(SKIP_EMPRESA_UBICACION_KEY, true);

@ApiTags('ConfigColumnas')
@ApiBearerAuth()
@Controller('config-columnas/:empresaId/:ubicacionId')
export class ConfigColumnasController {
  constructor(private configColumnas: ConfigColumnasService) {}

  @Get()
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Columnas activas de una ubicación' })
  findAll(
    @Param('empresaId') empresaId: string,
    @Param('ubicacionId') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.configColumnas.findAll(empresaId, ubicacionId, user);
  }

  @Get('schema')
  @SkipEmpresaUbicacion()
  @ApiOperation({
    summary: 'Schema de columnas para el frontend de inventario',
    description: 'Devuelve precios, existencias y descripciones activas con sus labels',
  })
  getSchema(
    @Param('empresaId') empresaId: string,
    @Param('ubicacionId') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.configColumnas.getSchema(empresaId, ubicacionId, user);
  }

  @Put()
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Guardar configuración completa (upsert)' })
  upsert(
    @Param('empresaId') empresaId: string,
    @Param('ubicacionId') ubicacionId: string,
    @Body() dto: UpsertConfigColumnasDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.configColumnas.upsert(empresaId, ubicacionId, dto, user);
  }
}
