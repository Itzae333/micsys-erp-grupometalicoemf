import { IsString, IsOptional, IsIn, IsNumber, IsPositive, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ACCIONES = ['EDITAR', 'ELIMINAR'] as const;
const METODOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO', 'ADMINISTRATIVO'] as const;

export class CrearSolicitudAbonoDto {
  @ApiProperty({ description: 'Motivo por el que se solicita editar/eliminar el abono' })
  @IsString()
  @MinLength(5)
  motivo: string;

  @ApiProperty({ enum: ACCIONES })
  @IsIn(ACCIONES)
  accion: 'EDITAR' | 'ELIMINAR';

  @ApiPropertyOptional({ description: 'Nuevo monto — requerido cuando accion es EDITAR' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  nuevo_monto?: number;

  @ApiPropertyOptional({ enum: METODOS, description: 'Nuevo método — requerido cuando accion es EDITAR' })
  @IsOptional()
  @IsIn(METODOS)
  nuevo_metodo?: (typeof METODOS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nueva_referencia?: string;
}

export class AprobarSolicitudAbonoDto {
  @ApiProperty({ description: 'ID del usuario ADMIN que autoriza (debe ser uno de los administradores notificados)' })
  @IsString()
  aprobador_usuario_id: string;
}

export class RechazarSolicitudAbonoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() comentario_admin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() aprobador_usuario_id?: string;
}
