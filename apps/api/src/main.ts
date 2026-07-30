import { webcrypto } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';

// Node 18 no expone `crypto` como global (eso llegó sin flag hasta Node 19) —
// @nestjs/schedule usa `crypto.randomUUID()` asumiendo que sí existe. Sin este
// polyfill, el boot truena en ScheduleExplorer.onModuleInit con
// "ReferenceError: crypto is not defined" en cualquier Node 18.x.
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

async function bootstrap() {
  // `bodyParser: false` desactiva el parser automático de Nest (limit por
  // default de Express/body-parser: 100kb) para poder registrar el propio
  // con un límite más alto — las evidencias de pago (comprobantes, fotos)
  // viajan como base64 dentro del JSON y una imagen comprimida ya fácil
  // pesa 200-500kb, muy por arriba del default.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Directorio para logos subidos — se crea si no existe
  const uploadsDir = join(process.cwd(), 'uploads', 'logos');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express') as typeof import('express');

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Servir /uploads/ con header CORS explícito (se registra antes que enableCors).
  // Se refleja el Origin real del request, igual que enableCors({ origin: true }),
  // porque el logo se consume vía fetch() (modo CORS) al armar tickets ESC/POS.
  app.use(
    '/uploads',
    (
      req: { headers: { origin?: string } },
      res: { setHeader: (k: string, v: string) => void },
      next: () => void,
    ) => {
      const origin = req.headers.origin;
      if (origin) {
        (res as unknown as import('http').ServerResponse).setHeader('Access-Control-Allow-Origin', origin);
        (res as unknown as import('http').ServerResponse).setHeader('Vary', 'Origin');
      }
      next();
    },
    express.static(join(process.cwd(), 'uploads')),
  );

  // Seguridad
  app.use(helmet());
  app.use(cookieParser());

  // CORS — origin:true refleja el origin del request (permite cualquier origen con credentials)
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Validación global con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Health check (sin prefix, para Railway)
  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (v: unknown) => void }) => {
    res.json({ status: 'ok' });
  });

  app.setGlobalPrefix('api/v1');

  // Swagger — desactivar con SWAGGER_DISABLED=true
  if (process.env.SWAGGER_DISABLED !== 'true') {
    const config = new DocumentBuilder()
      .setTitle('GrupoMetalicoEMF ERP API')
      .setDescription('API del ERP industrial GrupoMetalicoEMF v1.0.0')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addCookieAuth('refresh_token')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`GrupoMetalicoEMF API corriendo en http://localhost:${port}/api/v1`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
