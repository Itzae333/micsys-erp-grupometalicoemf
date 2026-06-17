import { Controller, Get, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { NotificacionesService } from './notificaciones.service';

@ApiTags('Notificaciones')
@ApiBearerAuth()
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private svc: NotificacionesService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen de alertas activas para el usuario' })
  getResumen(@Headers('x-ubicacion-id') ubicacionId: string) {
    return this.svc.getResumen(ubicacionId);
  }
}
