import {
  IsString, IsInt, IsNumber, IsOptional, IsArray, ValidateNested, Min, Max,
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
}

export class RecibirRemisionDto {
  @ApiProperty({ type: [RecepcionLineaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecepcionLineaDto)
  lineas: RecepcionLineaDto[];
}
