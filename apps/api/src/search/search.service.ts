import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async buscar(empresaId: string, ubicacionId: string, q: string, limit = 5) {
    if (!q || q.trim().length < 2) return { results: [] };

    const term = q.trim();
    const ilike = { contains: term, mode: 'insensitive' as const };

    const [notas, articulos, clientes, proveedores, empleados] = await Promise.all([
      this.prisma.notaVenta.findMany({
        where: {
          ubicacion_id: ubicacionId,
          OR: [
            { folio: isNaN(Number(term)) ? undefined : Number(term) },
            { cliente: { nombre: ilike } },
            { cliente: { apellidos: ilike } },
            { cliente: { razon_social: ilike } },
          ].filter(Boolean),
        },
        select: {
          id: true, folio: true, estatus: true, total: true,
          cliente: { select: { nombre: true, apellidos: true, razon_social: true } },
        },
        take: limit,
        orderBy: { created_at: 'desc' },
      }),

      this.prisma.articulo.findMany({
        where: {
          ubicacion_id: ubicacionId,
          OR: [
            { clave: ilike },
            { descripcion_1: ilike },
            { descripcion_2: ilike },
          ],
        },
        select: { id: true, clave: true, descripcion_1: true, descripcion_2: true, activo: true },
        take: limit,
        orderBy: { clave: 'asc' },
      }),

      this.prisma.cliente.findMany({
        where: {
          ubicacion_id: ubicacionId,
          OR: [
            { nombre: ilike },
            { apellidos: ilike },
            { razon_social: ilike },
            { telefono: ilike },
          ],
        },
        select: { id: true, nombre: true, apellidos: true, razon_social: true, telefono: true },
        take: limit,
        orderBy: { nombre: 'asc' },
      }),

      // Proveedores son nivel empresa
      this.prisma.proveedor.findMany({
        where: {
          empresa_id: empresaId,
          OR: [{ nombre: ilike }, { rfc: ilike }],
        },
        select: { id: true, nombre: true, rfc: true },
        take: limit,
        orderBy: { nombre: 'asc' },
      }),

      // Empleados son nivel empresa
      this.prisma.empleado.findMany({
        where: {
          empresa_id: empresaId,
          OR: [{ nombre: ilike }, { apellidos: ilike }, { puesto: ilike }],
        },
        select: { id: true, nombre: true, apellidos: true, puesto: true },
        take: limit,
        orderBy: { nombre: 'asc' },
      }),
    ]);

    const results: {
      tipo: string;
      id: string;
      label: string;
      sub: string;
      href: string;
    }[] = [];

    for (const n of notas) {
      results.push({
        tipo:  'nota',
        id:    n.id,
        label: `Nota ${n.folio ?? n.id.slice(-6)}`,
        sub:   (n.cliente?.razon_social ?? `${n.cliente?.nombre ?? ''} ${n.cliente?.apellidos ?? ''}`.trim()) || 'Público general',
        href:  `/ventas/${n.id}`,
      });
    }

    for (const a of articulos) {
      results.push({
        tipo:  'articulo',
        id:    a.id,
        label: a.clave,
        sub:   [a.descripcion_1, a.descripcion_2].filter(Boolean).join(' · '),
        href:  `/inventario/${a.id}`,
      });
    }

    for (const c of clientes) {
      results.push({
        tipo:  'cliente',
        id:    c.id,
        label: c.razon_social ?? `${c.nombre} ${c.apellidos ?? ''}`.trim(),
        sub:   c.telefono ?? '',
        href:  `/ventas/clientes`,
      });
    }

    for (const p of proveedores) {
      results.push({
        tipo:  'proveedor',
        id:    p.id,
        label: p.nombre,
        sub:   p.rfc ?? '',
        href:  `/inventario/proveedores`,
      });
    }

    for (const e of empleados) {
      results.push({
        tipo:  'empleado',
        id:    e.id,
        label: `${e.nombre} ${e.apellidos ?? ''}`.trim(),
        sub:   e.puesto ?? '',
        href:  `/rh`,
      });
    }

    return { results };
  }
}
