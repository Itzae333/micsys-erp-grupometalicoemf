import { Module } from '@nestjs/common';
import { CargasNotaService } from './cargas-nota.service';
import { CargasNotaController } from './cargas-nota.controller';

@Module({
  providers: [CargasNotaService],
  controllers: [CargasNotaController],
  exports: [CargasNotaService],
})
export class CargasNotaModule {}
