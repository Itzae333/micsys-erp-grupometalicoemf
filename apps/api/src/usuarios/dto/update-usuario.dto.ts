import {
  IsString,
  IsEmail,
  IsEnum,
  IsArray,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RolUsuario } from '@grupometalicoemf/database';

export class UpdateUsuarioDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() apellidos?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ enum: RolUsuario }) @IsOptional() @IsEnum(RolUsuario) rol?: RolUsuario;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) ubicacion_ids?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional({ type: [String], description: 'IPs permitidas (vacío = sin restricción)' })
  @IsOptional() @IsArray() @IsString({ each: true }) allowed_ips?: string[];
}
