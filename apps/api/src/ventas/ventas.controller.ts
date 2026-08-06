import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { VentasService } from './ventas.service';
import { CreateNotaDto, AddLineaDto, UpdateLineaDto, CerrarNotaDto, CancelarNotaDto, AbonarNotaDto, SendEmailDto, AgregarEvidenciaDto, VentaRapidaDto } from './dto/ventas.dto';
import { SolicitudesEdicionService } from '../solicitudes-edicion/solicitudes-edicion.service';
import { CrearSolicitudDto } from '../solicitudes-edicion/dto/solicitudes-edicion.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Ventas')
@ApiBearerAuth()
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@Controller('ventas')
export class VentasController {
  constructor(
    private ventas: VentasService,
    private solicitudesEdicion: SolicitudesEdicionService,
  ) {}

  @Get('corte-caja')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Corte de caja — resumen de ventas y métodos de pago por rango de fechas' })
  @ApiQuery({ name: 'desde', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, description: 'YYYY-MM-DD' })
  getCorteCaja(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.ventas.getCorteCaja(ubicacionId, { desde, hasta }, user.rol);
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

  @Post('rapida')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Crear y cerrar una venta completa en una sola operación atómica (usado por el flujo offline)' })
  ventaRapida(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: VentaRapidaDto,
  ) {
    return this.ventas.ventaRapida(dto, ubicacionId, user.sub);
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

  @Patch(':id/mover-a-credito')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Mover una nota PENDIENTE a CRÉDITO manualmente, cargando el saldo a la cuenta del cliente con la fecha original de la nota' })
  moverACredito(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ventas.moverACredito(id, ubicacionId, user.sub);
  }

  @Patch(':id/cancelar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Cancelar nota de venta (solo si no está pagada, requiere motivo)' })
  cancelar(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: CancelarNotaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ventas.cancelar(id, dto, ubicacionId, user.sub);
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
  @ApiOperation({ summary: 'Enviar comprobante de venta por correo electrónico' })
  sendEmail(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: SendEmailDto,
  ) {
    return this.ventas.sendEmail(id, empresaId, dto);
  }

  @Post(':id/solicitudes-edicion')
  @Roles('ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Solicitar edición de una venta ya cobrada (requiere autorización del ADMIN por correo)' })
  crearSolicitudEdicion(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: CrearSolicitudDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.solicitudesEdicion.crear(id, ubicacionId, user.sub, dto);
  }

  @Get(':id/solicitudes-edicion')
  @Roles('ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Historial de solicitudes de edición de una venta' })
  listarSolicitudesEdicion(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
  ) {
    return this.solicitudesEdicion.listarPorNota(id, ubicacionId);
  }

  @Post(':id/solicitudes-edicion/abrir-directo')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'ADMIN reabre una venta cobrada de inmediato, sin pasar por aprobación por correo' })
  abrirDirecto(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: CrearSolicitudDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.solicitudesEdicion.aperturarDirecto(id, ubicacionId, user.sub, dto);
  }
}
