import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SolicitudesAbonoService } from './solicitudes-abono.service';
import { AprobarSolicitudAbonoDto, RechazarSolicitudAbonoDto } from './dto/solicitudes-abono.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Solicitudes de edición de abonos')
@Controller('solicitudes-abono')
export class SolicitudesAbonoController {
  constructor(private solicitudes: SolicitudesAbonoService) {}

  @Get('token/:token')
  @Public()
  @ApiOperation({ summary: 'Consultar (sin login) una solicitud de edición de abono por su token de aprobación' })
  obtenerPorToken(@Param('token') token: string) {
    return this.solicitudes.obtenerPorToken(token);
  }

  @Post('token/:token/aprobar')
  @Public()
  @ApiOperation({ summary: 'Autorizar (sin login) la edición/eliminación del abono asociado al token' })
  aprobar(@Param('token') token: string, @Body() dto: AprobarSolicitudAbonoDto) {
    return this.solicitudes.aprobar(token, dto);
  }

  @Post('token/:token/rechazar')
  @Public()
  @ApiOperation({ summary: 'Rechazar (sin login) la solicitud de edición de abono asociada al token' })
  rechazar(@Param('token') token: string, @Body() dto: RechazarSolicitudAbonoDto) {
    return this.solicitudes.rechazar(token, dto);
  }
}
