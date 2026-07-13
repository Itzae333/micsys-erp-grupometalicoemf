import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SolicitudesEdicionService } from './solicitudes-edicion.service';
import { AprobarSolicitudDto, RechazarSolicitudDto } from './dto/solicitudes-edicion.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Solicitudes de edición')
@Controller('solicitudes-edicion')
export class SolicitudesEdicionController {
  constructor(private solicitudes: SolicitudesEdicionService) {}

  @Get('token/:token')
  @Public()
  @ApiOperation({ summary: 'Consultar (sin login) una solicitud de edición por su token de aprobación' })
  obtenerPorToken(@Param('token') token: string) {
    return this.solicitudes.obtenerPorToken(token);
  }

  @Post('token/:token/aprobar')
  @Public()
  @ApiOperation({ summary: 'Autorizar (sin login) la edición de la venta asociada al token' })
  aprobar(@Param('token') token: string, @Body() dto: AprobarSolicitudDto) {
    return this.solicitudes.aprobar(token, dto);
  }

  @Post('token/:token/rechazar')
  @Public()
  @ApiOperation({ summary: 'Rechazar (sin login) la solicitud de edición asociada al token' })
  rechazar(@Param('token') token: string, @Body() dto: RechazarSolicitudDto) {
    return this.solicitudes.rechazar(token, dto);
  }
}
