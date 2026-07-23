'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, ChevronLeft, ChevronRight, FileText, XCircle, ArrowLeft, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import type {
  NotasCotizacionPage, NotaCotizacion, Cliente, Articulo, ArticulosPage, ConfigColumnasSchema,
} from '@/lib/types/api';
import { MOTIVOS_CANCELACION } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn, formatPrecio, precioMostradorNumero } from '@/lib/utils';
import { generateCotizacionPDF } from '@/lib/utils/cotizacion-pdf';
import { buildWhatsAppClientLink } from '@/lib/utils/whatsapp';

const ESTATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'paid' | 'pending' | 'incomplete' | 'cancelled' }> = {
  ACTIVA:     { label: 'Activa',     variant: 'pending' },
  CONVERTIDA: { label: 'Convertida', variant: 'paid' },
  CANCELADA:  { label: 'Cancelada',  variant: 'cancelled' },
  VENCIDA:    { label: 'Vencida',    variant: 'incomplete' },
};

const NuevaCotizacionSchema = z.object({
  cliente_id: z.string().optional(),
  observaciones: z.string().optional(),
});
type NuevaCotizacionForm = z.infer<typeof NuevaCotizacionSchema>;

export default function CotizacionesPage() {
  const router = useRouter();
  const toast = useToast();
  const { usuario } = useAuthStore();
  const { empresa, ubicacion } = useContextoStore();

  const canWrite = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR'].includes(usuario?.rol ?? '');

  const [notas, setNotas] = useState<NotaCotizacion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qServer, setQServer] = useState('');
  const [estatusFiltro, setEstatusFiltro] = useState('');

  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [detalleNota, setDetalleNota] = useState<NotaCotizacion | null>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  // Dialog nueva cotización
  const [dlgNota, setDlgNota] = useState(false);
  const [clienteResultados, setClienteResultados] = useState<Cliente[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [clienteQ, setClienteQ] = useState('');
  const [creatingNota, setCreatingNota] = useState(false);
  const [notaError, setNotaError] = useState<string | null>(null);

  // Carrito / edición de líneas
  const [notaActiva, setNotaActiva] = useState<NotaCotizacion | null>(null);
  const [dlgLinea, setDlgLinea] = useState(false);
  const [schema, setSchema] = useState<ConfigColumnasSchema | null>(null);
  const [artQ, setArtQ] = useState('');
  const [artResultados, setArtResultados] = useState<Articulo[]>([]);
  const [addingArt, setAddingArt] = useState<string | null>(null);
  const [lineaDraft, setLineaDraft] = useState<Record<string, { cantidad: string; precio: string }>>({});
  const [savingLinea, setSavingLinea] = useState<string | null>(null);

  // Dialog cancelar
  const [dlgCancelar, setDlgCancelar] = useState(false);
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [comentarioCancelar, setComentarioCancelar] = useState('');
  const [cancelarError, setCancelarError] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const [convirtiendo, setConvirtiendo] = useState(false);

  // Dialog enviar por correo
  const [dlgEmail, setDlgEmail] = useState(false);
  const [emailDest, setEmailDest] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailOk, setEmailOk] = useState(false);

  const artDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clienteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Leer cliente_id de la URL al montar (llegada desde Clientes) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clienteIdParam = params.get('cliente_id');
    if (clienteIdParam) {
      window.history.replaceState({}, '', window.location.pathname);
      void openDlgNota(clienteIdParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNotas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (estatusFiltro) params.set('estatus', estatusFiltro);
      if (qServer) params.set('q', qServer);
      const res = await api.get<NotasCotizacionPage>(`/cotizaciones?${params}`);
      setNotas(res.data);
      setTotal(res.total);
      setPages(res.pages);
    } catch {
      setNotas([]);
    } finally {
      setLoading(false);
    }
  }, [page, estatusFiltro, qServer]);

  useEffect(() => { loadNotas(); }, [loadNotas]);

  useEffect(() => {
    const t = setTimeout(() => setQServer(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { setPage(1); }, [qServer]);

  useEffect(() => {
    if (!notaActiva) { setLineaDraft({}); return; }
    setLineaDraft(() => {
      const d: Record<string, { cantidad: string; precio: string }> = {};
      for (const l of notaActiva.lineas) d[l.id] = { cantidad: String(l.cantidad), precio: String(l.precio_unitario) };
      return d;
    });
  }, [notaActiva]);

  useEffect(() => {
    if (!empresa?.id || !ubicacion?.id) return;
    api.get<ConfigColumnasSchema>(`/config-columnas/${empresa.id}/${ubicacion.id}/schema`)
      .then(setSchema)
      .catch(() => {});
  }, [empresa?.id, ubicacion?.id]);

  // Debounce búsqueda de artículos dentro del carrito
  useEffect(() => {
    if (!dlgLinea) return;
    if (artDebounceRef.current) clearTimeout(artDebounceRef.current);
    if (!artQ.trim()) { setArtResultados([]); return; }
    artDebounceRef.current = setTimeout(() => {
      api.get<ArticulosPage>(`/articulos?q=${encodeURIComponent(artQ)}&limit=15`)
        .then((r) => setArtResultados(r.data))
        .catch(() => setArtResultados([]));
    }, 350);
    return () => { if (artDebounceRef.current) clearTimeout(artDebounceRef.current); };
  }, [artQ, dlgLinea]);

  // Debounce búsqueda de cliente (contra backend, no lista local limitada)
  useEffect(() => {
    if (!dlgNota || clienteSeleccionado || clienteQ.trim().length === 0) {
      setClienteResultados([]);
      return;
    }
    if (clienteDebounceRef.current) clearTimeout(clienteDebounceRef.current);
    clienteDebounceRef.current = setTimeout(() => {
      api.get<Cliente[]>(`/clientes?q=${encodeURIComponent(clienteQ)}`)
        .then(setClienteResultados)
        .catch(() => setClienteResultados([]));
    }, 300);
    return () => { if (clienteDebounceRef.current) clearTimeout(clienteDebounceRef.current); };
  }, [clienteQ, dlgNota, clienteSeleccionado]);

  async function fetchCliente(id: string): Promise<Cliente | null> {
    try {
      return await api.get<Cliente>(`/clientes/${id}`);
    } catch {
      return null;
    }
  }

  async function seleccionarIdx(idx: number) {
    if (idx < 0 || idx >= notas.length) return;
    setSelectedIdx(idx);
    try {
      const d = await api.get<NotaCotizacion>(`/cotizaciones/${notas[idx].id}`);
      setDetalleNota(d);
    } catch {
      setDetalleNota(null);
    }
  }

  function patchNota(actualizada: NotaCotizacion) {
    setNotas((prev) => prev.map((n) => (n.id === actualizada.id ? actualizada : n)));
    setDetalleNota((prev) => (prev?.id === actualizada.id ? actualizada : prev));
  }

  // ── Form nueva cotización ──────────────────────────────────
  const notaForm = useForm<NuevaCotizacionForm>({ resolver: zodResolver(NuevaCotizacionSchema) });

  async function openDlgNota(preClienteId?: string) {
    setNotaError(null);
    notaForm.reset({});
    setClienteResultados([]);
    if (preClienteId) {
      notaForm.setValue('cliente_id', preClienteId);
      const c = await fetchCliente(preClienteId);
      setClienteSeleccionado(c);
      setClienteQ(c ? (c.razon_social ?? `${c.nombre} ${c.apellidos ?? ''}`.trim()) : '');
    } else {
      setClienteSeleccionado(null);
      setClienteQ('');
    }
    setDlgNota(true);
  }

  async function onCrearNota(data: NuevaCotizacionForm) {
    setCreatingNota(true);
    setNotaError(null);
    try {
      const nota = await api.post<NotaCotizacion>('/cotizaciones', {
        cliente_id: data.cliente_id || undefined,
        observaciones: data.observaciones || undefined,
        lineas: [],
      });
      setDlgNota(false);
      setNotaActiva(nota);
      setArtQ('');
      setArtResultados([]);
      setDlgLinea(true);
      loadNotas();
    } catch (err) {
      setNotaError(err instanceof Error ? err.message : 'Error al crear');
    } finally {
      setCreatingNota(false);
    }
  }

  async function openEditar(nota: NotaCotizacion) {
    try {
      const full = await api.get<NotaCotizacion>(`/cotizaciones/${nota.id}`);
      const c = full.cliente_id ? await fetchCliente(full.cliente_id) : null;
      setClienteSeleccionado(c);
      setNotaActiva(full);
      setArtQ('');
      setArtResultados([]);
      setDlgLinea(true);
    } catch {
      toast('Error al abrir la cotización', 'error');
    }
  }

  // ── Líneas ─────────────────────────────────────────────────
  async function agregarArticulo(art: Articulo) {
    if (!notaActiva || addingArt) return;
    setAddingArt(art.id);
    try {
      const existente = notaActiva.lineas.find((l) => l.articulo?.id === art.id);
      if (existente) {
        const updated = await api.patch<NotaCotizacion>(`/cotizaciones/${notaActiva.id}/lineas/${existente.id}`, {
          cantidad: existente.cantidad + 1,
          precio_unitario: existente.precio_unitario,
        });
        setNotaActiva(updated);
      } else {
        const precioNum = clienteSeleccionado?.precio_num ?? precioMostradorNumero(schema);
        const campo = `precio_${precioNum}` as keyof Articulo;
        const precio = (art[campo] as number | null) ?? 0;
        const updated = await api.post<NotaCotizacion>(`/cotizaciones/${notaActiva.id}/lineas`, {
          articulo_id: art.id,
          cantidad: 1,
          precio_unitario: precio,
          descuento: 0,
        });
        setNotaActiva(updated);
      }
      setArtQ('');
      setArtResultados([]);
    } catch {
      // silent
    } finally {
      setAddingArt(null);
    }
  }

  async function updateLineaInline(lineaId: string) {
    if (!notaActiva) return;
    const draft = lineaDraft[lineaId];
    if (!draft) return;
    const cantidad = parseFloat(draft.cantidad);
    const precio = parseFloat(draft.precio);
    if (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(precio) || precio < 0) return;
    setSavingLinea(lineaId);
    try {
      const updated = await api.patch<NotaCotizacion>(`/cotizaciones/${notaActiva.id}/lineas/${lineaId}`, {
        cantidad, precio_unitario: precio,
      });
      setNotaActiva(updated);
    } catch {
      // silent
    } finally {
      setSavingLinea(null);
    }
  }

  async function eliminarLinea(lineaId: string) {
    if (!notaActiva || savingLinea === lineaId) return;
    setSavingLinea(lineaId);
    try {
      const updated = await api.delete<NotaCotizacion>(`/cotizaciones/${notaActiva.id}/lineas/${lineaId}`);
      setNotaActiva(updated);
    } catch {
      // silent
    } finally {
      setSavingLinea(null);
    }
  }

  // ── Cancelar ───────────────────────────────────────────────
  function openCancelar(nota: NotaCotizacion) {
    setNotaActiva(nota);
    setMotivoCancelar('');
    setComentarioCancelar('');
    setCancelarError(null);
    setDlgCancelar(true);
  }

  async function onCancelar() {
    if (!notaActiva) return;
    if (!motivoCancelar) { setCancelarError('Selecciona un motivo'); return; }
    if (motivoCancelar === 'OTRO' && !comentarioCancelar.trim()) {
      setCancelarError('Especifica el comentario para el motivo "Otro"');
      return;
    }
    setCancelando(true);
    setCancelarError(null);
    try {
      const actualizada = await api.patch<NotaCotizacion>(`/cotizaciones/${notaActiva.id}/cancelar`, {
        motivo: motivoCancelar,
        comentario: comentarioCancelar.trim() || undefined,
      });
      setDlgCancelar(false);
      setDlgLinea(false);
      patchNota(actualizada);
      loadNotas();
    } catch (err) {
      setCancelarError(err instanceof Error ? err.message : 'Error al cancelar');
    } finally {
      setCancelando(false);
    }
  }

  // ── Convertir a venta ──────────────────────────────────────
  async function onConvertir(nota: NotaCotizacion) {
    if (convirtiendo) return;
    setConvirtiendo(true);
    try {
      const venta = await api.patch<{ id: string }>(`/cotizaciones/${nota.id}/convertir`, {});
      toast('Cotización convertida a venta', 'success');
      router.push(`/ventas/${venta.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al convertir', 'error');
    } finally {
      setConvirtiendo(false);
    }
  }

  // ── WhatsApp / PDF / Email ─────────────────────────────────
  function enviarWhatsApp(nota: NotaCotizacion) {
    const nombreCliente = nota.cliente
      ? (nota.cliente.razon_social ?? `${nota.cliente.nombre} ${nota.cliente.apellidos ?? ''}`.trim())
      : '';
    const mensaje = `Hola ${nombreCliente}, aquí tu cotización #${String(nota.folio).padStart(4, '0')}`;
    const link = buildWhatsAppClientLink(nota.cliente?.telefono, mensaje);
    if (!link) return;
    void generateCotizacionPDF(nota, empresa, ubicacion);
    window.open(link, '_blank');
  }

  function openDlgEmail(nota: NotaCotizacion) {
    setEmailDest(nota.cliente?.email ?? '');
    setEmailError(null);
    setEmailOk(false);
    setDlgEmail(true);
  }

  async function sendEmailCotizacion(nota: NotaCotizacion) {
    setSendingEmail(true);
    setEmailError(null);
    setEmailOk(false);
    try {
      await api.post(`/cotizaciones/${nota.id}/send-email`, { to: emailDest });
      setEmailOk(true);
      setTimeout(() => { setDlgEmail(false); setEmailOk(false); }, 1800);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setSendingEmail(false);
    }
  }

  const vigenciaVencida = (nota: NotaCotizacion) => new Date(nota.vigencia_hasta).getTime() < Date.now();

  // ── Carrito: acciones de una cotización ACTIVA ────────────
  function AccionesCotizacion({ nota, size = 'sm' }: { nota: NotaCotizacion; size?: 'sm' | 'md' }) {
    if (nota.estatus === 'CONVERTIDA') {
      return (
        <Button variant="secondary" size={size} onClick={() => router.push(`/ventas/${nota.venta_id}`)}>
          Ver venta
        </Button>
      );
    }
    if (nota.estatus !== 'ACTIVA') return null;
    return (
      <>
        {nota.lineas.length > 0 && (
          <>
            <Button variant="secondary" size={size} onClick={() => generateCotizacionPDF(nota, empresa, ubicacion)}>
              PDF
            </Button>
            <Button
              variant="secondary"
              size={size}
              disabled={!nota.cliente?.telefono}
              title={!nota.cliente?.telefono ? 'Cliente sin número registrado' : undefined}
              onClick={() => enviarWhatsApp(nota)}
            >
              WhatsApp
            </Button>
            <Button variant="secondary" size={size} onClick={() => openDlgEmail(nota)}>
              Enviar
            </Button>
            <Button size={size} disabled={convirtiendo} loading={convirtiendo} onClick={() => void onConvertir(nota)}>
              Convertir a venta
            </Button>
          </>
        )}
        {canWrite && (
          <Button variant="ghost" size={size} onClick={() => openCancelar(nota)}>
            <XCircle className="h-4 w-4 mr-1.5 text-brand-600" />
            Cancelar
          </Button>
        )}
      </>
    );
  }

  return (
    <div>
      {/* ── Split-view: editar líneas de la cotización ────── */}
      {dlgLinea && notaActiva && (
        <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden bg-white">
          <div className="px-4 py-3 bg-white border-b border-steel-200 flex items-center justify-between flex-shrink-0 gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => { setDlgLinea(false); setNotaActiva(null); void loadNotas(); if (detalleNota) void seleccionarIdx(selectedIdx); }}
                className="flex items-center gap-1 text-body-sm text-steel-500 hover:text-steel-900 transition-colors flex-shrink-0"
              >
                <ChevronLeft className="h-4 w-4" />
                Volver
              </button>
              <div className="h-4 w-px bg-steel-200 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-body font-semibold text-steel-900">
                  Cotización #{String(notaActiva.folio).padStart(4, '0')}
                </span>
                <Badge variant={ESTATUS_CONFIG[notaActiva.estatus]?.variant ?? 'default'} className="ml-2">
                  {ESTATUS_CONFIG[notaActiva.estatus]?.label}
                </Badge>
                {notaActiva.cliente && (
                  <span className="ml-2 text-body-sm text-steel-400 truncate">
                    · {notaActiva.cliente.razon_social ?? `${notaActiva.cliente.nombre} ${notaActiva.cliente.apellidos ?? ''}`.trim()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <AccionesCotizacion nota={notaActiva} />
            </div>
          </div>

          <div className="flex flex-col md:flex-row flex-1 min-h-0">
            {notaActiva.estatus === 'ACTIVA' && (
              <div className="md:w-[40%] border-b md:border-b-0 md:border-r border-steel-200 flex flex-col min-h-0">
                <div className="p-3 border-b border-steel-100 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
                    <input
                      autoFocus
                      className="h-9 w-full rounded-md border border-steel-300 bg-white pl-8 pr-3 text-body-sm text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                      placeholder="Buscar artículo por clave o descripción…"
                      value={artQ}
                      onChange={(e) => setArtQ(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-steel-100">
                  {artResultados.map((art) => {
                    const desc = [art.descripcion_1, art.descripcion_2, art.descripcion_3, art.descripcion_4, art.descripcion_5]
                      .filter(Boolean).join(' · ');
                    return (
                      <button
                        key={art.id}
                        type="button"
                        disabled={addingArt === art.id}
                        onClick={() => void agregarArticulo(art)}
                        className="w-full text-left px-3 py-2.5 hover:bg-steel-50 flex items-center justify-between gap-2 disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block text-body-sm font-medium text-steel-900 truncate">{desc || art.clave}</span>
                          <span className="block text-meta text-steel-400">{art.clave}</span>
                        </span>
                        <Plus className="h-4 w-4 text-steel-400 flex-shrink-0" />
                      </button>
                    );
                  })}
                  {artQ.trim() && artResultados.length === 0 && (
                    <p className="text-body-sm text-steel-400 text-center py-6">Sin resultados</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto">
                {notaActiva.lineas.length === 0 ? (
                  <div className="flex items-center justify-center h-full p-6">
                    <EmptyState icon={<FileText className="h-8 w-8" />} title="Sin artículos" description="Busca y agrega artículos a la cotización." />
                  </div>
                ) : (
                  <table className="w-full text-body-sm">
                    <thead className="sticky top-0 bg-steel-50 border-b border-steel-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Artículo</th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Cant.</th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Precio</th>
                        <th className="px-4 py-2 text-right text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Sub</th>
                        {notaActiva.estatus === 'ACTIVA' && <th className="px-2 py-2" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {notaActiva.lineas.map((l) => {
                        const desc = [l.articulo?.descripcion_1, l.articulo?.descripcion_2, l.articulo?.descripcion_3, l.articulo?.descripcion_4, l.articulo?.descripcion_5]
                          .filter(Boolean).join(' · ');
                        const draft = lineaDraft[l.id] ?? { cantidad: String(l.cantidad), precio: String(l.precio_unitario) };
                        const cantDraft = parseFloat(draft.cantidad);
                        const precioDraft = parseFloat(draft.precio);
                        const subtotalPreview = Number.isFinite(cantDraft) && Number.isFinite(precioDraft)
                          ? cantDraft * precioDraft * (1 - (l.descuento ?? 0) / 100)
                          : l.subtotal;
                        return (
                          <tr key={l.id}>
                            <td className="px-4 py-2.5 max-w-[220px]">
                              <p className="text-steel-900 truncate">{desc || l.clave}</p>
                              <p className="text-meta text-steel-400">{l.clave}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {notaActiva.estatus === 'ACTIVA' ? (
                                <input
                                  className="w-16 text-right rounded border border-steel-200 px-1.5 py-1 text-body-sm"
                                  value={draft.cantidad}
                                  onChange={(e) => setLineaDraft((prev) => ({ ...prev, [l.id]: { ...draft, cantidad: e.target.value } }))}
                                  onBlur={() => void updateLineaInline(l.id)}
                                  disabled={savingLinea === l.id}
                                />
                              ) : Number(l.cantidad).toLocaleString('es-MX')}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {notaActiva.estatus === 'ACTIVA' ? (
                                <input
                                  className="w-24 text-right rounded border border-steel-200 px-1.5 py-1 text-body-sm"
                                  value={draft.precio}
                                  onChange={(e) => setLineaDraft((prev) => ({ ...prev, [l.id]: { ...draft, precio: e.target.value } }))}
                                  onBlur={() => void updateLineaInline(l.id)}
                                  disabled={savingLinea === l.id}
                                />
                              ) : formatPrecio(l.precio_unitario)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-steel-900 whitespace-nowrap">
                              {formatPrecio(subtotalPreview)}
                            </td>
                            {notaActiva.estatus === 'ACTIVA' && (
                              <td className="px-2 py-2.5 text-right">
                                <button
                                  onClick={() => void eliminarLinea(l.id)}
                                  disabled={savingLinea === l.id}
                                  className="text-steel-400 hover:text-brand-600 disabled:opacity-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="border-t border-steel-200 bg-steel-50 flex-shrink-0 px-4 py-3 flex items-center justify-between">
                <span className="text-body-sm text-steel-500">
                  Vigente hasta {new Date(notaActiva.vigencia_hasta).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                  {vigenciaVencida(notaActiva) && notaActiva.estatus === 'ACTIVA' && (
                    <span className="ml-2 text-brand-600 font-medium">(vencida)</span>
                  )}
                </span>
                <span className="text-display-sm font-bold text-steel-900">{formatPrecio(notaActiva.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Lista + detalle ────────────────────────────────── */}
      {!(dlgLinea && notaActiva) && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-steel-200 bg-white flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/ventas')}
                className="flex items-center gap-1 text-body-sm text-steel-500 hover:text-steel-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Ventas
              </button>
              <div className="h-4 w-px bg-steel-200" />
              <div>
                <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Ventas</p>
                <h1 className="text-display-md font-bold text-steel-900">Cotizaciones</h1>
              </div>
            </div>
            {canWrite && (
              <Button onClick={() => void openDlgNota()}>
                <Plus className="h-4 w-4 mr-1.5" />
                Nueva cotización
              </Button>
            )}
          </div>

          <div className="flex flex-col md:flex-row flex-1 min-h-0">
            {/* Izquierda: lista */}
            <div className="flex flex-col md:w-[50%] min-h-0 border-b md:border-b-0 md:border-r border-steel-200 h-[50%] md:h-auto">
              <div className="px-4 py-2.5 bg-steel-50 border-b border-steel-100 flex-shrink-0 space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
                  <input
                    className="h-8 w-full rounded-md border border-steel-300 bg-white pl-8 pr-3 text-body-sm text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                    placeholder="Folio o cliente…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {(['', 'ACTIVA', 'CONVERTIDA', 'CANCELADA', 'VENCIDA'] as const).map((est) => (
                    <button
                      key={est}
                      onClick={() => { setEstatusFiltro(est); setPage(1); setSelectedIdx(-1); setDetalleNota(null); }}
                      className={cn(
                        'px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors',
                        estatusFiltro === est ? 'bg-steel-900 text-white' : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50',
                      )}
                    >
                      {est === '' ? 'Todas' : ESTATUS_CONFIG[est]?.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-white">
                {loading ? (
                  <div className="p-4 space-y-2">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="h-10 bg-steel-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : notas.length === 0 ? (
                  <div className="flex items-center justify-center h-full p-4">
                    <EmptyState
                      icon={<FileText className="h-8 w-8" />}
                      title="Sin cotizaciones"
                      description="Crea la primera cotización para comenzar."
                      action={canWrite ? { label: 'Nueva cotización', onClick: () => void openDlgNota() } : undefined}
                    />
                  </div>
                ) : (
                  <table className="w-full text-body-sm">
                    <thead className="sticky top-0 bg-steel-50 border-b border-steel-200 z-10">
                      <tr>
                        <th className="px-4 py-2 text-left text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Folio</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Cliente</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Estatus</th>
                        <th className="px-4 py-2 text-right text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {notas.map((nota, i) => {
                        const cfg = ESTATUS_CONFIG[nota.estatus];
                        return (
                          <tr
                            key={nota.id}
                            ref={(el) => { rowRefs.current[i] = el; }}
                            onClick={() => void seleccionarIdx(i)}
                            onDoubleClick={() => {
                              if (nota.estatus === 'ACTIVA') void openEditar(nota);
                            }}
                            className={cn(
                              'cursor-pointer transition-colors',
                              selectedIdx === i ? 'bg-brand-50 border-l-2 border-l-brand-600' : 'hover:bg-steel-50',
                            )}
                          >
                            <td className="px-4 py-2.5">
                              <span className="font-bold text-steel-900">#{String(nota.folio).padStart(4, '0')}</span>
                            </td>
                            <td className="px-3 py-2.5 max-w-[120px]">
                              <p className="text-steel-900 truncate">
                                {nota.cliente
                                  ? nota.cliente.razon_social ?? `${nota.cliente.nombre} ${nota.cliente.apellidos ?? ''}`.trim()
                                  : <span className="text-steel-400 italic">Mostrador</span>}
                              </p>
                              <p className="text-meta text-steel-400">
                                {new Date(nota.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                              </p>
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge variant={cfg?.variant ?? 'default'}>{cfg?.label}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="font-semibold text-steel-900">{formatPrecio(nota.total)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex items-center justify-between px-4 py-2 bg-white border-t border-steel-100 flex-shrink-0">
                <p className="text-body-sm text-steel-500">{total} cotizaciones · {page}/{pages}</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setPage((p) => Math.max(1, p - 1)); setSelectedIdx(-1); setDetalleNota(null); }}
                    disabled={page === 1}
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-steel-200 text-steel-600 hover:bg-steel-50 disabled:opacity-40 disabled:pointer-events-none"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setPage((p) => Math.min(pages, p + 1)); setSelectedIdx(-1); setDetalleNota(null); }}
                    disabled={page === pages}
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-steel-200 text-steel-600 hover:bg-steel-50 disabled:opacity-40 disabled:pointer-events-none"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Derecha: detalle */}
            <div className="flex-1 min-h-0 overflow-y-auto bg-steel-50/30">
              {!detalleNota ? (
                <div className="flex items-center justify-center h-full p-6">
                  <EmptyState icon={<FileText className="h-8 w-8" />} title="Selecciona una cotización" description="Haz clic en una fila para ver el detalle." />
                </div>
              ) : (
                <div className="p-4 md:p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-display-sm font-bold text-steel-900">
                        Cotización #{String(detalleNota.folio).padStart(4, '0')}
                      </h2>
                      <p className="text-body-sm text-steel-500 mt-0.5">
                        {detalleNota.cliente
                          ? detalleNota.cliente.razon_social ?? `${detalleNota.cliente.nombre} ${detalleNota.cliente.apellidos ?? ''}`.trim()
                          : 'Mostrador'}
                      </p>
                    </div>
                    <Badge variant={ESTATUS_CONFIG[detalleNota.estatus]?.variant ?? 'default'}>
                      {ESTATUS_CONFIG[detalleNota.estatus]?.label}
                    </Badge>
                  </div>

                  <p className="text-body-sm text-steel-500">
                    Vigente hasta {new Date(detalleNota.vigencia_hasta).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>

                  {detalleNota.observaciones && (
                    <div className="bg-white border border-steel-200 rounded-lg px-3 py-2">
                      <p className="text-body-sm text-steel-600">{detalleNota.observaciones}</p>
                    </div>
                  )}

                  {detalleNota.lineas.length > 0 && (
                    <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
                      <table className="w-full text-body-sm">
                        <thead className="bg-steel-50 border-b border-steel-200">
                          <tr>
                            <th className="px-4 py-2 text-left text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Artículo</th>
                            <th className="px-3 py-2 text-right text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Cant.</th>
                            <th className="px-3 py-2 text-right text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Precio</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-steel-500 uppercase tracking-[1.5px]">Sub</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {detalleNota.lineas.map((l) => {
                            const desc = [l.articulo?.descripcion_1, l.articulo?.descripcion_2, l.articulo?.descripcion_3, l.articulo?.descripcion_4, l.articulo?.descripcion_5]
                              .filter(Boolean).join(' · ');
                            return (
                              <tr key={l.id}>
                                <td className="px-4 py-2.5">{desc || l.clave}</td>
                                <td className="px-3 py-2.5 text-right text-steel-700">{Number(l.cantidad).toLocaleString('es-MX')}</td>
                                <td className="px-3 py-2.5 text-right text-steel-700">{formatPrecio(l.precio_unitario)}</td>
                                <td className="px-4 py-2.5 text-right font-semibold text-steel-900">{formatPrecio(l.subtotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t-2 border-steel-200 bg-steel-50">
                          <tr>
                            <td colSpan={3} className="px-4 py-2.5 text-right font-semibold text-steel-900">Total</td>
                            <td className="px-4 py-2.5 text-right font-bold text-steel-900">{formatPrecio(detalleNota.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {detalleNota.estatus === 'ACTIVA' && canWrite && (
                      <Button variant="secondary" size="sm" onClick={() => void openEditar(detalleNota)}>
                        Agregar artículos
                      </Button>
                    )}
                    <AccionesCotizacion nota={detalleNota} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: crear cotización ───────────────────────── */}
      <Dialog open={dlgNota} onClose={() => setDlgNota(false)} title="Nueva cotización" size="sm">
        <form onSubmit={notaForm.handleSubmit(onCrearNota)} className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Cliente <span className="text-steel-400 font-normal">(opcional)</span>
            </label>
            <Input
              placeholder="Sin cliente asignado"
              value={clienteQ}
              onChange={(e) => {
                setClienteQ(e.target.value);
                if (clienteSeleccionado) {
                  setClienteSeleccionado(null);
                  notaForm.setValue('cliente_id', '');
                }
              }}
            />
            {clienteQ.length > 0 && !clienteSeleccionado && (
              <div className="mt-1 border border-steel-200 rounded-lg max-h-40 overflow-y-auto">
                {clienteResultados.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-body-sm hover:bg-steel-50 border-b border-steel-50"
                    onClick={() => {
                      setClienteSeleccionado(c);
                      setClienteQ(c.razon_social ?? `${c.nombre} ${c.apellidos ?? ''}`.trim());
                      notaForm.setValue('cliente_id', c.id);
                    }}
                  >
                    {c.razon_social ?? `${c.nombre} ${c.apellidos ?? ''}`.trim()}
                  </button>
                ))}
              </div>
            )}
            {clienteSeleccionado && (
              <p className="text-meta text-emerald-600 mt-1 flex items-center gap-2">
                <span>✓ {clienteSeleccionado.razon_social ?? clienteSeleccionado.nombre}</span>
                <button
                  type="button"
                  className="text-steel-400 hover:text-steel-600 underline"
                  onClick={() => { setClienteSeleccionado(null); setClienteQ(''); notaForm.setValue('cliente_id', ''); }}
                >
                  Quitar
                </button>
              </p>
            )}
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Observaciones</label>
            <Input placeholder="Notas internas…" {...notaForm.register('observaciones')} />
          </div>
          {notaError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{notaError}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDlgNota(false)}>Cancelar</Button>
            <Button type="submit" loading={creatingNota}>Crear cotización</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* ── Dialog: cancelar cotización ────────────────────── */}
      <Dialog open={dlgCancelar} onClose={() => setDlgCancelar(false)} title="¿Cancelar cotización?" size="sm">
        <p className="text-body text-steel-600 mb-4">
          {notaActiva && `La cotización #${String(notaActiva.folio).padStart(4, '0')} `}
          quedará marcada como cancelada — el folio se conserva, no se borra el registro.
        </p>
        <div className="mb-3">
          <label className="block text-body-sm font-medium text-steel-700 mb-1">Motivo</label>
          <Select value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} placeholder="Selecciona un motivo">
            {MOTIVOS_CANCELACION.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </div>
        {motivoCancelar === 'OTRO' && (
          <div className="mb-3">
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Comentario</label>
            <Textarea value={comentarioCancelar} onChange={(e) => setComentarioCancelar(e.target.value)} placeholder="Especifica el motivo" />
          </div>
        )}
        {cancelarError && <p className="text-body-sm text-brand-600 mb-3">{cancelarError}</p>}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setDlgCancelar(false)}>No, mantener</Button>
          <Button type="button" variant="destructive" loading={cancelando} onClick={onCancelar}>Sí, cancelar</Button>
        </DialogFooter>
      </Dialog>

      {/* ── Dialog: enviar por correo ───────────────────────── */}
      <Dialog open={dlgEmail} onClose={() => { setDlgEmail(false); setEmailOk(false); setEmailError(null); }} title="Enviar cotización por correo" size="sm">
        <div className="space-y-4">
          {emailOk ? (
            <div className="text-center py-6">
              <p className="text-display-sm text-green-600 font-bold mb-1">✅ Enviado</p>
              <p className="text-body-sm text-steel-500">El correo fue enviado a <strong>{emailDest}</strong>.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Correo destino</label>
                <Input type="email" placeholder="cliente@empresa.com" value={emailDest} onChange={(e) => setEmailDest(e.target.value)} />
              </div>
              {emailError && <p className="text-body-sm text-brand-600">{emailError}</p>}
              <DialogFooter>
                <Button variant="secondary" onClick={() => { setDlgEmail(false); setEmailError(null); }}>Cancelar</Button>
                <Button
                  disabled={!emailDest || sendingEmail}
                  onClick={() => {
                    const nota = detalleNota ?? notaActiva;
                    if (!nota) return;
                    void sendEmailCotizacion(nota);
                  }}
                >
                  {sendingEmail ? 'Enviando…' : '✉️ Enviar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
