import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { CotizacionesService } from './cotizaciones.service';
import {
  CreateCotizacionDto, AddLineaCotizacionDto, UpdateLineaCotizacionDto,
  CancelarCotizacionDto, SendEmailCotizacionDto,
} from './dto/cotizaciones.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Cotizaciones')
@ApiBearerAuth()
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private cotizaciones: CotizacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista de cotizaciones con filtros y paginación' })
  @ApiQuery({ name: 'estatus', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Query('estatus') estatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.cotizaciones.findAll(ubicacionId, {
      estatus,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de cotización' })
  findOne(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.cotizaciones.findOne(id, ubicacionId);
  }

  @Post()
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Crear cotización' })
  create(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCotizacionDto,
  ) {
    return this.cotizaciones.create(dto, ubicacionId, user.sub);
  }

  @Post(':id/lineas')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Agregar línea a cotización' })
  addLinea(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: AddLineaCotizacionDto,
  ) {
    return this.cotizaciones.addLinea(id, dto, ubicacionId);
  }

  @Patch(':id/lineas/:lineaId')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Actualizar cantidad/precio/descuento de una línea' })
  updateLinea(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
    @Body() dto: UpdateLineaCotizacionDto,
  ) {
    return this.cotizaciones.updateLinea(id, lineaId, dto, ubicacionId);
  }

  @Delete(':id/lineas/:lineaId')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Eliminar línea de cotización' })
  removeLinea(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
  ) {
    return this.cotizaciones.removeLinea(id, lineaId, ubicacionId);
  }

  @Patch(':id/cancelar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Cancelar/descartar cotización (requiere motivo)' })
  cancelar(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: CancelarCotizacionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cotizaciones.cancelar(id, dto, ubicacionId, user.sub);
  }

  @Patch(':id/convertir')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Convertir cotización a una nota de venta nueva (folio propio de ventas)' })
  convertir(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cotizaciones.convertirAVenta(id, ubicacionId, user.sub);
  }

  @Post(':id/send-email')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Enviar cotización por correo electrónico' })
  sendEmail(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: SendEmailCotizacionDto,
  ) {
    return this.cotizaciones.sendEmail(id, empresaId, dto);
  }
}
