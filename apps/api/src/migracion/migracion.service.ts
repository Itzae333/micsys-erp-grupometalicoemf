import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parse } from 'csv-parse/sync';

interface ImportResult {
  insertados: number;
  actualizados: number;
  omitidos: number;
  errores: { fila: number; motivo: string }[];
}

interface ListaVentasQuery {
  page: number;
  limit: number;
  desde?: string;
  hasta?: string;
  q?: string;
  sucursal?: string;
}

function toNum(val: unknown, fallback = 0): number {
  const n = parseFloat(String(val ?? ''));
  return isNaN(n) ? fallback : n;
}

function toInt(val: unknown, fallback = 0): number {
  const n = parseInt(String(val ?? ''));
  return isNaN(n) ? fallback : n;
}

function buildClave(row: Record<string, string>): string {
  return `LEGACY-${String(row['id'] ?? '0').padStart(6, '0')}`;
}

@Injectable()
export class MigracionService {
  constructor(private prisma: PrismaService) {}

  async importarInventario(buffer: Buffer, empresaId: string): Promise<ImportResult> {
    const rows: Record<string, string>[] = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const result: ImportResult = { insertados: 0, actualizados: 0, omitidos: 0, errores: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const clave = buildClave(row);
      try {
        const data = {
          clave,
          empresa_id: empresaId,
          descripcion_1: row['descripcion1'] || null,
          descripcion_2: row['descripcion2'] || null,
          descripcion_3: row['descripcion3'] || null,
          // inventario_virgen: descripcion4 = color resuelto vía JOIN
          // inventario_punto_venta: descripcion4/5 son columnas directas
          descripcion_4: row['descripcion4'] || null,
          descripcion_5: row['descripcion5'] || null,
          existencia_1: toNum(row['existencias1']),
          existencia_2: toNum(row['existencias2']),
          existencia_3: toNum(row['existencias3']),
          precio_1: toNum(row['precio1']),
          precio_2: toNum(row['precio2']),
          precio_3: toNum(row['precio3']),
          precio_4: toNum(row['precio4']),
        };

        const existing = await this.prisma.articulo.findUnique({
          where: { empresa_id_clave: { empresa_id: empresaId, clave } },
          select: { id: true },
        });

        if (existing) {
          await this.prisma.articulo.update({ where: { id: existing.id }, data });
          result.actualizados++;
        } else {
          await this.prisma.articulo.create({ data });
          result.insertados++;
        }
      } catch (err) {
        result.errores.push({ fila: i + 2, motivo: String((err as Error).message).slice(0, 120) });
      }
    }

    return result;
  }

  async importarClientes(buffer: Buffer, empresaId: string): Promise<ImportResult> {
    const rows: Record<string, string>[] = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const result: ImportResult = { insertados: 0, actualizados: 0, omitidos: 0, errores: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const nombreCompleto = [row['nombre'], row['apellidoPaterno'], row['apellidoMaterno']]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (!nombreCompleto) {
        result.errores.push({ fila: i + 2, motivo: 'Nombre vacío' });
        continue;
      }

      try {
        const saldo = toNum(row['saldo']);
        const email = row['correo'] || null;

        // Busca duplicado por nombre dentro de la empresa
        const existing = await this.prisma.cliente.findFirst({
          where: { empresa_id: empresaId, nombre: nombreCompleto },
          select: { id: true },
        });

        if (existing) {
          result.omitidos++;
          continue;
        }

        await this.prisma.cliente.create({
          data: {
            empresa_id: empresaId,
            nombre: nombreCompleto,
            telefono: row['telefono'] || null,
            email,
            saldo_pendiente: saldo,
          },
        });
        result.insertados++;
      } catch (err) {
        result.errores.push({ fila: i + 2, motivo: String((err as Error).message).slice(0, 120) });
      }
    }

    return result;
  }

  async importarVentas(buffer: Buffer, empresaId: string): Promise<ImportResult & { lineas_insertadas: number }> {
    const rows: Record<string, string>[] = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Agrupar filas por venta_id + sucursal
    const mapa = new Map<string, { header: Record<string, string>; lineas: Record<string, string>[] }>();
    for (const row of rows) {
      const key = `${row['sucursal']}|${row['venta_id']}`;
      if (!mapa.has(key)) {
        mapa.set(key, { header: row, lineas: [] });
      }
      mapa.get(key)!.lineas.push(row);
    }

    // IDs ya importados para esta empresa (evita duplicados)
    const yaImportados = await this.prisma.legacyVenta.findMany({
      where: { empresa_id: empresaId },
      select: { legacy_id: true, sucursal: true },
    });
    const importadosSet = new Set(yaImportados.map((v) => `${v.sucursal}|${v.legacy_id}`));

    const result = { insertados: 0, actualizados: 0, omitidos: 0, lineas_insertadas: 0, errores: [] as { fila: number; motivo: string }[] };
    let filaActual = 2;

    for (const [, grupo] of mapa) {
      const { header, lineas } = grupo;
      const legacyId = toInt(header['venta_id']);
      const sucursal = header['sucursal'] || 'virgen';
      const key = `${sucursal}|${legacyId}`;
      filaActual += lineas.length;

      if (importadosSet.has(key)) {
        result.omitidos++;
        continue;
      }

      try {
        const fechaRaw = header['fechaHoraVenta'];
        const fechaHora = fechaRaw ? new Date(fechaRaw) : new Date(0);

        await this.prisma.legacyVenta.create({
          data: {
            empresa_id: empresaId,
            legacy_id: legacyId,
            sucursal,
            cliente_nombre: header['cliente_nombre'] || null,
            nota: header['nota'] || null,
            incidencia: header['incidencia'] || null,
            recibido: toNum(header['recibido']),
            cambio: toNum(header['cambio']),
            restan: toNum(header['restan']),
            total: toNum(header['total']),
            estatus: header['estatusVenta'] || 'PAGADA',
            tipo_pago: header['tipoPago'] || 'EFECTIVO',
            fecha_hora: fechaHora,
            lineas: {
              create: lineas.map((l) => ({
                descripcion_1: l['descripcion1'] || null,
                descripcion_2: l['descripcion2'] || null,
                descripcion_3: l['descripcion3'] || null,
                // virgen: columnas color/material resueltas como descripcion4/5 en el CSV
                // punto_venta: descripcion4/5 directas desde la tabla
                color: l['descripcion4'] || null,
                material: l['descripcion5'] || null,
                cantidad: toNum(l['cantidad'], 1),
                precio_neto: toNum(l['precioNeto']),
                total: toNum(l['linea_total']),
              })),
            },
          },
        });

        result.insertados++;
        result.lineas_insertadas += lineas.length;
      } catch (err) {
        result.errores.push({ fila: filaActual, motivo: String((err as Error).message).slice(0, 120) });
      }
    }

    return result;
  }

  async listarVentas(empresaId: string, query: ListaVentasQuery) {
    const { page, limit, desde, hasta, q, sucursal } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { empresa_id: empresaId };
    if (sucursal) where['sucursal'] = sucursal;
    if (q) where['cliente_nombre'] = { contains: q, mode: 'insensitive' };
    if (desde || hasta) {
      where['fecha_hora'] = {
        ...(desde ? { gte: new Date(desde) } : {}),
        ...(hasta ? { lte: new Date(`${hasta}T23:59:59`) } : {}),
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.legacyVenta.count({ where }),
      this.prisma.legacyVenta.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fecha_hora: 'desc' },
        select: {
          id: true,
          legacy_id: true,
          sucursal: true,
          cliente_nombre: true,
          total: true,
          recibido: true,
          restan: true,
          estatus: true,
          tipo_pago: true,
          fecha_hora: true,
        },
      }),
    ]);

    return {
      data: data.map((v) => ({ ...v, total: Number(v.total), recibido: Number(v.recibido), restan: Number(v.restan) })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async detalleVenta(id: string, empresaId: string) {
    const venta = await this.prisma.legacyVenta.findFirst({
      where: { id, empresa_id: empresaId },
      include: { lineas: true },
    });
    if (!venta) throw new NotFoundException('Venta histórica no encontrada');

    return {
      ...venta,
      total: Number(venta.total),
      recibido: Number(venta.recibido),
      cambio: Number(venta.cambio),
      restan: Number(venta.restan),
      lineas: venta.lineas.map((l) => ({
        ...l,
        cantidad: Number(l.cantidad),
        precio_neto: Number(l.precio_neto),
        total: Number(l.total),
      })),
    };
  }
}
