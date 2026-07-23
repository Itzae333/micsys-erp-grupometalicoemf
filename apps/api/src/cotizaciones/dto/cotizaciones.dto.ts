import {
  IsString, IsOptional, IsNumber, IsInt, IsEnum, IsEmail,
  IsArray, ValidateNested, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MOTIVOS_CANCELACION } from '../../ventas/dto/ventas.dto';

export class LineaCotizacionDto {
  @ApiProperty() @IsString() articulo_id: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.001) cantidad: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) precio_unitario: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) descuento?: number;
}

export class CreateCotizacionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cliente_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
  @ApiPropertyOptional({ description: 'Días de vigencia antes de vencer (default 30)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vigencia_dias?: number;
  @ApiPropertyOptional({ type: [LineaCotizacionDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LineaCotizacionDto)
  lineas?: LineaCotizacionDto[];
}

export class AddLineaCotizacionDto {
  @ApiProperty() @IsString() articulo_id: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.001) cantidad: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) precio_unitario: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) descuento?: number;
}

export class UpdateLineaCotizacionDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0.001) cantidad?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) precio_unitario?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) descuento?: number;
}

export class CancelarCotizacionDto {
  @ApiProperty({ enum: MOTIVOS_CANCELACION, description: 'Motivo de cancelación del catálogo (mismo que ventas)' })
  @IsEnum(MOTIVOS_CANCELACION)
  motivo: typeof MOTIVOS_CANCELACION[number];

  @ApiPropertyOptional({ description: 'Comentario adicional; obligatorio cuando motivo es OTRO' })
  @IsOptional() @IsString() comentario?: string;
}

export class SendEmailCotizacionDto {
  @ApiProperty({ description: 'Correo destino' })
  @IsEmail()
  to: string;
}
