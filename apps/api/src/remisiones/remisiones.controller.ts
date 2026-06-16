import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { RemisionesService } from './remisiones.service';
import { CreateRemisionDto, RecibirRemisionDto } from './dto/remision.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Remisiones')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('remisiones')
export class RemisionesController {
  constructor(private remisiones: RemisionesService) {}

  @Get('destinos')
  @ApiOperation({ summary: 'Empresas y ubicaciones disponibles como destino' })
  getDestinos() {
    return this.remisiones.getDestinos();
  }

  @Get('folio/:folio')
  @ApiOperation({ summary: 'Buscar remisión por folio (para QR scan)' })
  getByFolio(@Param('folio') folio: string) {
    return this.remisiones.getByFolio(folio);
  }

  @Get()
  @ApiOperation({ summary: 'Listar remisiones (salidas, entradas o todas)' })
  @ApiQuery({ name: 'tipo',    required: false, enum: ['salida', 'entrada', 'todas'] })
  @ApiQuery({ name: 'estatus', required: false })
  @ApiQuery({ name: 'page',    required: false })
  @ApiQuery({ name: 'limit',   required: false })
  listar(
    @Headers('x-empresa-id') empresaId: string,
    @Query('tipo')    tipo?:    string,
    @Query('estatus') estatus?: string,
    @Query('page')    page?:    string,
    @Query('limit')   limit?:   string,
  ) {
    return this.remisiones.listar(
      empresaId,
      (tipo as any) ?? 'todas',
      {
        estatus,
        page:  page  ? Number(page)                 : 1,
        limit: limit ? Math.min(Number(limit), 100) : 50,
      },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de remisión' })
  getById(@Param('id') id: string) {
    return this.remisiones.getById(id);
  }

  @Post()
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Crear remisión en BORRADOR' })
  crear(
    @Body() dto: CreateRemisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.remisiones.crear(dto, user.sub);
  }

  @Patch(':id/enviar')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Enviar remisión → EN_TRANSITO (descuenta origen)' })
  enviar(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.remisiones.enviar(id, user.sub);
  }

  @Patch(':id/recibir')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Marcar remisión como recibida (suma existencias en destino)' })
  recibir(
    @Param('id') id: string,
    @Body() dto: RecibirRemisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.remisiones.recibir(id, dto, user.sub);
  }

  @Delete(':id')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Cancelar remisión (solo BORRADOR)' })
  cancelar(@Param('id') id: string) {
    return this.remisiones.cancelar(id);
  }
}
