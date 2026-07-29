import { getTicketLogoUrl, logoToEscPosBase64, buildTicketUbicacionFiscal } from '@/lib/utils/ticket-logo';

/**
 * Forma mínima de una remisión necesaria para armar su ticket. Coincide con lo
 * que devuelven tanto `/remisiones` (lista) como `/remisiones/:id` (detalle),
 * que comparten el mismo include en el backend.
 */
export interface RemisionTicket {
  folio: string;
  concepto: string | null;
  created_at: string;
  fecha_envio: string | null;
  empresa_origen: { nombre: string; logo_url?: string | null };
  ub_origen: {
    nombre: string;
    logo_url?: string | null;
    razon_social?: string | null;
    rfc?: string | null;
    regimen_fiscal?: string | null;
    telefono?: string | null;
    calle?: string | null;
    num_ext?: string | null;
    num_int?: string | null;
    colonia?: string | null;
    municipio?: string | null;
    estado?: string | null;
    cp?: string | null;
  };
  empresa_destino: { nombre: string };
  ub_destino: { nombre: string };
  lineas: {
    cantidad_enviada: number;
    articulo: {
      clave: string;
      descripcion_1: string | null; descripcion_2: string | null;
      descripcion_3: string | null; descripcion_4: string | null; descripcion_5: string | null;
    };
  }[];
}

export function fechaTicketRemision(rem: Pick<RemisionTicket, 'fecha_envio' | 'created_at'>): string {
  return new Date(rem.fecha_envio ?? rem.created_at).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Igual que en ventas: junta las 5 descripciones del artículo, las que tenga. */
export function descripcionCompletaRemision(art: RemisionTicket['lineas'][number]['articulo']): string {
  return [art.descripcion_1, art.descripcion_2, art.descripcion_3, art.descripcion_4, art.descripcion_5]
    .filter(Boolean).join(' · ');
}

/**
 * Envía (o reenvía) el ticket de remisión de salida al print bridge local.
 * Retorna false si el bridge no está disponible — nunca lanza.
 */
export async function printRemisionTicket(rem: RemisionTicket): Promise<boolean> {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Logo/datos fiscales de la ubicación que emite la remisión (origen)
  const logoUrl = getTicketLogoUrl(rem.empresa_origen, rem.ub_origen);
  const logo_escpos_b64 = logoUrl ? await logoToEscPosBase64(logoUrl) : null;

  const payload = {
    tipo: 'remision',
    logo_escpos_b64,
    empresa: { nombre: rem.empresa_origen.nombre },
    ubicacion: { nombre: rem.ub_origen.nombre, ...buildTicketUbicacionFiscal(rem.ub_origen) },
    empresa_origen: { nombre: rem.empresa_origen.nombre },
    folio: rem.folio,
    concepto: rem.concepto ?? null,
    origen: { empresa: rem.empresa_origen.nombre, ubicacion: rem.ub_origen.nombre },
    destino: { empresa: rem.empresa_destino.nombre, ubicacion: rem.ub_destino.nombre },
    fecha: fechaTicketRemision(rem),
    lineas: rem.lineas.map((l) => ({
      clave: l.articulo.clave,
      descripcion: descripcionCompletaRemision(l.articulo) || null,
      cantidad: l.cantidad_enviada,
    })),
    qr_url: `${appUrl}/movimientos/recibir?folio=${rem.folio}`,
  };

  try {
    const res = await fetch('http://localhost:7788/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    console.warn('[remisiones] Print bridge no disponible en localhost:7788');
    return false;
  }
}
