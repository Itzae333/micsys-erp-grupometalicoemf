import { Module } from '@nestjs/common';
import { GastosService } from './gastos.service';
import { GastosController } from './gastos.controller';

@Module({
  providers: [GastosService],
  controllers: [GastosController],
  exports: [GastosService],
})
export class GastosModule {}
