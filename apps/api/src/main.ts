import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Directorio para logos subidos — se crea si no existe
  const uploadsDir = join(process.cwd(), 'uploads', 'logos');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express') as typeof import('express');
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  // Servir /uploads/ con header CORS explícito (se registra antes que enableCors)
  app.use(
    '/uploads',
    (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
      (res as unknown as import('http').ServerResponse).setHeader('Access-Control-Allow-Origin', frontendUrl);
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
