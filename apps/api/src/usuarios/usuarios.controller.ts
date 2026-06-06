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
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SetMetadata } from '@nestjs/common';
import { SKIP_EMPRESA_UBICACION_KEY } from '../common/guards/empresa-ubicacion.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

const SkipEmpresaUbicacion = () => SetMetadata(SKIP_EMPRESA_UBICACION_KEY, true);

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private usuarios: UsuariosService) {}

  @Get()
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Lista de usuarios' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.usuarios.findAll(user);
  }

  @Get(':id')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Detalle de usuario' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usuarios.findOne(id, user);
  }

  @Post()
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Crear usuario' })
  create(@Body() dto: CreateUsuarioDto, @CurrentUser() user: JwtPayload) {
    return this.usuarios.create(dto, user);
  }

  @Patch(':id')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Editar usuario' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usuarios.update(id, dto, user);
  }

  @Post(':id/reset-password')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Resetear contraseña de usuario' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usuarios.resetPassword(id, dto, user);
  }

  @Delete(':id')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Desactivar usuario (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usuarios.softDelete(id, user);
  }
}
