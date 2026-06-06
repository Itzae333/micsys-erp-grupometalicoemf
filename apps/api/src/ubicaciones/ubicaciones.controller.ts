import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UbicacionesService } from './ubicaciones.service';
import { CreateUbicacionDto } from './dto/create-ubicacion.dto';
import { UpdateUbicacionDto } from './dto/update-ubicacion.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SetMetadata } from '@nestjs/common';
import { SKIP_EMPRESA_UBICACION_KEY } from '../common/guards/empresa-ubicacion.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

const SkipEmpresaUbicacion = () => SetMetadata(SKIP_EMPRESA_UBICACION_KEY, true);

@ApiTags('Ubicaciones')
@ApiBearerAuth()
@Controller('empresas/:empresaId/ubicaciones')
export class UbicacionesController {
  constructor(private ubicaciones: UbicacionesService) {}

  @Get()
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Lista de ubicaciones de una empresa' })
  findAll(@Param('empresaId') empresaId: string, @CurrentUser() user: JwtPayload) {
    return this.ubicaciones.findAll(empresaId, user);
  }

  @Get(':id')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Detalle de ubicación con datos fiscales' })
  findOne(
    @Param('empresaId') empresaId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ubicaciones.findOne(empresaId, id, user);
  }

  @Post()
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Crear ubicación' })
  create(
    @Param('empresaId') empresaId: string,
    @Body() dto: CreateUbicacionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ubicaciones.create(empresaId, dto, user);
  }

  @Patch(':id')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Editar ubicación' })
  update(
    @Param('empresaId') empresaId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUbicacionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ubicaciones.update(empresaId, id, dto, user);
  }

  @Delete(':id')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Desactivar ubicación (soft delete)' })
  remove(
    @Param('empresaId') empresaId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ubicaciones.softDelete(empresaId, id, user);
  }
}
