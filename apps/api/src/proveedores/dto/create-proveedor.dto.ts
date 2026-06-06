import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProveedorDto {
  @ApiProperty() @IsString() nombre: string;

  @ApiPropertyOptional() @IsOptional() @IsString() razon_social?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rfc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() direccion?: string;
}
