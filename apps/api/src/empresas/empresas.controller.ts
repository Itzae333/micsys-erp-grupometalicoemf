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
import { EmpresasService } from './empresas.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SetMetadata } from '@nestjs/common';
import { SKIP_EMPRESA_UBICACION_KEY } from '../common/guards/empresa-ubicacion.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { Request } from 'express';

const SkipEmpresaUbicacion = () => SetMetadata(SKIP_EMPRESA_UBICACION_KEY, true);

@ApiTags('Empresas')
@ApiBearerAuth()
@Controller('empresas')
export class EmpresasController {
  constructor(private empresas: EmpresasService) {}

  @Get()
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Lista de empresas' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.empresas.findAll(user);
  }

  @Get(':id')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Detalle de empresa' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.empresas.findOne(id, user);
  }

  @Post()
  @Roles('SUPER_USUARIO')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Crear empresa (Solo Super Usuario)' })
  create(@Body() dto: CreateEmpresaDto) {
    return this.empresas.create(dto);
  }

  @Patch(':id')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Editar empresa' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmpresaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.empresas.update(id, dto, user);
  }

  @Post(':id/logo')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir logo de empresa' })
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
          cb(null, `empresa-${(req.params as Record<string, string>).id}${ext}`);
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
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('Tipo no permitido. Usa PNG, WebP o SVG (máx 2 MB).');
    const logoUrl = `/uploads/logos/${file.filename}`;
    return this.empresas.updateLogo(id, logoUrl, user);
  }

  @Delete(':id/logo')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Eliminar logo de empresa' })
  removeLogo(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.empresas.updateLogo(id, null, user);
  }
}
