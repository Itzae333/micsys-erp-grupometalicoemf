import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificacionesService {
  constructor(private prisma: PrismaService) {}

  async getResumen(empresaId: string) {
    const ahora      = new Date();
    const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const hace7dias  = new Date(ahora.getTime() -  7 * 24 * 60 * 60 * 1000);

    const [creditosVencidos, cotizacionesViejas, ocPendientes] = await Promise.all([
      // Notas de crédito con más de 30 días sin saldar
      this.prisma.notaVenta.findMany({
        where: {
          empresa_id: empresaId,
          estatus:    'CREDITO',
          created_at: { lt: hace30dias },
        },
        select: {
          id: true,
          folio: true,
          total: true,
          created_at: true,
          cliente: { select: { nombre: true, apellidos: true, razon_social: true } },
        },
        orderBy: { created_at: 'asc' },
        take: 20,
      }),

      // Cotizaciones sin convertir con más de 7 días
      this.prisma.notaVenta.findMany({
        where: {
          empresa_id: empresaId,
          estatus:    'COTIZACION',
          created_at: { lt: hace7dias },
        },
        select: {
          id: true,
          folio: true,
          total: true,
          created_at: true,
          cliente: { select: { nombre: true, apellidos: true, razon_social: true } },
        },
        orderBy: { created_at: 'asc' },
        take: 20,
      }),

      // Órdenes de compra sin recibir completamente
      this.prisma.ordenCompra.findMany({
        where: {
          empresa_id: empresaId,
          estatus: { in: ['APROBADA', 'RECIBIDA_PARCIAL'] },
        },
        select: {
          id: true,
          folio: true,
          total: true,
          created_at: true,
          proveedor: { select: { nombre: true } },
        },
        orderBy: { created_at: 'asc' },
        take: 20,
      }),
    ]);

    const alertas = [];

    if (creditosVencidos.length > 0) {
      alertas.push({
        tipo:   'credito_vencido',
        titulo: 'Créditos vencidos (+30 días)',
        count:  creditosVencidos.length,
        href:   '/credito',
        items:  creditosVencidos.map((n) => ({
          id:    n.id,
          label: (n.cliente?.razon_social ?? `${n.cliente?.nombre ?? ''} ${n.cliente?.apellidos ?? ''}`.trim()) || 'Público general',
          sub:   `Folio ${n.folio ?? '—'} · $${Number(n.total).toFixed(2)}`,
          href:  `/ventas/${n.id}`,
          dias:  Math.floor((ahora.getTime() - n.created_at.getTime()) / (1000 * 60 * 60 * 24)),
        })),
      });
    }

    if (cotizacionesViejas.length > 0) {
      alertas.push({
        tipo:   'cotizacion_vieja',
        titulo: 'Cotizaciones sin convertir (+7 días)',
        count:  cotizacionesViejas.length,
        href:   '/ventas',
        items:  cotizacionesViejas.map((n) => ({
          id:    n.id,
          label: (n.cliente?.razon_social ?? `${n.cliente?.nombre ?? ''} ${n.cliente?.apellidos ?? ''}`.trim()) || 'Público general',
          sub:   `Folio ${n.folio ?? '—'} · $${Number(n.total).toFixed(2)}`,
          href:  `/ventas/${n.id}`,
          dias:  Math.floor((ahora.getTime() - n.created_at.getTime()) / (1000 * 60 * 60 * 24)),
        })),
      });
    }

    if (ocPendientes.length > 0) {
      alertas.push({
        tipo:   'oc_pendiente',
        titulo: 'Órdenes de compra pendientes',
        count:  ocPendientes.length,
        href:   '/compras',
        items:  ocPendientes.map((oc) => ({
          id:    oc.id,
          label: oc.proveedor?.nombre ?? 'Proveedor',
          sub:   `OC-${String(oc.folio).padStart(4, '0')} · $${Number(oc.total).toFixed(2)}`,
          href:  '/compras',
          dias:  Math.floor((ahora.getTime() - oc.created_at.getTime()) / (1000 * 60 * 60 * 24)),
        })),
      });
    }

    return {
      total:  alertas.reduce((s, a) => s + a.count, 0),
      alertas,
    };
  }
}
