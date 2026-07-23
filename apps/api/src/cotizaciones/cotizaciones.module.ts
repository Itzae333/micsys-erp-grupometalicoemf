import { Module } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service';
import { CotizacionesController } from './cotizaciones.controller';
import { VentasModule } from '../ventas/ventas.module';

@Module({
  imports: [VentasModule],
  providers: [CotizacionesService],
  controllers: [CotizacionesController],
  exports: [CotizacionesService],
})
export class CotizacionesModule {}
