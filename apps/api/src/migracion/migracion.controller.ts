import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Headers,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { MigracionService } from './migracion.service';
import { Roles } from '../common/decorators/roles.decorator';

const MAX_CSV_SIZE = 20 * 1024 * 1024; // 20 MB

@ApiTags('Migración')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@Controller('migracion')
export class MigracionController {
  constructor(private migracion: MigracionService) {}

  @Post('inventario')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importar inventario desde CSV legacy (MetalAlpha)' })
  @UseInterceptors(FileInterceptor('archivo'))
  importarInventario(
    @Headers('x-empresa-id') empresaId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_CSV_SIZE }),
          new FileTypeValidator({ fileType: /text\/(csv|plain)/ }),
        ],
      }),
    )
    archivo: Express.Multer.File,
  ) {
    return this.migracion.importarInventario(archivo.buffer, empresaId);
  }

  @Post('clientes')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importar clientes desde CSV legacy (MetalAlpha)' })
  @UseInterceptors(FileInterceptor('archivo'))
  importarClientes(
    @Headers('x-empresa-id') empresaId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_CSV_SIZE }),
          new FileTypeValidator({ fileType: /text\/(csv|plain)/ }),
        ],
      }),
    )
    archivo: Express.Multer.File,
  ) {
    return this.migracion.importarClientes(archivo.buffer, empresaId);
  }

  @Post('ventas')
  @Roles('SUPER_USUARIO', 'ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importar historial de ventas desde CSV legacy (MetalAlpha)' })
  @UseInterceptors(FileInterceptor('archivo'))
  importarVentas(
    @Headers('x-empresa-id') empresaId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_CSV_SIZE }),
          new FileTypeValidator({ fileType: /text\/(csv|plain)/ }),
        ],
      }),
    )
    archivo: Express.Multer.File,
  ) {
    return this.migracion.importarVentas(archivo.buffer, empresaId);
  }

  @Get('ventas')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Listar ventas históricas legacy' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'desde', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'sucursal', required: false, enum: ['virgen', 'punto_venta'] })
  listarVentas(
    @Headers('x-empresa-id') empresaId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('q') q?: string,
    @Query('sucursal') sucursal?: string,
  ) {
    return this.migracion.listarVentas(empresaId, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      desde,
      hasta,
      q,
      sucursal,
    });
  }

  @Get('ventas/:id')
  @Roles('SUPER_USUARIO', 'ADMIN', 'ENCARGADO')
  @ApiOperation({ summary: 'Detalle de venta histórica legacy' })
  detailVenta(
    @Headers('x-empresa-id') empresaId: string,
    @Param('id') id: string,
  ) {
    return this.migracion.detalleVenta(id, empresaId);
  }
}
