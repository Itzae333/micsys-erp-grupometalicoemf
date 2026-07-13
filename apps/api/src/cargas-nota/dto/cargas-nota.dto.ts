import {
  IsArray, IsString, IsNumber, Min, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CargaLineaDto {
  @ApiProperty() @IsString() nota_venta_linea_id: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.001) cantidad_cargada: number;
}

export class RegistrarCargaDto {
  @ApiProperty({ type: [CargaLineaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CargaLineaDto)
  lineas: CargaLineaDto[];
}
