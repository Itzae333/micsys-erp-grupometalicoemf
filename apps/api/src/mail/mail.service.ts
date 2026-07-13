import { Injectable, Logger } from '@nestjs/common';

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(options: SendMailOptions): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY no configurado — no se envió el correo "${options.subject}" a ${options.to}`);
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'GrupoMetalicoEMF <noreply@grupometalicoemf.com>',
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Resend respondió ${response.status} al enviar "${options.subject}" a ${options.to}: ${body}`);
    }
  }
}
