import { Module } from '@nestjs/common';
import { ConfigColumnasService } from './config-columnas.service';
import { ConfigColumnasController } from './config-columnas.controller';

@Module({
  providers: [ConfigColumnasService],
  controllers: [ConfigColumnasController],
  exports: [ConfigColumnasService],
})
export class ConfigColumnasModule {}
