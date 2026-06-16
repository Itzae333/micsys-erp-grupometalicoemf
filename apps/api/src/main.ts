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
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean) as string[];

  const corsOriginFn = (origin: string | undefined, cb: (e: Error | null, allow?: boolean) => void) => {
    if (!origin) return cb(null, true);
    const ok = allowedOrigins.some((o) => origin === o)
      || /\.vercel\.app$/.test(origin)
      || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    cb(ok ? null : new Error(`CORS bloqueado: ${origin}`), ok);
  };

  // Servir /uploads/ con header CORS explícito (se registra antes que enableCors)
  app.use(
    '/uploads',
    (req: { headers: { origin?: string } }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
      const o = req.headers.origin;
      const frontendUrl = allowedOrigins[0] ?? 'http://localhost:3000';
      (res as unknown as import('http').ServerResponse).setHeader(
        'Access-Control-Allow-Origin',
        o && (/\.vercel\.app$/.test(o) || allowedOrigins.includes(o)) ? o : frontendUrl,
      );
      next();
    },
    express.static(join(process.cwd(), 'uploads')),
  );

  // Seguridad
  app.use(helmet());
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: corsOriginFn,
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
