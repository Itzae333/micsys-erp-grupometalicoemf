import {
  IsString, IsOptional, IsNumber, IsArray, ValidateNested, Min, ArrayMinSize, IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LineaPedidoDto {
  @ApiProperty() @IsString() articulo_id: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.001) cantidad: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) precio_unitario: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) descuento?: number;
}

export class CreatePedidoDto {
  @ApiProperty() @IsString() cliente_id: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineaPedidoDto)
  lineas?: LineaPedidoDto[];
}

export class AddLineaPedidoDto {
  @ApiProperty() @IsString() articulo_id: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.001) cantidad: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) precio_unitario: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) descuento?: number;
}

export class UpdateLineaPedidoDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0.001) cantidad?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) precio_unitario?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) descuento?: number;
}

export class AnticipoDto {
  @ApiProperty({ enum: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'] })
  @IsEnum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'])
  metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'DEPOSITO';

  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) monto: number;
  @ApiPropertyOptional() @IsOptional() @IsString() referencia?: string;
}

export class RegistrarAnticipoDto {
  @ApiProperty({ type: [AnticipoDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AnticipoDto)
  pagos: AnticipoDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
}

export class LiquidarPedidoDto {
  @ApiPropertyOptional({ type: [AnticipoDto], description: 'Pagos adicionales para cubrir saldo restante' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnticipoDto)
  pagos?: AnticipoDto[];
}

export class AgregarEvidenciaPedidoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() descripcion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archivo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() data_base64?: string;
}
