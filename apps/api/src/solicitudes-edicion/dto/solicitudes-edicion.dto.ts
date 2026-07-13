import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CrearSolicitudDto {
  @ApiProperty({ description: 'Motivo por el que se solicita editar la venta ya cobrada' })
  @IsString()
  @MinLength(5)
  motivo: string;
}

export class AprobarSolicitudDto {
  @ApiProperty({ description: 'ID del usuario ADMIN que autoriza (debe ser uno de los administradores notificados)' })
  @IsString()
  aprobador_usuario_id: string;
}

export class RechazarSolicitudDto {
  @ApiPropertyOptional() @IsOptional() @IsString() comentario_admin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() aprobador_usuario_id?: string;
}
