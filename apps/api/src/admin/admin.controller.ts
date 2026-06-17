import { Controller, Post, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type { Response } from 'express';
import { spawn } from 'child_process';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  @Post('backup')
  @Roles('SUPER_USUARIO')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Genera un dump de PostgreSQL y lo devuelve como descarga — solo SUPER_USUARIO' })
  async backup(@Res() res: Response) {
    const databaseUrl = this.config.get<string>('DATABASE_URL') ?? '';

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
    pg.stderr.on('data', (chunk: Buffer) => { console.error('[backup]', chunk.toString()); });
    pg.on('error', (err) => {
      console.error('[backup] pg_dump no encontrado:', err.message);
      if (!res.headersSent) res.status(500).json({ message: 'pg_dump no disponible en el servidor' });
    });
    pg.on('close', (code) => { if (code !== 0 && !res.writableEnded) res.end(); });
  }

  @Post('reset-parcial')
  @Roles('SUPER_USUARIO')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra datos operativos (ventas, pedidos, inventario, clientes) conservando empresas, ubicaciones, usuarios y configuración — solo SUPER_USUARIO' })
  async resetParcial() {
    const counts = await this.prisma.$transaction(
      async (tx) => {
        // ── Pedidos ────────────────────────────────────────────
        const evidPedido    = await tx.evidenciaPedido.deleteMany({});
        const anticPedido   = await tx.anticiposPedido.deleteMany({});
        const linPedido     = await tx.pedidoLinea.deleteMany({});
        const pedidos       = await tx.pedido.deleteMany({});

        // ── Ventas ─────────────────────────────────────────────
        const solicEdit     = await tx.solicitudEdicionNota.deleteMany({});
        const evidNota      = await tx.evidenciaNota.deleteMany({});
        const linNota       = await tx.notaVentaLinea.deleteMany({});
        const pagos         = await tx.pago.deleteMany({});
        const movCuenta     = await tx.movimientoCuenta.deleteMany({});
        const notas         = await tx.notaVenta.deleteMany({});

        // ── Remisiones ─────────────────────────────────────────
        const linRemision   = await tx.remisionLinea.deleteMany({});
        const remisiones    = await tx.remision.deleteMany({});

        // ── Producción ─────────────────────────────────────────
        const ordenProd     = await tx.ordenProduccion.deleteMany({});

        // ── Compras ────────────────────────────────────────────
        const linCompra     = await tx.ordenCompraLinea.deleteMany({});
        const movProveedor  = await tx.movimientoCuentaProveedor.deleteMany({});
        const ordCompra     = await tx.ordenCompra.deleteMany({});

        // ── Inventario ─────────────────────────────────────────
        const movInv        = await tx.movimientoInventario.deleteMany({});
        const articulos     = await tx.articulo.deleteMany({});

        // ── Clientes ───────────────────────────────────────────
        const clientes      = await tx.cliente.deleteMany({});

        // ── Legacy / Bitácora / Asistencias ────────────────────
        const legacyLineas  = await tx.legacyVentaLinea.deleteMany({});
        const legacyVentas  = await tx.legacyVenta.deleteMany({});
        const asistencias   = await tx.registroAsistencia.deleteMany({});
        const auditLogs     = await tx.auditLog.deleteMany({});

        return {
          evidencias_pedido:       evidPedido.count,
          anticipos_pedido:        anticPedido.count,
          lineas_pedido:           linPedido.count,
          pedidos:                 pedidos.count,
          solicitudes_edicion:     solicEdit.count,
          evidencias_nota:         evidNota.count,
          lineas_venta:            linNota.count,
          pagos:                   pagos.count,
          movimientos_cuenta:      movCuenta.count,
          notas_venta:             notas.count,
          lineas_remision:         linRemision.count,
          remisiones:              remisiones.count,
          ordenes_produccion:      ordenProd.count,
          lineas_compra:           linCompra.count,
          movimientos_proveedor:   movProveedor.count,
          ordenes_compra:          ordCompra.count,
          movimientos_inventario:  movInv.count,
          articulos:               articulos.count,
          clientes:                clientes.count,
          legacy_lineas:           legacyLineas.count,
          legacy_ventas:           legacyVentas.count,
          registros_asistencia:    asistencias.count,
          audit_logs:              auditLogs.count,
        };
      },
      { timeout: 60_000 },
    );

    return { ok: true, eliminados: counts };
  }
}
