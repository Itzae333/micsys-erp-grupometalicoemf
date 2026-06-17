import { Controller, Get, Post, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { CuentasService } from './cuentas.service';
import { AbonoDto, AjusteDto } from './dto/cuentas.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Cuentas y Crédito')
@ApiBearerAuth()
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@Controller('cuentas')
export class CuentasController {
  constructor(private cuentas: CuentasService) {}

  @Get()
  @ApiOperation({ summary: 'Resumen de clientes con saldo pendiente' })
  getResumen(@Headers('x-ubicacion-id') ubicacionId: string) {
    return this.cuentas.getResumen(ubicacionId);
  }

  @Get(':clienteId')
  @ApiOperation({ summary: 'Detalle de cuenta y movimientos de un cliente' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getCuenta(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('clienteId') clienteId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.cuentas.getCuenta(
      clienteId,
      ubicacionId,
      page ? Number(page) : 1,
      limit ? Math.min(Number(limit), 100) : 50,
    );
  }

  @Post(':clienteId/abonos')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Registrar abono a cuenta de cliente' })
  registrarAbono(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('clienteId') clienteId: string,
    @Body() dto: AbonoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cuentas.registrarAbono(clienteId, dto, ubicacionId, user.sub);
  }

  @Post(':clienteId/ajustes')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Ajuste manual de saldo (solo ADMIN/SUPER)' })
  registrarAjuste(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('clienteId') clienteId: string,
    @Body() dto: AjusteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cuentas.registrarAjuste(clienteId, dto, ubicacionId, user.sub);
  }
}
