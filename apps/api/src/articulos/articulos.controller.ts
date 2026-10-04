import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { ArticulosService } from './articulos.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { UpdatePreciosDto } from './dto/update-precios.dto';
import { UpdateExistenciasDto } from './dto/update-existencias.dto';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Artículos')
@ApiBearerAuth()
@ApiHeader({ name: 'x-ubicacion-id', required: true })
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
  @ApiQuery({ name: 'ocultos', required: false })
  findAll(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('proveedorId') proveedorId?: string,
    @Query('activo') activo?: string,
    @Query('ocultos') ocultos?: string,
  ) {
    return this.articulos.findAll(ubicacionId, {
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 50,
      proveedorId,
      activo: activo === undefined ? true : activo === 'true',
      ocultos: ocultos === 'true',
    });
  }

  @Get('clave/:clave')
  @ApiOperation({ summary: 'Buscar artículo por clave exacta' })
  findByClave(@Headers('x-ubicacion-id') ubicacionId: string, @Param('clave') clave: string) {
    return this.articulos.findByClave(clave, ubicacionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de artículo' })
  findOne(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.articulos.findOne(id, ubicacionId);
  }

  @Post()
  @Roles('ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Crear artículo' })
  create(@Headers('x-ubicacion-id') ubicacionId: string, @Body() dto: CreateArticuloDto) {
    return this.articulos.create(dto, ubicacionId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Editar artículo' })
  update(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateArticuloDto> & { activo?: boolean },
  ) {
    return this.articulos.update(id, dto, ubicacionId);
  }

  @Patch(':id/ocultar')
  @Roles('ADMIN', 'ENCARGADO', 'ALMACENISTA', 'VENDEDOR')
  @ApiOperation({ summary: 'Ocultar del inventario un producto especial (no se borra)' })
  ocultar(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.articulos.setOculto(id, true, ubicacionId);
  }

  @Patch(':id/mostrar')
  @Roles('ADMIN', 'ENCARGADO', 'ALMACENISTA')
  @ApiOperation({ summary: 'Volver a mostrar un producto especial oculto' })
  mostrar(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.articulos.setOculto(id, false, ubicacionId);
  }

  @Patch(':id/precios')
  @Roles('ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Actualizar precios de artículo' })
  updatePrecios(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() body: UpdatePreciosDto,
  ) {
    return this.articulos.updatePrecios(id, body, ubicacionId);
  }

  @Patch(':id/existencias')
  @Roles('ADMIN', 'ENCARGADO', 'ALMACENISTA', 'VENDEDOR')
  @ApiOperation({ summary: 'Actualizar existencias de artículo' })
  updateExistencias(
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Param('id') id: string,
    @Body() body: UpdateExistenciasDto,
  ) {
    return this.articulos.updateExistencias(id, body, ubicacionId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Eliminar artículo (solo si no tiene ventas registradas)' })
  remove(@Headers('x-ubicacion-id') ubicacionId: string, @Param('id') id: string) {
    return this.articulos.remove(id, ubicacionId);
  }
}
