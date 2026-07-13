import { Module } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { VentasController } from './ventas.controller';
import { SolicitudesEdicionModule } from '../solicitudes-edicion/solicitudes-edicion.module';

@Module({
  imports: [SolicitudesEdicionModule],
  providers: [VentasService],
  controllers: [VentasController],
  exports: [VentasService],
})
export class VentasModule {}
