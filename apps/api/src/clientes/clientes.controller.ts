import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Headers, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import { CreateClienteDto, UpdateClienteDto, AbonarCuentaDto } from './dto/create-cliente.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('Clientes')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('clientes')
export class ClientesController {
  constructor(private clientes: ClientesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista de clientes con búsqueda opcional' })
  @ApiQuery({ name: 'q', required: false })
  findAll(
    @Headers('x-empresa-id') empresaId: string,
    @Query('q') q?: string,
  ) {
    return this.clientes.findAll(empresaId, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de cliente' })
  findOne(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.clientes.findOne(id, empresaId);
  }

  @Post()
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Crear cliente' })
  create(@Headers('x-empresa-id') empresaId: string, @Body() dto: CreateClienteDto) {
    return this.clientes.create(dto, empresaId);
  }

  @Patch(':id')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Editar cliente' })
  update(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateClienteDto,
  ) {
    return this.clientes.update(id, dto, empresaId);
  }

  @Get(':id/cuenta')
  @ApiOperation({ summary: 'Movimientos de cuenta corriente del cliente' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getCuenta(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.clientes.getCuenta(id, empresaId, page, limit);
  }

  @Post(':id/abonar-cuenta')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR')
  @ApiOperation({ summary: 'Registrar abono a la cuenta del cliente — aplica a notas en crédito de más antigua a más nueva' })
  abonarCuenta(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
    @Body() dto: AbonarCuentaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clientes.abonarCuenta(id, empresaId, dto, user.sub);
  }

  @Delete(':id')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiOperation({ summary: 'Activar/desactivar cliente' })
  toggleActivo(@Headers('x-empresa-id') empresaId: string, @Param('id') id: string) {
    return this.clientes.toggleActivo(id, empresaId);
  }
}
