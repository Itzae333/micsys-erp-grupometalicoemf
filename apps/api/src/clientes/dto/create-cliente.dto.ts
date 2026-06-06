import { IsString, IsOptional, IsEmail, IsNumber, Min, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AbonarCuentaDto {
  @ApiProperty({ description: 'Monto a abonar a la cuenta del cliente' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  monto: number;

  @ApiProperty({ description: 'Método de pago' })
  @IsString()
  metodo: string;

  @ApiPropertyOptional({ description: 'Referencia (últimos 4 de tarjeta, folio transferencia, etc.)' })
  @IsOptional()
  @IsString()
  referencia?: string;
}

export class CreateClienteDto {
  @ApiProperty() @IsString() nombre: string;

  @ApiPropertyOptional() @IsOptional() @IsString() apellidos?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() razon_social?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rfc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() direccion?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(1) precio_num?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) limite_credito?: number;
}

export class UpdateClienteDto extends CreateClienteDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
}
