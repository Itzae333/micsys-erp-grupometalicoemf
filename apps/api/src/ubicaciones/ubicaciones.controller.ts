import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { UbicacionesService } from './ubicaciones.service';
import { CreateUbicacionDto } from './dto/create-ubicacion.dto';
import { UpdateUbicacionDto } from './dto/update-ubicacion.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SetMetadata } from '@nestjs/common';
import { SKIP_EMPRESA_UBICACION_KEY } from '../common/guards/empresa-ubicacion.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { Request } from 'express';

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

  @Post(':id/logo')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir logo de ubicación' })
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: (_req: Request, _file: Express.Multer.File, cb) => {
          const dir = join(process.cwd(), 'uploads', 'logos');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req: Request, file: Express.Multer.File, cb) => {
          const ext = extname(file.originalname);
          const params = req.params as Record<string, string>;
          cb(null, `ubicacion-${params.id}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = ['image/svg+xml', 'image/png', 'image/webp'].includes(file.mimetype);
        cb(null, ok);
      },
    }),
  )
  async uploadLogo(
    @Param('empresaId') empresaId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('Tipo no permitido. Usa PNG, WebP o SVG (máx 2 MB).');
    const logoUrl = `/uploads/logos/${file.filename}`;
    return this.ubicaciones.updateLogo(empresaId, id, logoUrl, user);
  }

  @Delete(':id/logo')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Eliminar logo de ubicación' })
  removeLogo(
    @Param('empresaId') empresaId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ubicaciones.updateLogo(empresaId, id, null, user);
  }
}
