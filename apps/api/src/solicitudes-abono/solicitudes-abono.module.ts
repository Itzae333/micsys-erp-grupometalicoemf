import { Module } from '@nestjs/common';
import { SolicitudesAbonoService } from './solicitudes-abono.service';
import { SolicitudesAbonoController } from './solicitudes-abono.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  providers: [SolicitudesAbonoService],
  controllers: [SolicitudesAbonoController],
  exports: [SolicitudesAbonoService],
})
export class SolicitudesAbonoModule {}
