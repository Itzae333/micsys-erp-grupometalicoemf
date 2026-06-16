import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { PedidosService } from './pedidos.service';
import {
  CreatePedidoDto, AddLineaPedidoDto, UpdateLineaPedidoDto,
  RegistrarAnticipoDto, LiquidarPedidoDto, AgregarEvidenciaPedidoDto,
} from './dto/pedidos.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Pedidos')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('pedidos')
export class PedidosController {
  constructor(private pedidos: PedidosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista de pedidos con filtros y paginación' })
  @ApiQuery({ name: 'estatus', required: false })
  @ApiQuery({ name: 'ubicacionId', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'desde', required: false })
  findAll(
    @Headers('x-empresa-id') empresaId: string,
    @Query('estatus') estatus?: string,
    @Query('ubicacionId') ubicacionId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('desde') desde?: string,
  ) {
    return this.pedidos.findAll(empresaId, {
      estatus,
      ubicacionId,
      q,
      desde,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de pedido' })
  findOne(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.pedidos.findOne(id, empresaId);
  }

  @Post()
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Crear pedido' })
  @ApiHeader({ name: 'x-ubicacion-id', required: true })
  create(
    @Headers('x-empresa-id') empresaId: string,
    @Headers('x-ubicacion-id') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePedidoDto,
  ) {
    return this.pedidos.create(dto, empresaId, ubicacionId, user.sub);
  }

  @Post(':id/lineas')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Agregar línea a pedido' })
  addLinea(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: AddLineaPedidoDto,
  ) {
    return this.pedidos.addLinea(id, dto, empresaId);
  }

  @Patch(':id/lineas/:lineaId')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Actualizar línea de pedido' })
  updateLinea(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
    @Body() dto: UpdateLineaPedidoDto,
  ) {
    return this.pedidos.updateLinea(id, lineaId, dto, empresaId);
  }

  @Delete(':id/lineas/:lineaId')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Eliminar línea de pedido' })
  removeLinea(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
  ) {
    return this.pedidos.removeLinea(id, lineaId, empresaId);
  }

  @Post(':id/anticipos')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Registrar anticipo en pedido — retorna payload para ticket' })
  @ApiHeader({ name: 'x-ubicacion-id', required: true })
  registrarAnticipo(
    @Headers('x-empresa-id') empresaId: string,
    @Headers('x-ubicacion-id') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RegistrarAnticipoDto,
  ) {
    return this.pedidos.registrarAnticipo(id, dto, empresaId, ubicacionId, user.sub);
  }

  @Post(':id/liquidar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Liquidar pedido: crea nota de venta y retorna payload para ticket' })
  @ApiHeader({ name: 'x-ubicacion-id', required: true })
  liquidar(
    @Headers('x-empresa-id') empresaId: string,
    @Headers('x-ubicacion-id') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: LiquidarPedidoDto,
  ) {
    return this.pedidos.liquidar(id, dto, empresaId, ubicacionId, user.sub);
  }

  @Patch(':id/cancelar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Cancelar pedido (solo si no tiene anticipos)' })
  cancelar(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.pedidos.cancelar(id, empresaId);
  }

  @Post(':id/evidencias')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Agregar evidencia de pago al pedido' })
  agregarEvidencia(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: AgregarEvidenciaPedidoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pedidos.agregarEvidencia(id, dto, empresaId, user.sub);
  }
}
