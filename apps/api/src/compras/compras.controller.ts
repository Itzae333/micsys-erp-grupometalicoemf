import { Controller, Get, Post, Patch, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { ComprasService } from './compras.service';
import {
  CreateOrdenCompraDto, RecibirOrdenCompraDto,
  AbonoProveedorDto, AjusteCuentaProveedorDto,
} from './dto/compras.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Compras')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('compras')
export class ComprasController {
  constructor(private compras: ComprasService) {}

  // ── Órdenes de Compra ──────────────────────────────────────

  @Get('ordenes')
  @ApiOperation({ summary: 'Listar órdenes de compra' })
  @ApiQuery({ name: 'estatus',     required: false })
  @ApiQuery({ name: 'proveedorId', required: false })
  @ApiQuery({ name: 'page',        required: false })
  @ApiQuery({ name: 'limit',       required: false })
  listarOrdenes(
    @Headers('x-empresa-id') empresaId: string,
    @Query('estatus')     estatus?: string,
    @Query('proveedorId') proveedorId?: string,
    @Query('page')        page?: string,
    @Query('limit')       limit?: string,
  ) {
    return this.compras.listarOrdenes(empresaId, {
      estatus,
      proveedorId,
      page:  page  ? Number(page)                 : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }

  @Get('ordenes/:id')
  @ApiOperation({ summary: 'Detalle de una OC con líneas' })
  getOrden(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
  ) {
    return this.compras.getOrden(id, empresaId);
  }

  @Post('ordenes')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Crear OC en estado BORRADOR' })
  crearOrden(
    @Headers('x-empresa-id') empresaId: string,
    @Body() dto: CreateOrdenCompraDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.compras.crearOrden(dto, empresaId, user.sub);
  }

  @Patch('ordenes/:id/aprobar')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Aprobar OC (BORRADOR → APROBADA)' })
  aprobarOrden(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.compras.aprobarOrden(id, empresaId, user.sub);
  }

  @Post('ordenes/:id/recibir')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Registrar recepción de mercancía (dispara Entradas F5)' })
  recibirOrden(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: RecibirOrdenCompraDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.compras.recibirOrden(id, dto, empresaId, user.sub);
  }

  @Patch('ordenes/:id/cancelar')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Cancelar OC (excepto las ya RECIBIDA)' })
  cancelarOrden(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
  ) {
    return this.compras.cancelarOrden(id, empresaId);
  }

  // ── Cuentas por Pagar ──────────────────────────────────────

  @Get('cuenta/:proveedorId')
  @ApiOperation({ summary: 'Estado de cuenta del proveedor (saldo + movimientos)' })
  @ApiQuery({ name: 'page',  required: false })
  @ApiQuery({ name: 'limit', required: false })
  getCuentaProveedor(
    @Headers('x-empresa-id') empresaId: string,
    @Param('proveedorId') proveedorId: string,
    @Query('page')  page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.compras.getCuentaProveedor(proveedorId, empresaId, {
      page:  page  ? Number(page)                 : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }

  @Post('cuenta/:proveedorId/abono')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Registrar pago a proveedor (reduce saldo)' })
  registrarAbono(
    @Headers('x-empresa-id') empresaId: string,
    @Param('proveedorId') proveedorId: string,
    @Body() dto: AbonoProveedorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.compras.registrarAbono(proveedorId, dto, empresaId, user.sub);
  }

  @Post('cuenta/:proveedorId/ajuste')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Ajuste manual de cuenta proveedor (solo ADMIN/SUPER)' })
  registrarAjuste(
    @Headers('x-empresa-id') empresaId: string,
    @Param('proveedorId') proveedorId: string,
    @Body() dto: AjusteCuentaProveedorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.compras.registrarAjuste(proveedorId, dto, empresaId, user.sub);
  }
}
