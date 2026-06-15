import { Module } from '@nestjs/common';
import { MigracionService } from './migracion.service';
import { MigracionController } from './migracion.controller';

@Module({
  providers: [MigracionService],
  controllers: [MigracionController],
})
export class MigracionModule {}
