import { Controller, Get, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
@ApiHeader({ name: 'x-empresa-id', required: true })
@ApiHeader({ name: 'x-ubicacion-id', required: true })
@Controller('search')
export class SearchController {
  constructor(private svc: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Búsqueda global — notas, artículos, clientes, proveedores, empleados' })
  @ApiQuery({ name: 'q',     required: true })
  @ApiQuery({ name: 'limit', required: false })
  buscar(
    @Headers('x-empresa-id')   empresaId:   string,
    @Headers('x-ubicacion-id') ubicacionId: string,
    @Query('q')     q:     string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.buscar(empresaId, ubicacionId, q, limit ? Math.min(Number(limit), 10) : 5);
  }
}
