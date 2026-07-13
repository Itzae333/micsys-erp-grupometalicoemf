import { IsString, IsOptional, IsNumber, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGastoDto {
  @ApiProperty() @IsString() concepto: string;
  @ApiProperty() @IsString() categoria: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) monto: number;

  @ApiPropertyOptional({ enum: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'] })
  @IsOptional()
  @IsEnum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'])
  metodo_pago?: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'DEPOSITO';

  @ApiPropertyOptional() @IsOptional() @IsString() comprobante_url?: string;
}
