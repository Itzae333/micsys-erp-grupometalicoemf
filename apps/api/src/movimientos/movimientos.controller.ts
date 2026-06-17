import { Controller, Get, Post, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { MovimientosService } from './movimientos.service';
import { EntradaDto, SalidaDto, TransferenciaDto, AjusteDto } from './dto/movimientos.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Movimientos de Inventario')
@ApiBearerAuth()
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@Controller('movimientos')
export class MovimientosController {
  constructor(private movimientos: MovimientosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar movimientos de inventario' })
  @ApiQuery({ name: 'tipo',       required: false })
  @ApiQuery({ name: 'articuloId', required: false })
  @ApiQuery({ name: 'page',       required: false })
  @ApiQuery({ name: 'limit',      required: false })
  listar(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Query('tipo')       tipo?: string,
    @Query('articuloId') articuloId?: string,
    @Query('page')       page?: string,
    @Query('limit')      limit?: string,
  ) {
    return this.movimientos.listar(ubicacionId, {
      tipo,
      articuloId,
      page:  page  ? Number(page)                  : 1,
      limit: limit ? Math.min(Number(limit), 100)  : 50,
    });
  }

  @Post('entrada')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Registrar entrada de mercancía (aumenta existencia)' })
  registrarEntrada(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Body() dto: EntradaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.movimientos.registrarEntrada(dto, ubicacionId, user.sub);
  }

  @Post('salida')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Registrar salida interna (reduce existencia)' })
  registrarSalida(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Body() dto: SalidaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.movimientos.registrarSalida(dto, ubicacionId, user.sub);
  }

  @Post('transferencia')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Transferir cantidad entre slots de existencia' })
  registrarTransferencia(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Body() dto: TransferenciaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.movimientos.registrarTransferencia(dto, ubicacionId, user.sub);
  }

  @Post('ajuste')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Ajuste de inventario por conteo físico (solo ADMIN/SUPER)' })
  registrarAjuste(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Body() dto: AjusteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.movimientos.registrarAjuste(dto, ubicacionId, user.sub);
  }
}
