import { Controller, Get, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { NotificacionesService } from './notificaciones.service';

@ApiTags('Notificaciones')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private svc: NotificacionesService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen de alertas activas para el usuario' })
  getResumen(@Headers('x-empresa-id') empresaId: string) {
    return this.svc.getResumen(empresaId);
  }
}
