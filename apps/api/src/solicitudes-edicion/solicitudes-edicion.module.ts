import { Module } from '@nestjs/common';
import { SolicitudesEdicionService } from './solicitudes-edicion.service';
import { SolicitudesEdicionController } from './solicitudes-edicion.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  providers: [SolicitudesEdicionService],
  controllers: [SolicitudesEdicionController],
  exports: [SolicitudesEdicionService],
})
export class SolicitudesEdicionModule {}
