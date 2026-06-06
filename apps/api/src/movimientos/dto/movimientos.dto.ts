import { IsString, IsNumber, IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EntradaDto {
  @ApiProperty()
  @IsString()
  articulo_id: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Slot existencia 1-5' })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  existencia_num: number;

  @ApiProperty({ minimum: 0.001 })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  cantidad: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  concepto?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proveedor_id?: string;
}

export class SalidaDto {
  @ApiProperty()
  @IsString()
  articulo_id: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  existencia_num: number;

  @ApiProperty({ minimum: 0.001 })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  cantidad: number;

  @ApiProperty()
  @IsString()
  concepto: string;
}

export class TransferenciaDto {
  @ApiProperty()
  @IsString()
  articulo_id: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  existencia_num_origen: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  existencia_num_destino: number;

  @ApiProperty({ minimum: 0.001 })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  cantidad: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  concepto?: string;
}

export class AjusteDto {
  @ApiProperty()
  @IsString()
  articulo_id: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  existencia_num: number;

  @ApiProperty({ minimum: 0, description: 'Nueva cantidad exacta (conteo físico)' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cantidad_nueva: number;

  @ApiProperty()
  @IsString()
  concepto: string;
}
