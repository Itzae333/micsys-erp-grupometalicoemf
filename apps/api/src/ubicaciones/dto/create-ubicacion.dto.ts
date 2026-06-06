import { IsString, IsNotEmpty, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoUbicacion } from '@grupometalicoemf/database';

export class CreateUbicacionDto {
  @ApiProperty({ example: 'Matriz Monterrey' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ enum: TipoUbicacion })
  @IsEnum(TipoUbicacion)
  tipo: TipoUbicacion;

  @ApiPropertyOptional() @IsOptional() @IsString() razon_social?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(13) rfc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regimen_fiscal?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() calle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() num_ext?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() num_int?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() colonia?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() municipio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) cp?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono?: string;
}
