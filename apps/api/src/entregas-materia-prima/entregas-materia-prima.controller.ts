import { Controller, Get, Post, Patch, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { EntregasMateriaPrimaService } from './entregas-materia-prima.service';
import { CreateEntregaDto, CreateDevolucionDto } from './dto/entregas-materia-prima.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

const LECTURA  = ['ADMIN', 'ENCARGADO'] as const;
const ESCRITURA = ['ADMIN', 'ENCARGADO'] as const;
const REPORTE   = ['SUPER_USUARIO', 'ADMIN'] as const;

@ApiTags('Entregas de materia prima')
@ApiBearerAuth()
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@Controller('entregas-materia-prima')
export class EntregasMateriaPrimaController {
  constructor(private entregas: EntregasMateriaPrimaService) {}

  @Get()
  @Roles(...LECTURA)
  @ApiOperation({ summary: 'Listar entregas de materia prima de la ubicación' })
  @ApiQuery({ name: 'areaId',     required: false })
  @ApiQuery({ name: 'empleadoId', required: false })
  @ApiQuery({ name: 'articuloId', required: false })
  @ApiQuery({ name: 'estatus',    required: false })
  @ApiQuery({ name: 'desde',      required: false })
  @ApiQuery({ name: 'hasta',      required: false })
  @ApiQuery({ name: 'page',       required: false })
  @ApiQuery({ name: 'limit',      required: false })
  listar(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Query('areaId') areaId?: string,
    @Query('empleadoId') empleadoId?: string,
    @Query('articuloId') articuloId?: string,
    @Query('estatus') estatus?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.entregas.listar(ubicacionId, {
      areaId, empleadoId, articuloId, estatus, desde, hasta,
      page:  page  ? Number(page)                : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }

  // Antes de ':id' para que "reporte" no se interprete como un id.
  @Get('reporte')
  @Roles(...REPORTE)
  @ApiOperation({ summary: 'Consumo de materia prima por área, empleado y artículo' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  reporte(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.entregas.reporte(ubicacionId, { desde, hasta });
  }

  @Get(':id')
  @Roles(...LECTURA)
  @ApiOperation({ summary: 'Detalle de entrega con líneas y devoluciones' })
  findOne(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.entregas.findOne(id, ubicacionId);
  }

  @Post()
  @Roles(...ESCRITURA)
  @ApiOperation({ summary: 'Registrar entrega (descuenta existencia del inventario)' })
  crear(
    @Headers('x-empresa-id') empresaId: string,
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Body() dto: CreateEntregaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.entregas.crear(dto, empresaId, ubicacionId, user.sub);
  }

  @Post(':id/devoluciones')
  @Roles(...ESCRITURA)
  @ApiOperation({ summary: 'Registrar devolución (sobrante, defectuoso, merma o error de entrega)' })
  registrarDevolucion(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: CreateDevolucionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.entregas.registrarDevolucion(id, dto, ubicacionId, user.sub);
  }

  @Patch(':id/cancelar')
  @Roles(...ESCRITURA)
  @ApiOperation({ summary: 'Cancelar entrega sin devoluciones (restituye la existencia)' })
  cancelar(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.entregas.cancelar(id, ubicacionId, user.sub);
  }
}
