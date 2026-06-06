import { Controller, Get, Post, Patch, Delete, Param, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { ProveedoresService } from './proveedores.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Proveedores')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('proveedores')
export class ProveedoresController {
  constructor(private proveedores: ProveedoresService) {}

  @Get()
  @ApiOperation({ summary: 'Lista de proveedores activos' })
  findAll(@Headers('x-empresa-id') empresaId: string) {
    return this.proveedores.findAll(empresaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de proveedor' })
  findOne(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.proveedores.findOne(id, empresaId);
  }

  @Post()
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Crear proveedor' })
  create(@Headers('x-empresa-id') empresaId: string, @Body() dto: CreateProveedorDto) {
    return this.proveedores.create(dto, empresaId);
  }

  @Patch(':id')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Editar proveedor' })
  update(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateProveedorDto>,
  ) {
    return this.proveedores.update(id, dto, empresaId);
  }

  @Delete(':id')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Desactivar proveedor (soft delete)' })
  deactivate(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.proveedores.deactivate(id, empresaId);
  }
}
