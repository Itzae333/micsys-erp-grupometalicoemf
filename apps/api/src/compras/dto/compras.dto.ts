import {
  IsString, IsNumber, IsInt, IsOptional, IsArray,
  Min, Max, ValidateNested, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrdenCompraLineaDto {
  @ApiProperty() @IsString() articulo_id: string;
  @ApiProperty() @IsInt() @Min(1) @Max(5) @Type(() => Number) existencia_num: number;
  @ApiProperty() @IsNumber() @Min(0.001) @Type(() => Number) cantidad_solicitada: number;
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) precio_unitario: number;
}

export class CreateOrdenCompraDto {
  @ApiProperty() @IsString() proveedor_id: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
  @ApiProperty({ type: [OrdenCompraLineaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrdenCompraLineaDto)
  lineas: OrdenCompraLineaDto[];
}

export class RecibirLineaDto {
  @ApiProperty() @IsString() linea_id: string;
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) cantidad_recibida: number;
}

export class RecibirOrdenCompraDto {
  @ApiProperty({ type: [RecibirLineaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecibirLineaDto)
  lineas: RecibirLineaDto[];
}

export class AbonoProveedorDto {
  @ApiProperty() @IsNumber() @Min(0.01) @Type(() => Number) monto: number;
  @ApiProperty() @IsString() concepto: string;
}

export class AjusteCuentaProveedorDto {
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) monto: number;
  @ApiProperty() @IsIn(['CARGO', 'ABONO']) tipo: 'CARGO' | 'ABONO';
  @ApiProperty() @IsString() concepto: string;
}

export class ListarOrdenesQueryDto {
  @IsOptional() @IsString() estatus?: string;
  @IsOptional() @IsString() proveedorId?: string;
  @IsOptional() @Type(() => Number) page?: number;
  @IsOptional() @Type(() => Number) limit?: number;
}
