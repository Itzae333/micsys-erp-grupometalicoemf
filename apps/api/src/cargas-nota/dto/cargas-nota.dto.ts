import {
  IsArray, IsString, IsNumber, IsOptional, Min, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CargaLineaDto {
  @ApiProperty() @IsString() nota_venta_linea_id: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.001) cantidad_cargada: number;
  // Si viene, la línea se marca como entrega con incidencia y su descuento
  // de inventario se difiere hasta que se resuelva (ver CargasNotaService.resolverObservacion).
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
}

export class RegistrarCargaDto {
  @ApiProperty({ type: [CargaLineaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CargaLineaDto)
  lineas: CargaLineaDto[];
}
