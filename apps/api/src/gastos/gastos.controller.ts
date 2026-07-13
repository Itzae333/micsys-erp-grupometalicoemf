import { Controller, Get, Post, Delete, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { GastosService } from './gastos.service';
import { CreateGastoDto } from './dto/gastos.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Gastos')
@ApiBearerAuth()
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('gastos')
export class GastosController {
  constructor(private gastos: GastosService) {}

  @Get()
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Listar gastos por rango de fechas' })
  @ApiQuery({ name: 'desde', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, description: 'YYYY-MM-DD' })
  findAll(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.gastos.findAll(ubicacionId, { desde, hasta });
  }

  @Post()
  @Roles('ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Registrar un gasto (afecta el corte de caja del método de pago usado)' })
  create(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Headers('x-empresa-id') empresaId: string,
    @Body() dto: CreateGastoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gastos.create(dto, empresaId, ubicacionId, user.sub);
  }

  @Delete(':id')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Eliminar un gasto registrado por error' })
  remove(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.gastos.remove(id, ubicacionId);
  }
}
