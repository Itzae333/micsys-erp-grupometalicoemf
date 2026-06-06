import { Module } from '@nestjs/common';
import { RhController } from './rh.controller';
import { RhService } from './rh.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RhController],
  providers: [RhService],
  exports: [RhService],
})
export class RhModule {}
