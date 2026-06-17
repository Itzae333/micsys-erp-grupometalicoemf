import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@grupometalicoemf/database';
import { PrismaService } from '../prisma/prisma.service';
import { parse } from 'csv-parse/sync';

export interface ImportResult {
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

// Corrige mojibake (UTF-8 bytes almacenados como Latin-1: "AraÃ±a" → "Araña")
// y descarta strings vacíos o el literal "null" que vienen del CSV legacy.
function cleanStr(val: string | undefined): string | null {
  if (!val) return null;
  const s = val.trim();
  if (!s || s.toLowerCase() === 'null') return null;
  try {
    return Buffer.from(s, 'latin1').toString('utf8');
  } catch {
    return s;
  }
}

@Injectable()
export class MigracionService {
  constructor(private prisma: PrismaService) {}

  async importarInventario(buffer: Buffer, ubicacionId: string): Promise<ImportResult> {
    const rows = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const result: ImportResult = { insertados: 0, actualizados: 0, omitidos: 0, errores: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const clave = buildClave(row);
      try {
        const data = {
          clave,
          ubicacion_id: ubicacionId,
          descripcion_1: cleanStr(row['descripcion1']),
          descripcion_2: cleanStr(row['descripcion2']),
          descripcion_3: cleanStr(row['descripcion3']),
          // inventario_virgen: descripcion4 = color resuelto vía JOIN
          // inventario_punto_venta: descripcion4/5 son columnas directas
          descripcion_4: cleanStr(row['descripcion4']),
          descripcion_5: cleanStr(row['descripcion5']),
          existencia_1: toNum(row['existencias1']),
          existencia_2: toNum(row['existencias2']),
          existencia_3: toNum(row['existencias3']),
          precio_1: toNum(row['precio1']),
          precio_2: toNum(row['precio2']),
          precio_3: toNum(row['precio3']),
          precio_4: toNum(row['precio4']),
          precio_5: toNum(row['precio5']),
        };

        const existing = await this.prisma.articulo.findUnique({
          where: { ubicacion_id_clave: { ubicacion_id: ubicacionId, clave } },
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

  async importarClientes(buffer: Buffer, ubicacionId: string): Promise<ImportResult> {
    const rows = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const result: ImportResult = { insertados: 0, actualizados: 0, omitidos: 0, errores: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const nombreCompleto = [row['nombre'], row['apellidoPaterno'], row['apellidoMaterno']]
        .map((p) => cleanStr(p) ?? '')
        .filter(Boolean)
        .join(' ')
        .trim();

      if (!nombreCompleto) {
        result.errores.push({ fila: i + 2, motivo: 'Nombre vacío' });
        continue;
      }

      try {
        const saldo     = toNum(row['saldo']);
        const email     = cleanStr(row['correo']);
        const precioRaw = parseInt(row['precio_num'] ?? '', 10);
        const precio_num = !isNaN(precioRaw) && precioRaw >= 1 && precioRaw <= 5
          ? precioRaw
          : null;

        // Busca duplicado por nombre dentro de la ubicación
        const existing = await this.prisma.cliente.findFirst({
          where: { ubicacion_id: ubicacionId, nombre: nombreCompleto },
          select: { id: true },
        });

        if (existing) {
          result.omitidos++;
          continue;
        }

        await this.prisma.cliente.create({
          data: {
            ubicacion_id: ubicacionId,
            nombre: nombreCompleto,
            telefono: cleanStr(row['telefono']),
            email,
            saldo_pendiente: saldo,
            ...(precio_num !== null ? { precio_num } : {}),
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
    const BATCH_SIZE = 200;

    const rows = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    // Agrupar filas por venta_id + sucursal
    const mapa = new Map<string, { header: Record<string, string>; lineas: Record<string, string>[]; fila: number }>();
    let filaActual = 2;
    for (const row of rows) {
      const key = `${row['sucursal']}|${row['venta_id']}`;
      if (!mapa.has(key)) {
        mapa.set(key, { header: row, lineas: [], fila: filaActual });
      }
      mapa.get(key)!.lineas.push(row);
      filaActual++;
    }

    // IDs ya importados (evita duplicados en re-subidas parciales)
    const yaImportados = await this.prisma.legacyVenta.findMany({
      where: { empresa_id: empresaId },
      select: { legacy_id: true, sucursal: true },
    });
    const importadosSet = new Set(yaImportados.map((v) => `${v.sucursal}|${v.legacy_id}`));

    const result = { insertados: 0, actualizados: 0, omitidos: 0, lineas_insertadas: 0, errores: [] as { fila: number; motivo: string }[] };

    // Construir lista de pendientes (excluir ya importados)
    type Pendiente = { data: Prisma.LegacyVentaCreateInput; lineasCount: number; fila: number };
    const pendientes: Pendiente[] = [];

    for (const [, { header, lineas, fila }] of mapa) {
      const legacyId = toInt(header['venta_id']);
      const sucursal = header['sucursal'] || 'virgen';
      const key = `${sucursal}|${legacyId}`;

      if (importadosSet.has(key)) { result.omitidos++; continue; }

      const fechaHora = header['fechaHoraVenta'] ? new Date(header['fechaHoraVenta']) : new Date(0);

      pendientes.push({
        fila,
        lineasCount: lineas.length,
        data: {
          empresa_id:     empresaId,
          legacy_id:      legacyId,
          sucursal,
          cliente_nombre: cleanStr(header['cliente_nombre']),
          nota:           cleanStr(header['nota']),
          incidencia:     cleanStr(header['incidencia']),
          recibido:       toNum(header['recibido']),
          cambio:         toNum(header['cambio']),
          restan:         toNum(header['restan']),
          total:          toNum(header['total']),
          estatus:        header['estatusVenta'] || 'PAGADA',
          tipo_pago:      header['tipoPago'] || 'EFECTIVO',
          fecha_hora:     fechaHora,
          lineas: {
            create: lineas.map((l) => ({
              descripcion_1: cleanStr(l['descripcion1']),
              descripcion_2: cleanStr(l['descripcion2']),
              descripcion_3: cleanStr(l['descripcion3']),
              color:         cleanStr(l['descripcion4']),
              material:      cleanStr(l['descripcion5']),
              cantidad:      toNum(l['cantidad'], 1),
              precio_neto:   toNum(l['precioNeto']),
              total:         toNum(l['linea_total']),
            })),
          },
        },
      });
    }

    // Procesar en lotes de BATCH_SIZE para evitar timeout
    for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
      const lote = pendientes.slice(i, i + BATCH_SIZE);
      try {
        await this.prisma.$transaction(
          lote.map((v) => this.prisma.legacyVenta.create({ data: v.data })),
        );
        result.insertados      += lote.length;
        result.lineas_insertadas += lote.reduce((s, v) => s + v.lineasCount, 0);
      } catch {
        // Si falla el lote completo, reintenta uno por uno para aislar el error
        for (const v of lote) {
          try {
            await this.prisma.legacyVenta.create({ data: v.data });
            result.insertados++;
            result.lineas_insertadas += v.lineasCount;
          } catch (err) {
            result.errores.push({ fila: v.fila, motivo: String((err as Error).message).slice(0, 120) });
          }
        }
      }
    }

    return result;
  }

  async listarVentas(empresaId: string, query: ListaVentasQuery) {
    const { page, limit, desde, hasta, q, sucursal } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { empresa_id: empresaId };
    if (sucursal) where['sucursal'] = sucursal;
    if (q) {
      const words = q.trim().split(/\s+/).filter(Boolean);
      where['AND'] = words.map((word) => ({
        cliente_nombre: { contains: word, mode: 'insensitive' },
      }));
    }
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
