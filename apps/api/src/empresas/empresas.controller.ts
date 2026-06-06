import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { EmpresasService } from './empresas.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SetMetadata } from '@nestjs/common';
import { SKIP_EMPRESA_UBICACION_KEY } from '../common/guards/empresa-ubicacion.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

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
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }), // 2MB
          new FileTypeValidator({ fileType: /(image\/svg\+xml|image\/png|image\/webp)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    // TODO Fase 2: subir a Cloudflare R2 y retornar URL pública
    // Por ahora devuelve el nombre del archivo como placeholder
    const logoUrl = `/brand/empresas/${id}/${file.originalname}`;
    return this.empresas.updateLogo(id, logoUrl, user);
  }
}
