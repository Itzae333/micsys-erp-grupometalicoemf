import {
  IsString, IsNumber, IsInt, IsOptional, IsArray, IsEnum, Min, Max, ArrayMinSize, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const TIPOS_DEVOLUCION = ['SOBRANTE', 'DEFECTUOSO', 'MERMA', 'ERROR_ENTREGA'] as const;
export type TipoDevolucion = (typeof TIPOS_DEVOLUCION)[number];

export class EntregaLineaDto {
  @ApiProperty() @IsString() articulo_id: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Slot de existencia 1-5 del que sale' })
  @IsInt() @Min(1) @Max(5) @Type(() => Number)
  existencia_num: number;

  @ApiProperty({ minimum: 0.001 })
  @IsNumber() @Min(0.001) @Type(() => Number)
  cantidad: number;
}

export class CreateEntregaDto {
  @ApiProperty() @IsString() area_id: string;

  @ApiPropertyOptional({ description: 'Empleado que recibe / pide el material' })
  @IsOptional() @IsString()
  empleado_id?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;

  @ApiProperty({ type: [EntregaLineaDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => EntregaLineaDto)
  lineas: EntregaLineaDto[];
}

export class DevolucionLineaDto {
  @ApiProperty() @IsString() entrega_linea_id: string;

  @ApiProperty({ enum: TIPOS_DEVOLUCION })
  @IsEnum(TIPOS_DEVOLUCION)
  tipo: TipoDevolucion;

  @ApiProperty({ minimum: 0.001 })
  @IsNumber() @Min(0.001) @Type(() => Number)
  cantidad: number;
}

export class CreateDevolucionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() motivo?: string;

  @ApiProperty({ type: [DevolucionLineaDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => DevolucionLineaDto)
  lineas: DevolucionLineaDto[];
}
