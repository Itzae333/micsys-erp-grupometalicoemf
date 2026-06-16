import { Module } from '@nestjs/common';
import { RemisionesService } from './remisiones.service';
import { RemisionesController } from './remisiones.controller';

@Module({
  controllers: [RemisionesController],
  providers:   [RemisionesService],
  exports:     [RemisionesService],
})
export class RemisionesModule {}
