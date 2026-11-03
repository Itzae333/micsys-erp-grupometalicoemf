import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { IntegracionController } from './integracion.controller';
import { IntegracionService } from './integracion.service';

@Module({
  controllers: [IntegracionController],
  providers: [IntegracionService, ApiKeyGuard],
})
export class IntegracionModule {}
