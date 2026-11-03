import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeyGuard } from './api-key.guard';
import { IntegracionService } from './integracion.service';

const ids = (s?: string) =>
  (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * API de integración con el CRM (Cauce). SOLO LECTURA, autenticada con `x-api-key`.
 * Es @Public() para el JWT del ERP: aquí la única credencial es la API key.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@Controller('integracion')
export class IntegracionController {
  constructor(private svc: IntegracionService) {}

  /** Empresas que esta llave puede leer (INTEGRACION_EMPRESAS). */
  @Get('empresas')
  empresas() {
    return this.svc.listarEmpresas();
  }

  @Get('ubicaciones')
  ubicaciones() {
    return this.svc.ubicaciones();
  }

  @Get('clientes')
  clientes(@Query() q: { ubicacion_id?: string; empresa_id?: string; search?: string; page?: string; limit?: string; con_saldo?: string; ids?: string }) {
    return this.svc.clientes(q);
  }

  /** ?ids=a,b,c */
  @Get('clientes/saldos')
  saldos(@Query('ids') idsQ?: string) {
    return this.svc.saldos(ids(idsQ));
  }

  /** ?cliente_ids=a,b,c&estatus=abiertos|todos&desde=&hasta= */
  @Get('tickets')
  tickets(@Query() q: { cliente_ids?: string; estatus?: string; desde?: string; hasta?: string }) {
    return this.svc.tickets(ids(q.cliente_ids), q);
  }

  @Get('tickets/:id')
  ticket(@Param('id') id: string) {
    return this.svc.ticket(id);
  }

  /** Imagen o PDF de una evidencia (comprobante de pago, ticket…). */
  @Get('tickets/:id/evidencias/:evidenciaId')
  async evidencia(@Param('id') id: string, @Param('evidenciaId') evidenciaId: string, @Res() res: Response) {
    const { mime, buffer } = await this.svc.evidencia(id, evidenciaId);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  }

  /** Todas las ventas del cliente, con cuándo se liquidó cada una. ?page&limit&estatus&tipo&desde&hasta&q */
  @Get('clientes/:id/ventas')
  ventas(
    @Param('id') id: string,
    @Query() q: { page?: string; limit?: string; estatus?: string; tipo?: string; desde?: string; hasta?: string; q?: string },
  ) {
    return this.svc.ventasCliente(id, q);
  }

  @Get('clientes/:id/movimientos')
  movimientos(@Param('id') id: string, @Query() q: { desde?: string; hasta?: string; limit?: string }) {
    return this.svc.movimientos(id, q);
  }
}
