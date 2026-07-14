import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /** Devuelve true si el correo se envió, false si falló (o si SMTP no está configurado). */
  async send(options: SendMailOptions): Promise<boolean> {
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost) {
      this.logger.warn(`SMTP_HOST no configurado — no se envió el correo "${options.subject}" a ${options.to}`);
      return false;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `GrupoMetalicoEMF <${process.env.SMTP_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Error al enviar "${options.subject}" a ${options.to}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }
}
