import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  IsNotEmpty,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TipoColumna } from '@grupometalicoemf/database';

export class ConfigColumnaItemDto {
  @ApiProperty({ enum: TipoColumna })
  @IsEnum(TipoColumna)
  tipo: TipoColumna;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  numero: number;

  @ApiProperty({ example: 'Mayoreo' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty()
  @IsBoolean()
  activa: boolean;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  orden: number;
}

export class UpsertConfigColumnasDto {
  @ApiProperty({ type: [ConfigColumnaItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfigColumnaItemDto)
  columnas: ConfigColumnaItemDto[];
}
