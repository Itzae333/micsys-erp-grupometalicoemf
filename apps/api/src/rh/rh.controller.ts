import { Controller, Get, Post, Patch, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { RhService } from './rh.service';
import {
  CreateAreaDto, UpdateAreaDto,
  CreateEmpleadoDto, UpdateEmpleadoDto,
  RegistrarAsistenciaDto, EditarAsistenciaDto,
  CreateOrdenProduccionDto, AvanceProduccionDto,
} from './dto/rh.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('RH')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('rh')
export class RhController {
  constructor(private rh: RhService) {}

  // ── Áreas ──────────────────────────────────────────────────

  @Get('areas')
  @ApiOperation({ summary: 'Listar áreas de trabajo' })
  @ApiQuery({ name: 'soloActivas', required: false })
  listarAreas(
    @Headers('x-empresa-id') empresaId: string,
    @Query('soloActivas') soloActivas?: string,
  ) {
    return this.rh.listarAreas(empresaId, soloActivas === 'true');
  }

  @Post('areas')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Crear área de trabajo con tipo de pago y sanciones' })
  crearArea(
    @Headers('x-empresa-id') empresaId: string,
    @Body() dto: CreateAreaDto,
  ) {
    return this.rh.crearArea(dto, empresaId);
  }

  @Patch('areas/:id')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Actualizar área (nombre, sanciones, activa)' })
  actualizarArea(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAreaDto,
  ) {
    return this.rh.actualizarArea(id, dto, empresaId);
  }

  // ── Empleados ──────────────────────────────────────────────

  @Get('empleados')
  @ApiOperation({ summary: 'Listar empleados' })
  @ApiQuery({ name: 'q',      required: false })
  @ApiQuery({ name: 'areaId', required: false })
  @ApiQuery({ name: 'activo', required: false })
  @ApiQuery({ name: 'page',   required: false })
  @ApiQuery({ name: 'limit',  required: false })
  listarEmpleados(
    @Headers('x-empresa-id') empresaId: string,
    @Query('q')      q?: string,
    @Query('areaId') areaId?: string,
    @Query('activo') activo?: string,
    @Query('page')   page?: string,
    @Query('limit')  limit?: string,
  ) {
    return this.rh.listarEmpleados(empresaId, {
      q, areaId, activo,
      page:  page  ? Number(page)                 : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }

  @Get('empleados/:id')
  @ApiOperation({ summary: 'Detalle de empleado' })
  getEmpleado(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
  ) {
    return this.rh.getEmpleado(id, empresaId);
  }

  @Post('empleados')
  @Roles('SUPER_USUARIO', 'ADMIN', 'JEFE_RH')
  @ApiOperation({ summary: 'Crear empleado' })
  crearEmpleado(
    @Headers('x-empresa-id') empresaId: string,
    @Body() dto: CreateEmpleadoDto,
  ) {
    return this.rh.crearEmpleado(dto, empresaId);
  }

  @Patch('empleados/:id')
  @Roles('SUPER_USUARIO', 'ADMIN', 'JEFE_RH')
  @ApiOperation({ summary: 'Actualizar empleado' })
  actualizarEmpleado(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmpleadoDto,
  ) {
    return this.rh.actualizarEmpleado(id, dto, empresaId);
  }

  @Patch('empleados/:id/toggle')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Activar / desactivar empleado' })
  toggleEmpleado(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
  ) {
    return this.rh.toggleEmpleado(id, empresaId);
  }

  // ── Asistencia ─────────────────────────────────────────────

  @Get('asistencia')
  @Roles('SUPER_USUARIO', 'ADMIN', 'JEFE_RH', 'JEFE_MANUFACTURA', 'ENCARGADO')
  @ApiOperation({ summary: 'Listar registros de asistencia' })
  @ApiQuery({ name: 'empleadoId', required: false })
  @ApiQuery({ name: 'fecha',      required: false })
  @ApiQuery({ name: 'page',       required: false })
  @ApiQuery({ name: 'limit',      required: false })
  listarAsistencia(
    @Headers('x-empresa-id') empresaId: string,
    @Query('empleadoId') empleadoId?: string,
    @Query('fecha')      fecha?: string,
    @Query('page')       page?: string,
    @Query('limit')      limit?: string,
  ) {
    return this.rh.listarAsistencia(empresaId, {
      empleadoId, fecha,
      page:  page  ? Number(page)                 : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }

  @Post('asistencia')
  @Roles('SUPER_USUARIO', 'ADMIN', 'JEFE_RH', 'ENCARGADO')
  @ApiOperation({ summary: 'Registrar o actualizar asistencia (upsert por empleado+fecha). Calcula sanción automáticamente.' })
  registrarAsistencia(
    @Headers('x-empresa-id') empresaId: string,
    @Body() dto: RegistrarAsistenciaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rh.registrarAsistencia(dto, empresaId, user.sub);
  }

  @Patch('asistencia/:id')
  @Roles('SUPER_USUARIO', 'ADMIN', 'JEFE_RH', 'ENCARGADO')
  @ApiOperation({ summary: 'Editar registro de asistencia' })
  editarAsistencia(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: EditarAsistenciaDto,
  ) {
    return this.rh.editarAsistencia(id, dto, empresaId);
  }

  // ── Producción ─────────────────────────────────────────────

  @Get('produccion')
  @ApiOperation({ summary: 'Listar órdenes de producción' })
  @ApiQuery({ name: 'estatus',    required: false })
  @ApiQuery({ name: 'articuloId', required: false })
  @ApiQuery({ name: 'page',       required: false })
  @ApiQuery({ name: 'limit',      required: false })
  listarOrdenes(
    @Headers('x-empresa-id') empresaId: string,
    @Query('estatus')    estatus?: string,
    @Query('articuloId') articuloId?: string,
    @Query('page')       page?: string,
    @Query('limit')      limit?: string,
  ) {
    return this.rh.listarOrdenes(empresaId, {
      estatus, articuloId,
      page:  page  ? Number(page)                 : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }

  @Get('produccion/:id')
  @ApiOperation({ summary: 'Detalle de una OP' })
  getOrden(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.rh.getOrden(id, empresaId);
  }

  @Post('produccion')
  @Roles('SUPER_USUARIO', 'ADMIN', 'JEFE_MANUFACTURA')
  @ApiOperation({ summary: 'Crear orden de producción' })
  crearOrden(
    @Headers('x-empresa-id') empresaId: string,
    @Body() dto: CreateOrdenProduccionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rh.crearOrden(dto, empresaId, user.sub);
  }

  @Patch('produccion/:id/avance')
  @Roles('SUPER_USUARIO', 'ADMIN', 'JEFE_MANUFACTURA', 'ALMACENISTA')
  @ApiOperation({ summary: 'Registrar avance de producción (dispara Entrada F5)' })
  registrarAvance(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: AvanceProduccionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rh.registrarAvance(id, dto, empresaId, user.sub);
  }

  @Patch('produccion/:id/cerrar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'JEFE_MANUFACTURA')
  @ApiOperation({ summary: 'Cerrar / completar OP manualmente' })
  cerrarOrden(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.rh.cerrarOrden(id, empresaId);
  }

  @Patch('produccion/:id/cancelar')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Cancelar OP' })
  cancelarOrden(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.rh.cancelarOrden(id, empresaId);
  }

  // ── Nómina ─────────────────────────────────────────────────

  @Get('nomina')
  @Roles('SUPER_USUARIO', 'ADMIN', 'JEFE_RH')
  @ApiOperation({ summary: 'Calcular nómina del período' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  getNomina(
    @Headers('x-empresa-id') empresaId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.rh.getNomina(empresaId, { desde, hasta });
  }
}
