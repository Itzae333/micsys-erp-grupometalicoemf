import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { VentasService } from './ventas.service';
import { CreateNotaDto, AddLineaDto, UpdateLineaDto, CerrarNotaDto, AbonarNotaDto, SendEmailDto, AgregarEvidenciaDto } from './dto/ventas.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Ventas')
@ApiBearerAuth()
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@Controller('ventas')
export class VentasController {
  constructor(private ventas: VentasService) {}

  @Get('corte-caja')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Corte de caja — resumen de ventas y métodos de pago por rango de fechas' })
  @ApiQuery({ name: 'desde', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, description: 'YYYY-MM-DD' })
  getCorteCaja(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.ventas.getCorteCaja(ubicacionId, { desde, hasta });
  }

  @Get()
  @ApiOperation({ summary: 'Lista de notas de venta con filtros y paginación' })
  @ApiQuery({ name: 'estatus', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'desde', required: false, description: 'ISO date — filtra notas creadas desde esta fecha' })
  findAll(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Query('estatus') estatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('desde') desde?: string,
  ) {
    return this.ventas.findAll(ubicacionId, {
      estatus,
      q,
      desde,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de nota de venta' })
  findOne(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.ventas.findOne(id, ubicacionId);
  }

  @Post()
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Crear nota de venta' })
  create(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateNotaDto,
  ) {
    return this.ventas.create(dto, ubicacionId, user.sub);
  }

  @Post(':id/lineas')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Agregar línea a nota de venta' })
  addLinea(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: AddLineaDto,
  ) {
    return this.ventas.addLinea(id, dto, ubicacionId);
  }

  @Patch(':id/lineas/:lineaId')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Actualizar cantidad/precio/descuento de una línea' })
  updateLinea(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
    @Body() dto: UpdateLineaDto,
  ) {
    return this.ventas.updateLinea(id, lineaId, dto, ubicacionId);
  }

  @Delete(':id/lineas/:lineaId')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Eliminar línea de nota de venta' })
  removeLinea(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
  ) {
    return this.ventas.removeLinea(id, lineaId, ubicacionId);
  }

  @Post(':id/cerrar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Cerrar/cobrar nota de venta con pagos' })
  cerrar(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: CerrarNotaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ventas.cerrar(id, dto, ubicacionId, user.sub);
  }

  @Patch(':id/pendiente')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Marcar nota como pendiente de pago (se cobrará al entregar)' })
  marcarPendiente(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.ventas.marcarPendiente(id, ubicacionId);
  }

  @Patch(':id/convertir')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Convertir cotización a nota de venta activa' })
  convertir(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.ventas.convertirAVenta(id, ubicacionId);
  }

  @Patch(':id/cancelar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Cancelar nota de venta' })
  cancelar(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.ventas.cancelar(id, ubicacionId);
  }

  @Post(':id/abonar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Registrar abono en una nota con estatus CRÉDITO' })
  abonar(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: AbonarNotaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ventas.abonar(id, dto, ubicacionId, user.sub);
  }

  @Post(':id/evidencias')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Agregar evidencia de pago (comprobante de tarjeta, transferencia o depósito)' })
  agregarEvidencia(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: AgregarEvidenciaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ventas.agregarEvidencia(id, dto, empresaId, user.sub);
  }

  @Post(':id/send-email')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Enviar cotización o comprobante por correo electrónico' })
  sendEmail(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: SendEmailDto,
  ) {
    return this.ventas.sendEmail(id, empresaId, dto);
  }
}
