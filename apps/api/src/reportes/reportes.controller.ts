import { Controller, Get, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { ReportesService } from './reportes.service';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Reportes')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('reportes')
export class ReportesController {
  constructor(private reportes: ReportesService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'KPIs del día y del mes para el dashboard principal' })
  getDashboard(@Headers('x-empresa-id') empresaId: string) {
    return this.reportes.getDashboard(empresaId);
  }

  @Get('dashboard-global')
  @Roles('SUPER_USUARIO')
  @ApiOperation({ summary: 'KPIs consolidados de todas las empresas — solo SUPER_USUARIO' })
  getDashboardGlobal() {
    return this.reportes.getDashboardGlobal();
  }

  @Get('ventas')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Reporte de ventas por rango de fechas' })
  @ApiQuery({ name: 'desde',       required: false })
  @ApiQuery({ name: 'hasta',       required: false })
  @ApiQuery({ name: 'ubicacionId', required: false })
  getVentas(
    @Headers('x-empresa-id') empresaId: string,
    @Query('desde')       desde?: string,
    @Query('hasta')       hasta?: string,
    @Query('ubicacionId') ubicacionId?: string,
  ) {
    return this.reportes.getReporteVentas(empresaId, { desde, hasta, ubicacionId });
  }

  @Get('inventario')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Reporte de inventario: bajo stock y movimientos del mes' })
  getInventario(@Headers('x-empresa-id') empresaId: string) {
    return this.reportes.getReporteInventario(empresaId);
  }

  @Get('credito')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Reporte de cartera de crédito y clientes con saldo' })
  getCredito(@Headers('x-empresa-id') empresaId: string) {
    return this.reportes.getReporteCredito(empresaId);
  }

  @Get('compras')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Reporte de órdenes de compra y cuentas por pagar' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  getCompras(
    @Headers('x-empresa-id') empresaId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.reportes.getReporteCompras(empresaId, { desde, hasta });
  }

  @Get('produccion')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Reporte de órdenes de producción por rango de fechas' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  getProduccion(
    @Headers('x-empresa-id') empresaId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.reportes.getReporteProduccion(empresaId, { desde, hasta });
  }

  @Get('asistencia')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Reporte de asistencia de empleados por rango de fechas' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  getAsistencia(
    @Headers('x-empresa-id') empresaId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.reportes.getReporteAsistencia(empresaId, { desde, hasta });
  }

  @Get('corte-caja')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Corte de caja por rango de fechas' })
  @ApiQuery({ name: 'desde',       required: false })
  @ApiQuery({ name: 'hasta',       required: false })
  @ApiQuery({ name: 'ubicacionId', required: false })
  getCorteCaja(
    @Headers('x-empresa-id') empresaId: string,
    @Query('desde')       desde?: string,
    @Query('hasta')       hasta?: string,
    @Query('ubicacionId') ubicacionId?: string,
  ) {
    return this.reportes.getCorteCaja(empresaId, { desde, hasta, ubicacionId });
  }

  @Get('auditoria')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Log de auditoría — solo ADMIN/SUPER_USUARIO' })
  @ApiQuery({ name: 'entidad',   required: false })
  @ApiQuery({ name: 'usuarioId', required: false })
  @ApiQuery({ name: 'page',      required: false })
  @ApiQuery({ name: 'limit',     required: false })
  getAuditoria(
    @Headers('x-empresa-id') empresaId: string,
    @Query('entidad')   entidad?: string,
    @Query('usuarioId') usuarioId?: string,
    @Query('page')      page?: string,
    @Query('limit')     limit?: string,
  ) {
    return this.reportes.getAuditoria(empresaId, {
      entidad,
      usuarioId,
      page:  page  ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }
}
