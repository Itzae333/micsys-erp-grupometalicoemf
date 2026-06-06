import { Module } from '@nestjs/common';
import { UbicacionesService } from './ubicaciones.service';
import { UbicacionesController } from './ubicaciones.controller';

@Module({
  providers: [UbicacionesService],
  controllers: [UbicacionesController],
  exports: [UbicacionesService],
})
export class UbicacionesModule {}
