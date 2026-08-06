'use client';

import { useEffect, useState, useRef } from 'react';
import { Search, Trash2, Zap } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { useToast } from '@/components/ui/toast';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { getClientesCache } from '@/lib/db/clientes-cache';
import { searchArticulosCache, refreshArticulosCacheIfStale } from '@/lib/db/articulos-cache';
import { enqueue } from '@/lib/db/sync-queue';
import { addVentaPendiente, nextFolioLocal, type LineaVentaPendiente, type PagoVentaPendiente } from '@/lib/db/ventas-pendientes';
import type { Cliente, Articulo, NotaVenta, MetodoPago } from '@/lib/types/api';
import { EMPRESA_EMFIMIFAR_ID } from '@/lib/empresas';
import { formatPrecio } from '@/lib/utils';

const METODOS_BASE = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'] as const;
const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
  ADMINISTRATIVO: 'Administrativo',
};

interface LineaCarrito {
  key: string;
  articulo_id: string;
  clave: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
}

interface PagoRow {
  metodo: MetodoPago;
  monto: number;
  referencia: string;
}

type PrintTicketFn = (
  nota: NotaVenta,
  tipoCierre: 'PAGADA' | 'CREDITO' | 'PENDIENTE',
  pagosList: { metodo: string; monto: number; referencia: string }[],
  cambioFinal: number,
  copias?: number,
  opts?: { soloAbono?: boolean; saldoAnterior?: number; folioOverride?: string },
) => Promise<boolean>;

interface VentaRapidaDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (nota: NotaVenta) => void;
  printTicket: PrintTicketFn;
}

function calcSubtotal(cantidad: number, precio: number, descuento: number): number {
  return cantidad * precio * (1 - descuento / 100);
}

function clienteLabel(c: Cliente): string {
  return c.razon_social ?? `${c.nombre}${c.apellidos ? ` ${c.apellidos}` : ''}`;
}

// La clave de artículos importados del sistema viejo es un folio interno
// ("LEGACY-000123") sin significado para el usuario — se prioriza mostrar
// siempre la descripción completa y solo se muestra la clave si es una
// clave real (no un folio de importación).
function esClaveLegacy(clave: string): boolean {
  return /^legacy-/i.test(clave);
}

function descripcionCompleta(art: Pick<Articulo, 'descripcion_1' | 'descripcion_2' | 'descripcion_3' | 'descripcion_4' | 'descripcion_5'>): string {
  return [art.descripcion_1, art.descripcion_2, art.descripcion_3, art.descripcion_4, art.descripcion_5]
    .filter(Boolean).join(' · ');
}

export function VentaRapidaDialog({ open, onClose, onCreated, printTicket }: VentaRapidaDialogProps) {
  const toast = useToast();
  const { usuario, accessToken } = useAuthStore();
  const { empresa, ubicacion } = useContextoStore();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState('');

  const [artQ, setArtQ] = useState('');
  const [artResultados, setArtResultados] = useState<Articulo[]>([]);
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);

  const [tipoCierre, setTipoCierre] = useState<'PAGADA' | 'CREDITO' | 'PENDIENTE'>('PAGADA');
  const [pagos, setPagos] = useState<PagoRow[]>([{ metodo: 'EFECTIVO', monto: 0, referencia: '' }]);
  const [observaciones, setObservaciones] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const esEmfimifar = empresa?.id === EMPRESA_EMFIMIFAR_ID;
  // EMFIMIFAR pidió un método de pago extra para dinero entregado directo a
  // un administrativo (o cobrado antes de cerrar la nota).
  const METODOS = esEmfimifar ? [...METODOS_BASE, 'ADMINISTRATIVO'] as const : METODOS_BASE;

  useEffect(() => {
    if (!open || !empresa?.id || !ubicacion?.id) return;
    getClientesCache(empresa.id, ubicacion.id).then(setClientes);
    // Refresca el catálogo en segundo plano — no bloquea el formulario si falla.
    refreshArticulosCacheIfStale(empresa.id, ubicacion.id).catch(() => {});
  }, [open, empresa?.id, ubicacion?.id]);

  useEffect(() => {
    if (open) return;
    setClienteId('');
    setArtQ('');
    setArtResultados([]);
    setLineas([]);
    setTipoCierre('PAGADA');
    setPagos([{ metodo: 'EFECTIVO', monto: 0, referencia: '' }]);
    setObservaciones('');
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!empresa?.id || !ubicacion?.id) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!artQ.trim()) { setArtResultados([]); return; }
    debounceRef.current = setTimeout(() => {
      searchArticulosCache(empresa.id, ubicacion.id, artQ).then(setArtResultados);
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [artQ, empresa?.id, ubicacion?.id]);

  function agregarArticulo(art: Articulo) {
    const descripcion = descripcionCompleta(art);
    setLineas((prev) => [...prev, {
      key: `${art.id}-${Date.now()}`,
      articulo_id: art.id,
      clave: art.clave,
      descripcion,
      cantidad: 1,
      precio_unitario: art.precio_1 ?? 0,
      descuento: 0,
    }]);
    setArtQ('');
    setArtResultados([]);
  }

  function actualizarLinea(key: string, patch: Partial<LineaCarrito>) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function eliminarLinea(key: string) {
    setLineas((prev) => prev.filter((l) => l.key !== key));
  }

  const subtotal = +lineas.reduce((s, l) => s + calcSubtotal(l.cantidad, l.precio_unitario, l.descuento), 0).toFixed(2);
  const totalPagado = tipoCierre !== 'PENDIENTE' ? pagos.reduce((s, p) => s + (p.monto || 0), 0) : 0;
  const cambio = tipoCierre === 'PAGADA' ? Math.max(0, +(totalPagado - subtotal).toFixed(2)) : 0;
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId) ?? null;

  async function onSubmit() {
    if (submitting) return;
    if (lineas.length === 0) { setError('Agrega al menos un artículo'); return; }
    if (tipoCierre === 'CREDITO' && !clienteId) { setError('Selecciona un cliente para venta a crédito'); return; }
    if (!empresa?.id || !ubicacion?.id || !usuario) return;

    setSubmitting(true);
    setError(null);

    const pagosDto = tipoCierre === 'PENDIENTE'
      ? []
      : pagos.filter((p) => p.monto > 0).map((p) => ({
          metodo: p.metodo, monto: p.monto, referencia: p.referencia || undefined,
        }));

    const clientRef = crypto.randomUUID();
    const dto = {
      cliente_id: clienteId || undefined,
      observaciones: observaciones || undefined,
      lineas: lineas.map((l) => ({
        articulo_id: l.articulo_id,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        descuento: l.descuento || undefined,
      })),
      tipo_cierre: tipoCierre,
      pagos: pagosDto,
      client_ref: clientRef,
    };

    try {
      const notaReal = await api.post<NotaVenta>('/ventas/rapida', dto);
      onCreated(notaReal);
      const pagosList = pagosDto.map((p) => ({ metodo: p.metodo, monto: p.monto, referencia: p.referencia ?? '' }));
      await printTicket(notaReal, tipoCierre, pagosList, cambio);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        await guardarOffline(dto, clientRef);
      } else {
        setError(err instanceof Error ? err.message : 'Error al crear la venta');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function guardarOffline(
    dto: {
      cliente_id?: string; observaciones?: string;
      lineas: { articulo_id: string; cantidad: number; precio_unitario: number; descuento?: number }[];
      tipo_cierre: 'PAGADA' | 'CREDITO' | 'PENDIENTE';
      pagos: { metodo: string; monto: number; referencia?: string }[];
      client_ref: string;
    },
    clientRef: string,
  ) {
    if (!empresa?.id || !ubicacion?.id || !usuario || !accessToken) return;

    const folioLocal = await nextFolioLocal(empresa.id, ubicacion.id);

    const queueId = await enqueue({
      method: 'POST',
      url: '/ventas/rapida',
      body: dto,
      empresaId: empresa.id,
      ubicacionId: ubicacion.id,
      accessToken,
    });

    const lineasPendiente: LineaVentaPendiente[] = lineas.map((l) => ({
      articulo_id: l.articulo_id,
      clave: l.clave,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
      descuento: l.descuento,
      subtotal: calcSubtotal(l.cantidad, l.precio_unitario, l.descuento),
    }));

    const pagosPendiente: PagoVentaPendiente[] = dto.pagos.map((p) => ({
      metodo: p.metodo as PagoVentaPendiente['metodo'],
      monto: p.monto,
      referencia: p.referencia,
    }));

    const clienteNombre = clienteSeleccionado ? clienteLabel(clienteSeleccionado) : null;

    await addVentaPendiente({
      clientRef,
      empresaId: empresa.id,
      ubicacionId: ubicacion.id,
      usuarioId: usuario.id,
      clienteId: clienteId || null,
      clienteNombre,
      lineas: lineasPendiente,
      subtotal,
      total: subtotal,
      tipoCierre: dto.tipo_cierre,
      pagos: pagosPendiente,
      syncQueueId: queueId,
      folioLocal,
    });

    // Nota "sombra" — solo para poder imprimir el ticket de inmediato, sin
    // depender de una respuesta del servidor (que todavía no existe).
    const notaSombra: NotaVenta = {
      id: clientRef,
      folio: 0,
      empresa_id: empresa.id,
      ubicacion_id: ubicacion.id,
      usuario_id: usuario.id,
      cliente_id: clienteId || null,
      cliente: clienteSeleccionado ? {
        id: clienteSeleccionado.id,
        nombre: clienteSeleccionado.nombre,
        apellidos: clienteSeleccionado.apellidos,
        razon_social: clienteSeleccionado.razon_social,
        email: clienteSeleccionado.email,
        telefono: clienteSeleccionado.telefono,
        limite_credito: clienteSeleccionado.limite_credito,
        saldo_pendiente: clienteSeleccionado.saldo_pendiente,
        precio_num: clienteSeleccionado.precio_num,
      } : null,
      usuario: { id: usuario.id, nombre: usuario.nombre, apellidos: usuario.apellidos },
      estatus: dto.tipo_cierre,
      version: 1,
      subtotal,
      descuento: 0,
      total: subtotal,
      es_credito: dto.tipo_cierre === 'CREDITO',
      credito_previo: 0,
      fecha_vencimiento: null,
      observaciones: dto.observaciones ?? null,
      motivo_cancelacion: null,
      motivo_cancelacion_comentario: null,
      cancelado_por_id: null,
      cancelado_at: null,
      lineas: lineasPendiente.map((l, i) => ({
        id: `${clientRef}-linea-${i}`,
        nota_id: clientRef,
        articulo_id: l.articulo_id,
        articulo: {
          id: l.articulo_id, clave: l.clave,
          descripcion_1: l.descripcion, descripcion_2: null, descripcion_3: null, descripcion_4: null, descripcion_5: null,
        },
        clave: l.clave,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        descuento: l.descuento,
        subtotal: l.subtotal,
        created_at: new Date().toISOString(),
      })),
      pagos: pagosPendiente.map((p, i) => ({
        id: `${clientRef}-pago-${i}`,
        nota_id: clientRef,
        metodo: p.metodo,
        monto: p.monto,
        referencia: p.referencia ?? null,
        created_at: new Date().toISOString(),
      })),
      evidencias: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cerrada_at: dto.tipo_cierre === 'PENDIENTE' ? null : new Date().toISOString(),
      pedido_origen: null,
      estatus_entrega: null,
    };

    const pagosList = pagosPendiente.map((p) => ({ metodo: p.metodo, monto: p.monto, referencia: p.referencia ?? '' }));
    await printTicket(notaSombra, dto.tipo_cierre, pagosList, cambio, 1, {
      folioOverride: `PENDIENTE (ref. offline-${folioLocal})`,
    });

    toast('Venta guardada sin conexión — se sincronizará automáticamente al reconectar', 'info');
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Venta rápida" description="Funciona sin conexión — ideal para cobrar aunque no haya internet" size="lg">
      <div className="space-y-4">
        {/* Cliente */}
        <div>
          <label className="text-body-sm font-medium text-steel-700 mb-1 block">Cliente (opcional para contado)</label>
          <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)} placeholder="Público en general">
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{clienteLabel(c)}</option>
            ))}
          </Select>
        </div>

        {/* Búsqueda de artículos */}
        <div className="relative">
          <label className="text-body-sm font-medium text-steel-700 mb-1 block">Agregar artículo</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
            <Input
              className="pl-9"
              placeholder="Clave o descripción…"
              value={artQ}
              onChange={(e) => setArtQ(e.target.value)}
            />
          </div>
          {artResultados.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-steel-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {artResultados.map((art) => (
                <button
                  key={art.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-steel-50 text-body-sm border-b border-steel-100 last:border-0"
                  onClick={() => agregarArticulo(art)}
                >
                  <p className="font-medium text-steel-900 truncate">{descripcionCompleta(art) || art.clave}</p>
                  {!esClaveLegacy(art.clave) && (
                    <p className="text-caption text-steel-400 truncate">{art.clave}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Carrito */}
        {lineas.length > 0 && (
          <div className="border border-steel-200 rounded-lg divide-y divide-steel-100">
            {lineas.map((l) => (
              <div key={l.key} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-medium text-steel-900 truncate">{l.descripcion || l.clave}</p>
                  {!esClaveLegacy(l.clave) && (
                    <p className="text-caption text-steel-400 truncate">{l.clave}</p>
                  )}
                </div>
                <Input
                  type="number" min={1}
                  className="w-16 h-8 text-right"
                  value={l.cantidad}
                  onChange={(e) => actualizarLinea(l.key, { cantidad: Number(e.target.value) || 1 })}
                />
                <Input
                  type="number" min={0} step="0.01"
                  className="w-24 h-8 text-right"
                  value={l.precio_unitario}
                  onChange={(e) => actualizarLinea(l.key, { precio_unitario: Number(e.target.value) || 0 })}
                />
                <span className="w-20 text-right text-body-sm font-medium text-steel-900">
                  {formatPrecio(calcSubtotal(l.cantidad, l.precio_unitario, l.descuento))}
                </span>
                <button
                  type="button"
                  onClick={() => eliminarLinea(l.key)}
                  className="text-steel-400 hover:text-brand-600 p-1"
                  aria-label="Eliminar línea"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tipo de cierre */}
        <div>
          <label className="text-body-sm font-medium text-steel-700 mb-1 block">Tipo de venta</label>
          <div className="flex gap-2">
            {/* EMFIMIFAR dejó de usar "Pendiente" — esos casos ahora se manejan con crédito. */}
            {(esEmfimifar ? (['PAGADA', 'CREDITO'] as const) : (['PAGADA', 'CREDITO', 'PENDIENTE'] as const)).map((t) => (
              <Button
                key={t}
                type="button"
                variant={tipoCierre === t ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setTipoCierre(t)}
              >
                {t === 'PAGADA' ? 'Contado' : t === 'CREDITO' ? 'Crédito' : 'Pendiente'}
              </Button>
            ))}
          </div>
        </div>

        {/* Pagos */}
        {tipoCierre !== 'PENDIENTE' && (
          <div className="space-y-2">
            <label className="text-body-sm font-medium text-steel-700 block">Pagos</label>
            {pagos.map((pago, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  className="w-36"
                  value={pago.metodo}
                  onChange={(e) => {
                    const next = [...pagos];
                    next[i] = { ...next[i], metodo: e.target.value as PagoRow['metodo'] };
                    setPagos(next);
                  }}
                >
                  {METODOS.map((m) => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
                </Select>
                <Input
                  type="number" min={0} step="0.01"
                  className="flex-1"
                  placeholder="Monto"
                  value={pago.monto || ''}
                  onChange={(e) => {
                    const next = [...pagos];
                    next[i] = { ...next[i], monto: Number(e.target.value) || 0 };
                    setPagos(next);
                  }}
                />
                {pago.metodo !== 'EFECTIVO' && (
                  <Input
                    className="flex-1"
                    placeholder={pago.metodo === 'ADMINISTRATIVO' ? '¿Quién lo recibió?' : 'Últimos 4 / folio…'}
                    value={pago.referencia}
                    onChange={(e) => {
                      const next = [...pagos];
                      next[i] = { ...next[i], referencia: e.target.value };
                      setPagos(next);
                    }}
                  />
                )}
                {pagos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPagos(pagos.filter((_, idx) => idx !== i))}
                    className="p-1 text-steel-400 hover:text-brand-600"
                    aria-label="Quitar pago"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <Button
              type="button" variant="ghost" size="sm"
              onClick={() => setPagos([...pagos, { metodo: 'EFECTIVO', monto: 0, referencia: '' }])}
            >
              + Agregar método de pago
            </Button>
          </div>
        )}

        {/* Totales */}
        <div className="bg-steel-50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-body-sm text-steel-500">Total</span>
          <span className="text-title font-bold text-steel-900">{formatPrecio(subtotal)}</span>
        </div>
        {tipoCierre === 'PAGADA' && cambio > 0 && (
          <p className="text-body-sm text-amber-700">Cambio: {formatPrecio(cambio)}</p>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-body-sm">{error}</div>
        )}
      </div>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button onClick={onSubmit} loading={submitting}>
          <Zap className="h-4 w-4 mr-1.5" />
          Guardar venta
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
