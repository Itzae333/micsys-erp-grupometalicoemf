import { IsNumber, IsOptional, IsString, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AbonoDto {
  @ApiProperty({ description: 'Monto del abono', minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  monto: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  concepto?: string;
}

export class AjusteDto {
  @ApiProperty({ enum: ['CARGO', 'ABONO'] })
  @IsEnum(['CARGO', 'ABONO'])
  tipo: 'CARGO' | 'ABONO';

  @ApiProperty({ minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  monto: number;

  @ApiProperty()
  @IsString()
  concepto: string;
}
