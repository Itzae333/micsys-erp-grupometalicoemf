import {
  IsString, IsNumber, IsOptional, IsEnum, IsPositive, IsDateString,
  Min, Max, IsInt, IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ── Áreas ──────────────────────────────────────────────────────

export class CreateAreaDto {
  @ApiProperty() @IsString() nombre: string;

  @ApiProperty({ enum: ['POR_HORA', 'POR_PIEZA'] })
  @IsEnum(['POR_HORA', 'POR_PIEZA'])
  tipo_pago: string;
}

export class UpdateAreaDto extends PartialType(CreateAreaDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
}

// ── Empleados ──────────────────────────────────────────────────

export class CreateEmpleadoDto {
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty() @IsString() apellidos: string;
  @ApiProperty() @IsString() puesto: string;

  @ApiPropertyOptional({ description: 'ID del área por defecto del empleado' })
  @IsOptional() @IsString()
  area_id?: string;

  @ApiPropertyOptional({ description: 'ID del usuario del sistema vinculado (opcional)' })
  @IsOptional() @IsString()
  usuario_id?: string;

  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) salario_diario: number;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono?: string;

  @ApiProperty({ description: 'Fecha ISO yyyy-mm-dd' })
  @IsDateString()
  fecha_ingreso: string;

  @ApiPropertyOptional({ description: 'Descuento por cada 30 min de tardanza (áreas POR_HORA)' })
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  descuento_por_30min?: number;

  @ApiPropertyOptional({ description: 'Mínimo de piezas por semana (áreas POR_PIEZA)' })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  minimo_piezas_semana?: number;

  @ApiPropertyOptional({ description: 'Sanción por pieza faltante (áreas POR_PIEZA)' })
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  sancion_por_pieza?: number;
}

export class UpdateEmpleadoDto extends PartialType(CreateEmpleadoDto) {}

// ── Asistencia ─────────────────────────────────────────────────

export class RegistrarAsistenciaDto {
  @ApiProperty() @IsString() empleado_id: string;

  @ApiProperty({ description: 'Fecha ISO yyyy-mm-dd' })
  @IsDateString()
  fecha: string;

  @ApiPropertyOptional({ description: 'ID del área donde trabajó ese día' })
  @IsOptional() @IsString()
  area_id?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() hora_entrada?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hora_salida?: string;

  @ApiProperty({ enum: ['PRESENTE', 'AUSENTE', 'TARDANZA', 'PERMISO', 'VACACIONES'] })
  @IsEnum(['PRESENTE', 'AUSENTE', 'TARDANZA', 'PERMISO', 'VACACIONES'])
  estatus: string;

  @ApiPropertyOptional({ description: 'Minutos tarde (aplica sanción POR_HORA automáticamente)' })
  @IsOptional() @IsInt() @Min(0)
  @Type(() => Number)
  minutos_tarde?: number;

  @ApiPropertyOptional({ description: 'Piezas realizadas ese día (áreas POR_PIEZA)' })
  @IsOptional() @IsInt() @Min(0)
  @Type(() => Number)
  piezas_realizadas?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
}

export class EditarAsistenciaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() area_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hora_entrada?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hora_salida?: string;

  @ApiPropertyOptional({ enum: ['PRESENTE', 'AUSENTE', 'TARDANZA', 'PERMISO', 'VACACIONES'] })
  @IsOptional()
  @IsEnum(['PRESENTE', 'AUSENTE', 'TARDANZA', 'PERMISO', 'VACACIONES'])
  estatus?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) minutos_tarde?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) piezas_realizadas?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
}

// ── Producción ─────────────────────────────────────────────────

export class CreateOrdenProduccionDto {
  @ApiProperty() @IsString() articulo_id: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5)
  existencia_num: number;

  @ApiProperty() @IsNumber() @IsPositive() @Type(() => Number) cantidad_objetivo: number;

  @ApiProperty({ description: 'Fecha inicio ISO yyyy-mm-dd' })
  @IsDateString()
  fecha_inicio: string;

  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
}

export class AvanceProduccionDto {
  @ApiProperty() @IsNumber() @IsPositive() @Type(() => Number) cantidad: number;
}
