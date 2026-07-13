import { Controller, Get, Post, Param, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { CargasNotaService } from './cargas-nota.service';
import { RegistrarCargaDto } from './dto/cargas-nota.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Cargas de nota')
@ApiBearerAuth()
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@Controller('ventas')
export class CargasNotaController {
  constructor(private cargas: CargasNotaService) {}

  @Get(':id/carga')
  @Roles('ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Consultar avance de carga/entrega de una nota (cantidades cargadas y pendientes por línea)' })
  getPendientes(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.cargas.getPendientes(id, ubicacionId);
  }

  @Post(':id/carga')
  @Roles('ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Registrar un evento de carga/entrega de mercancía (descuenta existencias)' })
  registrarCarga(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: RegistrarCargaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cargas.registrarCarga(id, ubicacionId, user.sub, dto);
  }
}
