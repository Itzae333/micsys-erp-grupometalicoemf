import { Module } from '@nestjs/common';
import { EntregasMateriaPrimaController } from './entregas-materia-prima.controller';
import { EntregasMateriaPrimaService } from './entregas-materia-prima.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EntregasMateriaPrimaController],
  providers: [EntregasMateriaPrimaService],
})
export class EntregasMateriaPrimaModule {}
