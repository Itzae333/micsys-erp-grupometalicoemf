import { Controller, Post, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../common/decorators/roles.decorator';
import type { Response } from 'express';
import { spawn } from 'child_process';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private config: ConfigService) {}

  @Post('backup')
  @Roles('SUPER_USUARIO')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Genera un dump de PostgreSQL y lo devuelve como descarga — solo SUPER_USUARIO' })
  async backup(@Res() res: Response) {
    const databaseUrl = this.config.get<string>('DATABASE_URL') ?? '';

    // Parsear la DATABASE_URL para extraer los parámetros
    let pgArgs: string[] = [];
    try {
      const url = new URL(databaseUrl.replace('postgresql://', 'http://'));
      const host     = url.hostname;
      const port     = url.port || '5432';
      const dbName   = url.pathname.slice(1).split('?')[0];
      const user     = decodeURIComponent(url.username);
      const password = decodeURIComponent(url.password);

      process.env['PGPASSWORD'] = password;
      pgArgs = [
        '-h', host,
        '-p', port,
        '-U', user,
        '--no-password',
        '--format=custom',
        dbName,
      ];
    } catch {
      res.status(500).json({ message: 'No se pudo parsear DATABASE_URL' });
      return;
    }

    const fecha    = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const filename = `micsys-backup-${fecha}.dump`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const pg = spawn('pg_dump', pgArgs);

    pg.stdout.pipe(res);

    pg.stderr.on('data', (chunk: Buffer) => {
      console.error('[backup]', chunk.toString());
    });

    pg.on('error', (err) => {
      console.error('[backup] pg_dump no encontrado:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ message: 'pg_dump no disponible en el servidor' });
      }
    });

    pg.on('close', (code) => {
      if (code !== 0 && !res.writableEnded) {
        res.end();
      }
    });
  }
}
