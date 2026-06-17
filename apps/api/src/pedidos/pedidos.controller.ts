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
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@Controller('pedidos')
export class PedidosController {
  constructor(private pedidos: PedidosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista de pedidos con filtros y paginación' })
  @ApiQuery({ name: 'estatus', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'desde', required: false })
  findAll(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Query('estatus') estatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('desde') desde?: string,
  ) {
    return this.pedidos.findAll(ubicacionId, {
      estatus,
      q,
      desde,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 100) : 50,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de pedido' })
  findOne(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.pedidos.findOne(id, ubicacionId);
  }

  @Post()
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Crear pedido' })
  create(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePedidoDto,
  ) {
    return this.pedidos.create(dto, ubicacionId, user.sub);
  }

  @Post(':id/lineas')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Agregar línea a pedido' })
  addLinea(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: AddLineaPedidoDto,
  ) {
    return this.pedidos.addLinea(id, dto, ubicacionId);
  }

  @Patch(':id/lineas/:lineaId')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Actualizar línea de pedido' })
  updateLinea(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
    @Body() dto: UpdateLineaPedidoDto,
  ) {
    return this.pedidos.updateLinea(id, lineaId, dto, ubicacionId);
  }

  @Delete(':id/lineas/:lineaId')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Eliminar línea de pedido' })
  removeLinea(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
  ) {
    return this.pedidos.removeLinea(id, lineaId, ubicacionId);
  }

  @Post(':id/anticipos')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Registrar anticipo en pedido — retorna payload para ticket' })
  registrarAnticipo(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RegistrarAnticipoDto,
  ) {
    return this.pedidos.registrarAnticipo(id, dto, ubicacionId, user.sub);
  }

  @Post(':id/liquidar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Liquidar pedido: crea nota de venta y retorna payload para ticket' })
  liquidar(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: LiquidarPedidoDto,
  ) {
    return this.pedidos.liquidar(id, dto, ubicacionId, user.sub);
  }

  @Patch(':id/cancelar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Cancelar pedido (solo si no tiene anticipos)' })
  cancelar(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.pedidos.cancelar(id, ubicacionId);
  }

  @Post(':id/evidencias')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Agregar evidencia de pago al pedido' })
  agregarEvidencia(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: AgregarEvidenciaPedidoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pedidos.agregarEvidencia(id, dto, ubicacionId, user.sub);
  }
}
