import { Module } from '@nestjs/common';
import { ArticulosService } from './articulos.service';
import { ArticulosController } from './articulos.controller';

@Module({
  providers: [ArticulosService],
  controllers: [ArticulosController],
  exports: [ArticulosService],
})
export class ArticulosModule {}
