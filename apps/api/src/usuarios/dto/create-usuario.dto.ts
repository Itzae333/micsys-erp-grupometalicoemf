import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  MaxLength,
  IsEnum,
  IsArray,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RolUsuario } from '@grupometalicoemf/database';

export class CreateUsuarioDto {
  @ApiProperty() @IsString() @IsNotEmpty() nombre: string;
  @ApiProperty() @IsString() @IsNotEmpty() apellidos: string;

  @ApiProperty({ example: 'encargado@emfimifar.com' })
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100)
  password: string;

  @ApiProperty({ enum: RolUsuario })
  @IsEnum(RolUsuario)
  rol: RolUsuario;

  @ApiProperty({ type: [String], description: 'IDs de ubicaciones asignadas' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Asigna al menos una ubicación' })
  @IsString({ each: true })
  ubicacion_ids: string[];
}
