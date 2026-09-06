import { Module } from '@nestjs/common';
import { RemisionesService } from './remisiones.service';
import { RemisionesController } from './remisiones.controller';
import { ArticulosModule } from '../articulos/articulos.module';

@Module({
  imports:     [ArticulosModule],
  controllers: [RemisionesController],
  providers:   [RemisionesService],
  exports:     [RemisionesService],
})
export class RemisionesModule {}
