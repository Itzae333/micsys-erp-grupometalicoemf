import {
  IsString, IsOptional, IsNumber, IsBoolean, IsEnum, IsEmail,
  IsArray, ValidateNested, Min, ArrayMinSize, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LineaVentaDto {
  @ApiProperty() @IsString() articulo_id: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.001) cantidad: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) precio_unitario: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) descuento?: number;
}

export class CreateNotaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cliente_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LineaVentaDto) lineas?: LineaVentaDto[];
}

export class AddLineaDto {
  @ApiProperty() @IsString() articulo_id: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.001) cantidad: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) precio_unitario: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) descuento?: number;
}

export class UpdateLineaDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0.001) cantidad?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) precio_unitario?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) descuento?: number;
}

export class PagoDto {
  @ApiProperty({ enum: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO', 'ADMINISTRATIVO'] })
  @IsEnum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO', 'ADMINISTRATIVO'])
  metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'DEPOSITO' | 'ADMINISTRATIVO';

  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) monto: number;
  @ApiPropertyOptional() @IsOptional() @IsString() referencia?: string;
}

export class CerrarNotaDto {
  @ApiProperty({ type: [PagoDto] })
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  pagos: PagoDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() es_credito?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() fecha_vencimiento?: string;
}

export const MOTIVOS_CANCELACION = [
  'SOLO_CONSULTA_PRECIO',
  'CLIENTE_DESISTIO',
  'ERROR_CAPTURA',
  'PRODUCTO_NO_DISPONIBLE',
  'NOTA_DUPLICADA',
  'OTRO',
] as const;

export class CancelarNotaDto {
  @ApiProperty({ enum: MOTIVOS_CANCELACION, description: 'Motivo de cancelación del catálogo' })
  @IsEnum(MOTIVOS_CANCELACION)
  motivo: typeof MOTIVOS_CANCELACION[number];

  @ApiPropertyOptional({ description: 'Comentario adicional; obligatorio cuando motivo es OTRO' })
  @IsOptional() @IsString() comentario?: string;
}

export class VentaRapidaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cliente_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;

  @ApiProperty({ type: [LineaVentaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaVentaDto)
  lineas: LineaVentaDto[];

  @ApiProperty({ enum: ['PAGADA', 'CREDITO', 'PENDIENTE'] })
  @IsEnum(['PAGADA', 'CREDITO', 'PENDIENTE'])
  tipo_cierre: 'PAGADA' | 'CREDITO' | 'PENDIENTE';

  @ApiProperty({ type: [PagoDto] })
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  pagos: PagoDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() fecha_vencimiento?: string;

  @ApiProperty({ description: 'UUID generado en el cliente — clave de idempotencia para reintentos de la cola offline' })
  @IsString()
  client_ref: string;
}

export class AbonarNotaDto {
  @ApiProperty({ type: [PagoDto], description: 'Pagos a registrar en el abono' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  pagos: PagoDto[];
}

export class AgregarEvidenciaDto {
  @ApiPropertyOptional({ description: 'Descripción del comprobante' })
  @IsOptional() @IsString() descripcion?: string;

  @ApiPropertyOptional({ description: 'URL pública del comprobante (Google Drive, Dropbox, etc.)' })
  @IsOptional() @IsString() archivo_url?: string;

  @ApiPropertyOptional({ description: 'Base64 de la imagen/archivo (máx. 5 MB, e.g. data:image/jpeg;base64,...)' })
  @IsOptional() @IsString() data_base64?: string;
}

export class SendEmailDto {
  @ApiProperty({ description: 'Correo destino' })
  @IsEmail()
  to: string;

  /** Datos adicionales para el comprobante de cobro (pagos, cambio, tipo_cierre) */
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  extra?: {
    pagos?: { metodo: string; monto: number }[];
    cambio?: number;
    tipo_cierre?: string;
  };

  /** Láminas Monterrey: enviar el comprobante sin precios/total (nota de entrega). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sinPrecios?: boolean;
}
