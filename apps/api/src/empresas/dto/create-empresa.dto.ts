import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEmpresaDto {
  @ApiProperty({ example: 'EMFIMIFAR' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 'EMFIMIFAR S.A. de C.V.' })
  @IsString()
  @IsNotEmpty()
  razon_social: string;

  @ApiProperty({ example: 'EMF000101ABC' })
  @IsString()
  @Length(12, 13, { message: 'El RFC debe tener 12 o 13 caracteres' })
  @Matches(/^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/, { message: 'Formato de RFC inválido' })
  rfc: string;
}
