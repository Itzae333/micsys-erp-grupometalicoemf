import {
  IsString, IsInt, IsNumber, IsOptional, IsArray, IsIn, ValidateNested, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RemisionLineaDto {
  @ApiProperty()
  @IsString()
  articulo_id: string;

  @ApiProperty()
  @IsString()
  articulo_clave: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  slot_origen: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  slot_destino: number;

  @ApiProperty({ minimum: 0.001 })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  cantidad: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notas?: string;
}

export class CreateRemisionDto {
  @ApiProperty()
  @IsString()
  empresa_origen_id: string;

  @ApiProperty()
  @IsString()
  ub_origen_id: string;

  @ApiProperty()
  @IsString()
  empresa_destino_id: string;

  @ApiProperty()
  @IsString()
  ub_destino_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  concepto?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notas?: string;

  @ApiProperty({ type: [RemisionLineaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RemisionLineaDto)
  lineas: RemisionLineaDto[];
}

export class RecepcionLineaDto {
  @ApiProperty()
  @IsString()
  linea_id: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cantidad_recibida: number;

  // Artículo del catálogo destino resuelto como equivalente del artículo de
  // origen (por equivalencia guardada, por coincidencia de descripción, o
  // elegido a mano). Requerido en la práctica cuando cantidad_recibida > 0 —
  // ver GET /remisiones/:id/preview-recepcion.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  articulo_destino_id?: string;

  // Solo se envía cuando la resolución debe guardarse como equivalencia para
  // futuras remisiones entre las mismas dos ubicaciones (no se envía cuando
  // ya existía una equivalencia previa, para no reescribirla sin necesidad).
  @ApiPropertyOptional({ enum: ['AUTOMATICA', 'MANUAL_AMBIGUEDAD', 'MANUAL_BUSQUEDA'] })
  @IsOptional()
  @IsIn(['AUTOMATICA', 'MANUAL_AMBIGUEDAD', 'MANUAL_BUSQUEDA'])
  origen_resolucion?: 'AUTOMATICA' | 'MANUAL_AMBIGUEDAD' | 'MANUAL_BUSQUEDA';
}

export class RecibirRemisionDto {
  @ApiProperty({ type: [RecepcionLineaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecepcionLineaDto)
  lineas: RecepcionLineaDto[];
}
