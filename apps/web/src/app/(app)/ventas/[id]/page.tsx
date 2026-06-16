'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer, XCircle, ExternalLink, ImageIcon, CheckCircle2, Clock } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import type { NotaVenta, Articulo, ArticulosPage, ConfigColumnasSchema } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn, formatPrecio } from '@/lib/utils';

const ESTATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'paid' | 'credit' | 'pending' | 'cancelled' }> = {
  ABIERTA:   { label: 'Abierta',   variant: 'pending' },
  PENDIENTE: { label: 'Pendiente', variant: 'pending' },
  PAGADA:    { label: 'Pagada',    variant: 'paid' },
  CREDITO:   { label: 'Crédito',   variant: 'credit' },
  CANCELADA: { label: 'Cancelada', variant: 'cancelled' },
};

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
};
const METODOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'] as const;
const METODOS_CON_EVIDENCIA = ['TARJETA', 'TRANSFERENCIA', 'DEPOSITO'];

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function NotaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { usuario } = useAuthStore();
  const { empresa, ubicacion } = useContextoStore();

  const [nota, setNota] = useState<NotaVenta | null>(null);
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<ConfigColumnasSchema | null>(null);

  // Agregar línea (solo ABIERTA)
  const [dlgLinea, setDlgLinea] = useState(false);
  const [artBusqueda, setArtBusqueda] = useState('');
  const [artSugeridos, setArtSugeridos] = useState<Articulo[]>([]);
  const [artSel, setArtSel] = useState<Articulo | null>(null);
  const [lineaCantidad, setLineaCantidad] = useState(1);
  const [lineaPrecio, setLineaPrecio] = useState(0);
  const [lineaDesc, setLineaDesc] = useState(0);
  const [lineaError, setLineaError] = useState<string | null>(null);
  const [addingLinea, setAddingLinea] = useState(false);

  // Cobrar (solo ABIERTA)
  const [dlgCobrar, setDlgCobrar] = useState(false);
  const [pagos, setPagos] = useState<{ metodo: string; monto: number; referencia: string }[]>([
    { metodo: 'EFECTIVO', monto: 0, referencia: '' },
  ]);
  const [cobrandoError, setCobrandoError] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);

  // Cancelar
  const [dlgCancelar, setDlgCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  // Evidencias
  const [dlgEvidencia, setDlgEvidencia] = useState(false);
  const [evDesc, setEvDesc] = useState('');
  const [evUrl, setEvUrl] = useState('');
  const [evBase64, setEvBase64] = useState<string | null>(null);
  const [evFileName, setEvFileName] = useState<string | null>(null);
  const [evError, setEvError] = useState<string | null>(null);
  const [uploadingEv, setUploadingEv] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Lightbox
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Reimprimir
  const [printing, setPrinting] = useState(false);

  const canWrite = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR'].includes(usuario?.rol ?? '');
  const canCancel = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');

  async function load() {
    setLoading(true);
    try {
      const n = await api.get<NotaVenta>(`/ventas/${id}`);
      setNota(n);
    } catch {
      setNota(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (empresa?.id && ubicacion?.id) {
      api.get<ConfigColumnasSchema>(`/config-columnas/${empresa.id}/${ubicacion.id}/schema`)
        .then(setSchema)
        .catch(() => {});
    }
  }, [id, empresa?.id, ubicacion?.id]);

  // ── Líneas ─────────────────────────────────────────────────
  async function buscarArt(val: string) {
    setArtBusqueda(val);
    setArtSel(null);
    if (val.length < 2) { setArtSugeridos([]); return; }
    try {
      const res = await api.get<ArticulosPage>(`/articulos?q=${encodeURIComponent(val)}&limit=8`);
      setArtSugeridos(res.data);
    } catch { setArtSugeridos([]); }
  }

  function selArt(art: Articulo) {
    setArtSel(art);
    setArtSugeridos([]);
    setArtBusqueda(`${art.clave} — ${art.descripcion_1 ?? ''}`);
    const precioDefault = schema?.precios.find((p) => p.activa);
    const campo = precioDefault ? `precio_${precioDefault.numero}` as keyof Articulo : 'precio_1';
    setLineaPrecio((art[campo] as number) ?? 0);
  }

  async function agregarLinea() {
    if (!nota || !artSel) return;
    setLineaError(null);
    setAddingLinea(true);
    try {
      const updated = await api.post<NotaVenta>(`/ventas/${nota.id}/lineas`, {
        articulo_id: artSel.id,
        cantidad: lineaCantidad,
        precio_unitario: lineaPrecio,
        descuento: lineaDesc,
      });
      setNota(updated);
      setDlgLinea(false);
      setArtBusqueda(''); setArtSel(null); setLineaCantidad(1); setLineaPrecio(0); setLineaDesc(0);
    } catch (err) {
      setLineaError(err instanceof Error ? err.message : 'Error al agregar');
    } finally {
      setAddingLinea(false);
    }
  }

  async function eliminarLinea(lineaId: string) {
    if (!nota) return;
    try {
      const updated = await api.delete<NotaVenta>(`/ventas/${nota.id}/lineas/${lineaId}`);
      setNota(updated);
    } catch {}
  }

  // ── Cobrar ─────────────────────────────────────────────────
  function openCobrar() {
    if (!nota) return;
    setPagos([{ metodo: 'EFECTIVO', monto: nota.total, referencia: '' }]);
    setCobrandoError(null);
    setDlgCobrar(true);
  }

  async function onCobrar() {
    if (!nota) return;
    setCobrando(true);
    setCobrandoError(null);
    try {
      await api.post(`/ventas/${nota.id}/cerrar`, {
        pagos: pagos.filter((p) => p.monto > 0).map((p) => ({
          metodo: p.metodo,
          monto: p.monto,
          referencia: p.referencia || undefined,
        })),
      });
      setDlgCobrar(false);
      load();
    } catch (err) {
      setCobrandoError(err instanceof Error ? err.message : 'Error al cobrar');
    } finally {
      setCobrando(false);
    }
  }

  // ── Cancelar ───────────────────────────────────────────────
  async function onCancelar() {
    if (!nota) return;
    setCancelando(true);
    try {
      await api.patch(`/ventas/${nota.id}/cancelar`);
      setDlgCancelar(false);
      load();
    } catch {} finally {
      setCancelando(false);
    }
  }

  // ── Reimprimir ticket ──────────────────────────────────────
  async function printTicketNota() {
    if (!nota) return;
    const tipoCierre = nota.estatus === 'CREDITO' ? 'CREDITO' : 'PAGADA';
    const totalPagadoCalc = nota.pagos.reduce((s, p) => s + p.monto, 0);
    const saldoRestante = Math.max(0, +(nota.total - totalPagadoCalc).toFixed(2));

    const payload = {
      tipo: 'venta',
      copias: 1,
      empresa: { nombre: empresa?.nombre ?? '' },
      ubicacion: {
        nombre: ubicacion?.nombre ?? '',
        razon_social: ubicacion?.razon_social ?? null,
        rfc: ubicacion?.rfc ?? null,
        telefono: ubicacion?.telefono ?? null,
        direccion: null,
      },
      nota: {
        folio: String(nota.folio).padStart(4, '0'),
        fecha: new Date(nota.created_at).toLocaleDateString('es-MX', {
          day: '2-digit', month: 'short', year: 'numeric',
        }),
        cliente: nota.cliente
          ? (nota.cliente.razon_social ?? `${nota.cliente.nombre} ${nota.cliente.apellidos ?? ''}`.trim())
          : null,
      },
      lineas: nota.lineas.map((l) => ({
        clave: l.clave,
        descripcion: [
          l.articulo?.descripcion_1, l.articulo?.descripcion_2,
          l.articulo?.descripcion_3, l.articulo?.descripcion_4, l.articulo?.descripcion_5,
        ].filter((d): d is string => !!d).join(' · ') || null,
        cantidad: l.cantidad,
        precio: l.precio_unitario,
        subtotal: l.subtotal,
      })),
      totales: { subtotal: nota.subtotal, total: nota.total },
      pagos: nota.pagos.map((p) => ({ metodo: METODO_LABEL[p.metodo] ?? p.metodo, monto: p.monto })),
      cambio: 0,
      tipo_cierre: tipoCierre,
      saldo_restante: tipoCierre === 'CREDITO' ? saldoRestante : 0,
    };

    setPrinting(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      await fetch('http://localhost:7788/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch {
      // Bridge no disponible — no bloquear la UI
    } finally {
      setPrinting(false);
    }
  }

  // ── Evidencias ─────────────────────────────────────────────
  function compressImage(file: File): Promise<string> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = url;
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setEvError('Archivo demasiado grande. Máximo 10 MB.');
      return;
    }
    setEvError(null);
    if (file.type.startsWith('image/')) {
      const compressed = await compressImage(file);
      setEvBase64(compressed);
      setEvFileName(file.name.replace(/\.[^.]+$/, '.jpg'));
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setEvBase64(ev.target?.result as string);
        setEvFileName(file.name);
      };
      reader.readAsDataURL(file);
    }
  }

  function closeDlgEvidencia() {
    setDlgEvidencia(false);
    setEvDesc(''); setEvUrl(''); setEvBase64(null); setEvFileName(null); setEvError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  async function onAgregarEvidencia() {
    if (!nota) return;
    setEvError(null);
    if (!evBase64 && !evUrl.trim()) {
      setEvError('Adjunta un archivo o pega una URL.');
      return;
    }
    setUploadingEv(true);
    try {
      const updated = await api.post<NotaVenta>(`/ventas/${nota.id}/evidencias`, {
        descripcion: evDesc || undefined,
        archivo_url: evUrl.trim() || undefined,
        data_base64: evBase64 || undefined,
      });
      setNota(updated);
      closeDlgEvidencia();
    } catch (err) {
      setEvError(err instanceof Error ? err.message : 'Error al guardar evidencia');
    } finally {
      setUploadingEv(false);
    }
  }

  const totalPagos = pagos.reduce((s, p) => s + (p.monto || 0), 0);
  const cambio = nota ? +(totalPagos - nota.total).toFixed(2) : 0;

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl">
        {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-steel-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (!nota) {
    return (
      <div className="p-6">
        <p className="text-body text-steel-500">Nota no encontrada.</p>
        <Button variant="secondary" className="mt-3" onClick={() => router.push('/ventas')}>
          Volver
        </Button>
      </div>
    );
  }

  const cfg = ESTATUS_CONFIG[nota.estatus];
  const esCerrada = ['PAGADA', 'CREDITO'].includes(nota.estatus);

  // Computa saldo y running balance para CREDITO
  const totalPagado = nota.pagos.reduce((s, p) => s + p.monto, 0);
  const saldoPendiente = +(nota.total - totalPagado).toFixed(2);

  // ¿La nota tiene al menos un pago con método elegible para evidencias?
  const puedeAgregarEvidencia = esCerrada && nota.pagos.some((p) => METODOS_CON_EVIDENCIA.includes(p.metodo));

  return (
    <div className="p-6 max-w-3xl">
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Evidencia" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" />
        </div>
      )}

      {/* Back */}
      <button
        onClick={() => router.push('/ventas')}
        className="flex items-center gap-1.5 text-steel-500 hover:text-steel-800 text-body-sm mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Ventas
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Nota de Venta</p>
          <div className="flex items-center gap-3">
            <h1 className="text-display-md font-bold text-steel-900">
              #{String(nota.folio).padStart(4, '0')}
            </h1>
            <Badge variant={cfg?.variant ?? 'outline'}>{cfg?.label}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {nota.estatus === 'ABIERTA' && canWrite && (
            <>
              <Button variant="secondary" onClick={() => setDlgLinea(true)}>
                + Artículo
              </Button>
              {nota.lineas.length > 0 && (
                <Button onClick={openCobrar}>Cobrar</Button>
              )}
            </>
          )}
          {esCerrada && (
            <Button variant="secondary" disabled={printing} onClick={() => void printTicketNota()}>
              <Printer className={`h-4 w-4 mr-1.5 ${printing ? 'animate-pulse' : ''}`} />
              {printing ? 'Imprimiendo…' : 'Reimprimir'}
            </Button>
          )}
          {['ABIERTA', 'PENDIENTE'].includes(nota.estatus) && canCancel && (
            <Button variant="ghost" onClick={() => setDlgCancelar(true)}>
              <XCircle className="h-4 w-4 mr-1.5 text-brand-600" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Banner PAGADA */}
      {nota.estatus === 'PAGADA' && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-body font-semibold text-emerald-800">Venta liquidada</p>
            {nota.cerrada_at && (
              <p className="text-body-sm text-emerald-600">{fmtFecha(nota.cerrada_at)}</p>
            )}
          </div>
        </div>
      )}

      {/* Banner CREDITO */}
      {nota.estatus === 'CREDITO' && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-body font-semibold text-amber-800">Venta a crédito</p>
            <p className="text-body-sm text-amber-600">
              Saldo pendiente:{' '}
              <span className="font-bold">${saldoPendiente > 0 ? saldoPendiente.toFixed(2) : '0.00'}</span>
              {nota.fecha_vencimiento && (
                <> · Vence: {new Date(nota.fecha_vencimiento).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-body-sm text-amber-600">Cobrado</p>
            <p className="text-body font-bold text-amber-800">${totalPagado.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Info cliente / usuario */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-steel-200 rounded-xl p-4">
          <p className="text-eyebrow text-steel-400 tracking-[1.5px] uppercase font-medium text-[10px] mb-2">Cliente</p>
          {nota.cliente ? (
            <>
              <p className="text-body font-semibold text-steel-900">
                {nota.cliente.razon_social ?? `${nota.cliente.nombre} ${nota.cliente.apellidos ?? ''}`.trim()}
              </p>
              {nota.cliente.razon_social && (
                <p className="text-body-sm text-steel-500">{nota.cliente.nombre} {nota.cliente.apellidos}</p>
              )}
            </>
          ) : (
            <p className="text-body text-steel-400 italic">Venta de mostrador</p>
          )}
        </div>
        <div className="bg-white border border-steel-200 rounded-xl p-4">
          <p className="text-eyebrow text-steel-400 tracking-[1.5px] uppercase font-medium text-[10px] mb-2">Vendedor</p>
          <p className="text-body font-semibold text-steel-900">
            {nota.usuario ? `${nota.usuario.nombre} ${nota.usuario.apellidos}` : '—'}
          </p>
          <p className="text-body-sm text-steel-500">{fmtFecha(nota.created_at)}</p>
        </div>
      </div>

      {/* Líneas */}
      <div className="bg-white border border-steel-200 rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
          <p className="text-body font-semibold text-steel-900">Artículos</p>
          <p className="text-body-sm text-steel-500">{nota.lineas.length} línea{nota.lineas.length !== 1 ? 's' : ''}</p>
        </div>
        {nota.lineas.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-body text-steel-400">Sin artículos. Agrega el primero.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-steel-100 bg-steel-50">
                <th className="px-4 py-2 text-left text-eyebrow text-steel-400 tracking-[1px] uppercase font-medium text-[10px]">Artículo</th>
                <th className="px-4 py-2 text-right text-eyebrow text-steel-400 tracking-[1px] uppercase font-medium text-[10px]">Cant.</th>
                <th className="px-4 py-2 text-right text-eyebrow text-steel-400 tracking-[1px] uppercase font-medium text-[10px]">Precio</th>
                <th className="px-4 py-2 text-right text-eyebrow text-steel-400 tracking-[1px] uppercase font-medium text-[10px]">Desc.</th>
                <th className="px-4 py-2 text-right text-eyebrow text-steel-400 tracking-[1px] uppercase font-medium text-[10px]">Subtotal</th>
                {nota.estatus === 'ABIERTA' && canWrite && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {nota.lineas.map((l, i) => (
                <tr key={l.id} className={cn('border-b border-steel-50', i === nota.lineas.length - 1 && 'border-b-0')}>
                  <td className="px-4 py-3">
                    <p className="text-body-sm font-semibold text-steel-900">{l.clave}</p>
                    <p className="text-meta text-steel-500">{l.articulo?.descripcion_1 ?? ''}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-body-sm text-steel-700">{l.cantidad}</td>
                  <td className="px-4 py-3 text-right text-body-sm text-steel-700">{formatPrecio(l.precio_unitario)}</td>
                  <td className="px-4 py-3 text-right text-body-sm text-steel-500">{l.descuento > 0 ? `${l.descuento}%` : '—'}</td>
                  <td className="px-4 py-3 text-right text-body-sm font-semibold text-steel-900">{formatPrecio(l.subtotal)}</td>
                  {nota.estatus === 'ABIERTA' && canWrite && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => eliminarLinea(l.id)}
                        className="text-steel-400 hover:text-brand-600 transition-colors"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="border-t border-steel-200 px-4 py-3 bg-steel-50 flex items-center justify-between">
          <span className="text-body-sm text-steel-500">Total</span>
          <span className="text-display-sm font-bold text-steel-900">{formatPrecio(nota.total)}</span>
        </div>
      </div>

      {/* ── Historial de pagos (PAGADA / CREDITO) ────────────── */}
      {nota.pagos.length > 0 && (
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
            <p className="text-body font-semibold text-steel-900">
              {esCerrada ? 'Historial de pagos' : 'Pagos'}
            </p>
            <p className="text-body-sm text-steel-500">{nota.pagos.length} pago{nota.pagos.length !== 1 ? 's' : ''}</p>
          </div>

          {esCerrada ? (
            /* Timeline de abonos con saldo acumulado */
            <div className="divide-y divide-steel-50">
              {nota.pagos.reduce<{ pago: typeof nota.pagos[0]; acumulado: number }[]>((acc, p) => {
                const prev = acc[acc.length - 1]?.acumulado ?? 0;
                acc.push({ pago: p, acumulado: +(prev + p.monto).toFixed(2) });
                return acc;
              }, []).map(({ pago, acumulado }) => {
                const saldoTras = +(nota.total - acumulado).toFixed(2);
                return (
                  <div key={pago.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 rounded-full bg-steel-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-steel-500">
                        {pago.metodo === 'EFECTIVO' ? '💵' : pago.metodo === 'TARJETA' ? '💳' : pago.metodo === 'TRANSFERENCIA' ? '🏦' : '🏧'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-body-sm font-medium text-steel-900">
                          {METODO_LABEL[pago.metodo]}
                          {pago.referencia && <span className="text-steel-400 font-normal"> — {pago.referencia}</span>}
                        </p>
                        <span className="text-body font-semibold text-steel-900">{formatPrecio(pago.monto)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-meta text-steel-400">{fmtFecha(pago.created_at)}</p>
                        <p className="text-meta text-steel-400">
                          {saldoTras > 0
                            ? <span className="text-amber-600">Saldo: ${saldoTras.toFixed(2)}</span>
                            : <span className="text-emerald-600">Liquidado</span>
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Lista simple para notas abiertas/pendientes */
            <div className="divide-y divide-steel-50">
              {nota.pagos.map((p) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-body-sm font-medium text-steel-900">{METODO_LABEL[p.metodo]}</p>
                    {p.referencia && <p className="text-meta text-steel-400">{p.referencia}</p>}
                  </div>
                  <span className="text-body font-semibold text-steel-900">{formatPrecio(p.monto)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Resumen de totales para CREDITO */}
          {nota.estatus === 'CREDITO' && (
            <div className="border-t border-steel-200 px-4 py-3 bg-steel-50 space-y-1">
              <div className="flex items-center justify-between text-body-sm text-steel-500">
                <span>Total nota</span>
                <span className="font-medium text-steel-700">{formatPrecio(nota.total)}</span>
              </div>
              <div className="flex items-center justify-between text-body-sm text-steel-500">
                <span>Cobrado</span>
                <span className="font-medium text-emerald-700">${totalPagado.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-body font-semibold">
                <span className="text-amber-700">Saldo pendiente</span>
                <span className="text-amber-700">${Math.max(0, saldoPendiente).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Evidencias (PAGADA / CREDITO con pagos elegibles) ── */}
      {esCerrada && (
        <div className="bg-white border border-steel-200 rounded-xl overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-body font-semibold text-steel-900">Evidencias de pago</p>
              {nota.evidencias.length > 0 && (
                <span className="inline-flex items-center justify-center h-5 px-1.5 rounded-full bg-steel-100 text-[10px] font-bold text-steel-600">
                  {nota.evidencias.length}
                </span>
              )}
            </div>
            {puedeAgregarEvidencia && canWrite && (
              <Button variant="secondary" onClick={() => setDlgEvidencia(true)}>
                + Evidencia
              </Button>
            )}
          </div>

          {nota.evidencias.length === 0 ? (
            <div className="px-4 py-8 text-center">
              {puedeAgregarEvidencia ? (
                <div className="space-y-1">
                  <ImageIcon className="h-7 w-7 text-steel-300 mx-auto" />
                  <p className="text-body-sm text-steel-400">Sin evidencias. Agrega el comprobante de pago.</p>
                </div>
              ) : (
                <p className="text-body-sm text-steel-400 italic">
                  No aplica — esta nota fue pagada únicamente en efectivo.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-steel-50">
              {nota.evidencias.map((ev) => (
                <div key={ev.id} className="px-4 py-3 flex items-start gap-3">
                  {/* Thumbnail */}
                  {ev.data_json?.base64 ? (
                    <button
                      type="button"
                      onClick={() => setLightbox(ev.data_json!.base64!)}
                      className="flex-shrink-0 h-16 w-16 rounded-lg overflow-hidden border border-steel-200 bg-steel-50 hover:opacity-80 transition-opacity"
                    >
                      <img src={ev.data_json.base64} alt={ev.descripcion ?? 'Evidencia'} className="h-full w-full object-cover" />
                    </button>
                  ) : ev.archivo_url ? (
                    <a
                      href={ev.archivo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 h-16 w-16 rounded-lg border border-steel-200 bg-steel-50 flex items-center justify-center hover:bg-steel-100 transition-colors"
                    >
                      <ExternalLink className="h-6 w-6 text-steel-400" />
                    </a>
                  ) : (
                    <div className="flex-shrink-0 h-16 w-16 rounded-lg border border-steel-200 bg-steel-50 flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-steel-300" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-steel-900">
                      {ev.descripcion ?? 'Comprobante de pago'}
                    </p>
                    {ev.archivo_url && (
                      <a
                        href={ev.archivo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-meta text-steel-400 hover:text-steel-700 truncate block max-w-xs"
                      >
                        {ev.archivo_url}
                      </a>
                    )}
                    <p className="text-meta text-steel-400 mt-0.5">
                      {ev.subido_por ? `${ev.subido_por.nombre} ${ev.subido_por.apellidos}` : ''}{' '}
                      · {fmtFecha(ev.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Observaciones */}
      {nota.observaciones && (
        <div className="bg-white border border-steel-200 rounded-xl p-4 mb-4">
          <p className="text-eyebrow text-steel-400 tracking-[1.5px] uppercase font-medium text-[10px] mb-1">Observaciones</p>
          <p className="text-body text-steel-700">{nota.observaciones}</p>
        </div>
      )}

      {/* ── Dialog: agregar línea ─────────────────────────── */}
      <Dialog open={dlgLinea} onClose={() => setDlgLinea(false)} title="Agregar artículo" size="md">
        <div className="space-y-4">
          <div className="relative">
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Buscar artículo</label>
            <Input
              placeholder="Clave o nombre…"
              value={artBusqueda}
              onChange={(e) => buscarArt(e.target.value)}
            />
            {artSugeridos.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-steel-200 rounded-xl shadow-lg overflow-hidden">
                {artSugeridos.map((art) => (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => selArt(art)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-steel-50 text-left transition-colors"
                  >
                    <div>
                      <p className="text-body-sm font-semibold text-steel-900">{art.clave}</p>
                      <p className="text-meta text-steel-500">{art.descripcion_1 ?? ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Cantidad</label>
              <Input
                type="number" step="0.001" min="0.001"
                value={lineaCantidad}
                onChange={(e) => setLineaCantidad(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Precio unit.</label>
              <Input
                type="number" step="0.01" min="0"
                value={lineaPrecio}
                onChange={(e) => setLineaPrecio(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Desc. %</label>
              <Input
                type="number" step="0.1" min="0" max="100" placeholder="0"
                value={lineaDesc}
                onChange={(e) => setLineaDesc(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {artSel && (
            <div className="bg-steel-50 rounded-lg px-3 py-2 text-body-sm text-steel-700">
              Subtotal estimado:{' '}
              <span className="font-semibold">
                {formatPrecio(lineaCantidad * lineaPrecio * (1 - lineaDesc / 100))}
              </span>
            </div>
          )}

          {lineaError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{lineaError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDlgLinea(false)}>Cancelar</Button>
            <Button type="button" loading={addingLinea} disabled={!artSel} onClick={agregarLinea}>
              Agregar
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      {/* ── Dialog: cobrar ────────────────────────────────── */}
      <Dialog open={dlgCobrar} onClose={() => setDlgCobrar(false)} title="Cobrar nota" size="md">
        {nota && (
          <div className="space-y-4">
            <div className="bg-steel-50 rounded-xl p-4 flex items-center justify-between">
              <span className="text-body font-semibold text-steel-900">Total</span>
              <span className="text-display-sm font-bold text-steel-900">{formatPrecio(nota.total)}</span>
            </div>

            <div className="space-y-3">
              {pagos.map((pago, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    {i === 0 && <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Método</label>}
                    <select
                      className="flex h-9 w-full rounded-md border border-steel-300 bg-white px-3 py-1 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      value={pago.metodo}
                      onChange={(e) => { const n = [...pagos]; n[i] = { ...n[i], metodo: e.target.value }; setPagos(n); }}
                    >
                      {METODOS.map((m) => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
                    </select>
                  </div>
                  <div className="w-32">
                    {i === 0 && <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Monto</label>}
                    <Input
                      type="number" step="0.01" min="0"
                      value={pago.monto}
                      onChange={(e) => { const n = [...pagos]; n[i] = { ...n[i], monto: parseFloat(e.target.value) || 0 }; setPagos(n); }}
                    />
                  </div>
                  {pago.metodo !== 'EFECTIVO' && (
                    <div className="flex-1">
                      {i === 0 && <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Ref.</label>}
                      <Input
                        placeholder="Referencia…"
                        value={pago.referencia}
                        onChange={(e) => { const n = [...pagos]; n[i] = { ...n[i], referencia: e.target.value }; setPagos(n); }}
                      />
                    </div>
                  )}
                  {pagos.length > 1 && (
                    <button type="button" onClick={() => setPagos(pagos.filter((_, idx) => idx !== i))} className="h-9 px-2 text-steel-400 hover:text-brand-600">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setPagos([...pagos, { metodo: 'EFECTIVO', monto: 0, referencia: '' }])} className="text-body-sm text-steel-500 hover:text-steel-800 transition-colors">
                + Forma de pago
              </button>
            </div>

            <div className="border-t border-steel-100 pt-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-body-sm text-steel-500">Total pagado</span>
                <span className={cn('text-body font-semibold', totalPagos >= nota.total ? 'text-steel-900' : 'text-brand-600')}>
                  {formatPrecio(totalPagos)}
                </span>
              </div>
              {cambio > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-body-sm text-steel-500">Cambio</span>
                  <span className="text-body font-semibold text-steel-900">${cambio.toFixed(2)}</span>
                </div>
              )}
            </div>

            {cobrandoError && (
              <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
                <p className="text-body-sm text-brand-600">{cobrandoError}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDlgCobrar(false)}>Cancelar</Button>
              <Button type="button" loading={cobrando} disabled={totalPagos < nota.total} onClick={onCobrar}>
                Confirmar cobro
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>

      {/* ── Dialog: cancelar ─────────────────────────────── */}
      <Dialog open={dlgCancelar} onClose={() => setDlgCancelar(false)} title="¿Cancelar nota?" size="sm">
        <p className="text-body text-steel-600 mb-4">
          Esta acción cancela la nota #{String(nota.folio).padStart(4, '0')} y no puede deshacerse.
        </p>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setDlgCancelar(false)}>No, mantener</Button>
          <Button type="button" variant="destructive" loading={cancelando} onClick={onCancelar}>
            Sí, cancelar
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Dialog: agregar evidencia ─────────────────────── */}
      <Dialog open={dlgEvidencia} onClose={closeDlgEvidencia} title="Agregar evidencia de pago" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Descripción (opcional)</label>
            <Input
              placeholder="Ej: Comprobante transferencia BBVA #5432…"
              value={evDesc}
              onChange={(e) => setEvDesc(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Imagen o archivo <span className="text-steel-400 font-normal">(JPG, PNG, PDF)</span>
            </label>

            {/* Inputs ocultos */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            {/* capture="environment" = cámara trasera en móvil */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Botones de selección */}
            {!evBase64 ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 h-20 border-2 border-dashed border-steel-300 rounded-xl text-body-sm text-steel-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                >
                  <span className="text-xl">📎</span>
                  <span>Galería / Archivo</span>
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 h-20 border-2 border-dashed border-steel-300 rounded-xl text-body-sm text-steel-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                >
                  <span className="text-xl">📷</span>
                  <span>Tomar foto</span>
                </button>
              </div>
            ) : (
              <div className="relative">
                {evBase64.startsWith('data:image') ? (
                  <div className="relative rounded-xl overflow-hidden border border-steel-200 bg-steel-50">
                    <img src={evBase64} alt="preview" className="w-full max-h-48 object-contain" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-3 py-1.5 flex items-center justify-between">
                      <p className="text-meta text-white truncate">{evFileName}</p>
                      <button
                        type="button"
                        onClick={() => { setEvBase64(null); setEvFileName(null); if (fileInputRef.current) fileInputRef.current.value = ''; if (cameraInputRef.current) cameraInputRef.current.value = ''; }}
                        className="text-white/80 hover:text-white text-xs ml-2 flex-shrink-0"
                      >
                        ✕ Quitar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 border border-steel-200 rounded-xl bg-steel-50">
                    <span className="text-2xl">📄</span>
                    <p className="text-body-sm text-steel-700 flex-1 truncate">{evFileName}</p>
                    <button
                      type="button"
                      onClick={() => { setEvBase64(null); setEvFileName(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="text-steel-400 hover:text-brand-600 text-xs"
                    >
                      ✕ Quitar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              O pega un URL <span className="text-steel-400 font-normal">(Google Drive, Dropbox, etc.)</span>
            </label>
            <Input
              placeholder="https://…"
              value={evUrl}
              onChange={(e) => setEvUrl(e.target.value)}
            />
          </div>

          {evError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{evError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={closeDlgEvidencia}>Cancelar</Button>
            <Button
              type="button"
              loading={uploadingEv}
              disabled={!evBase64 && !evUrl.trim()}
              onClick={onAgregarEvidencia}
            >
              Guardar evidencia
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
