import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ConfigColumnasSchema } from './types/api';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Precio a usar cuando la venta no tiene cliente asignado (mostrador):
 * siempre precio_1 ("Público") si está activo. El orden de `schema.precios`
 * es el orden de despliegue configurable por el admin (columna en Inventario),
 * no una prioridad de negocio — tomar "el primer activo" de ese arreglo hacía
 * que reordenar columnas para verlas más cómodo cambiara el precio con el que
 * se vendía en mostrador.
 */
export function precioMostradorNumero(schema: ConfigColumnasSchema | null | undefined): number {
  if (schema?.precios.some((p) => p.numero === 1 && p.activa)) return 1;
  return schema?.precios.find((p) => p.activa)?.numero ?? 1;
}

export function formatPrecio(monto: number | string): string {
  return '$' + new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(monto));
}

export function formatCantidad(cantidad: number | string): string {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(cantidad));
}

export function formatFecha(fecha: Date | string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(fecha));
}

export function formatFechaCorta(fecha: Date | string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(fecha));
}
