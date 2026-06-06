import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { ArticulosService } from './articulos.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Artículos')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('articulos')
export class ArticulosController {
  constructor(private articulos: ArticulosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista de artículos con paginación y búsqueda' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'proveedorId', required: false })
  @ApiQuery({ name: 'activo', required: false })
  findAll(
    @Headers('x-empresa-id') empresaId: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('proveedorId') proveedorId?: string,
    @Query('activo') activo?: string,
  ) {
    return this.articulos.findAll(empresaId, {
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 50,
      proveedorId,
      activo: activo === undefined ? true : activo === 'true',
    });
  }

  @Get('clave/:clave')
  @ApiOperation({ summary: 'Buscar artículo por clave exacta' })
  findByClave(@Headers('x-empresa-id') empresaId: string, @Param('clave') clave: string) {
    return this.articulos.findByClave(clave, empresaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de artículo' })
  findOne(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.articulos.findOne(id, empresaId);
  }

  @Post()
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Crear artículo' })
  create(@Headers('x-empresa-id') empresaId: string, @Body() dto: CreateArticuloDto) {
    return this.articulos.create(dto, empresaId);
  }

  @Patch(':id')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Editar artículo' })
  update(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateArticuloDto> & { activo?: boolean },
  ) {
    return this.articulos.update(id, dto, empresaId);
  }

  @Patch(':id/precios')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Actualizar precios de artículo' })
  updatePrecios(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() body: Record<string, number>,
  ) {
    return this.articulos.updatePrecios(id, body, empresaId);
  }

  @Patch(':id/existencias')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Actualizar existencias de artículo' })
  updateExistencias(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() body: Record<string, number>,
  ) {
    return this.articulos.updateExistencias(id, body, empresaId);
  }

  @Delete(':id')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Desactivar artículo (soft delete)' })
  deactivate(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.articulos.deactivate(id, empresaId);
  }
}
