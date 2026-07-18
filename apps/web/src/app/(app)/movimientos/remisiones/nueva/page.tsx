'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Trash2, ArrowRight, Send, Save, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useContextoStore } from '@/lib/store/contexto.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBlockRoles } from '@/lib/hooks/use-block-roles';
import { cn } from '@/lib/utils';
import { getTicketLogoUrl } from '@/lib/utils/ticket-logo';
import { TicketPreviewRemision } from '@/components/remisiones/TicketPreviewRemision';
import type { Articulo, ArticulosPage } from '@/lib/types/api';

interface EmpresaDestino {
  id: string;
  nombre: string;
  ubicaciones: { id: string; nombre: string; tipo: string }[];
}

interface LineaCarrito {
  articulo: Articulo;
  cantidad: number;
  slot_origen: number;
  slot_destino: number;
}

function descripcionCompleta(art: Articulo): string {
  return [art.descripcion_1, art.descripcion_2, art.descripcion_3, art.descripcion_4, art.descripcion_5]
    .filter(Boolean).join(' · ');
}

export default function NuevaRemisionPage() {
  useBlockRoles(['SUPER_USUARIO']);
  const router = useRouter();
  const { empresa, ubicacion } = useContextoStore();

  const [destinos, setDestinos]         = useState<EmpresaDestino[]>([]);
  const [empresaDstId, setEmpresaDstId] = useState('');
  const [ubDestinoId, setUbDestinoId]   = useState('');
  const [concepto, setConcepto]         = useState('');
  const [lineas, setLineas]             = useState<LineaCarrito[]>([]);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [showPreview, setShowPreview]   = useState(false);

  // Catálogo (izquierda)
  const [artsPag, setArtsPag]             = useState<Articulo[]>([]);
  const [artsPagPage, setArtsPagPage]     = useState(1);
  const [artsPagPages, setArtsPagPages]   = useState(1);
  const [artsPagQ, setArtsPagQ]           = useState('');
  const [artsPagLoading, setArtsPagLoading] = useState(false);

  // Carrito (derecha)
  const [cartQ, setCartQ] = useState('');

  const empresaDst = destinos.find((e) => e.id === empresaDstId);

  useEffect(() => {
    void api.get<EmpresaDestino[]>('/remisiones/destinos').then(setDestinos);
  }, []);

  const cargarArticulosPag = useCallback(async (p: number, searchQ: string) => {
    setArtsPagLoading(true);
    try {
      const qp = new URLSearchParams({ page: String(p), limit: '15' });
      if (searchQ) qp.set('q', searchQ);
      const res = await api.get<ArticulosPage>(`/articulos?${qp}`);
      setArtsPag(res.data);
      setArtsPagPages(res.pages);
      setArtsPagPage(p);
    } finally {
      setArtsPagLoading(false);
    }
  }, []);

  // Debounce búsqueda de catálogo
  useEffect(() => {
    const t = setTimeout(() => { void cargarArticulosPag(1, artsPagQ); }, 300);
    return () => clearTimeout(t);
  }, [artsPagQ, cargarArticulosPag]);

  function addLinea(art: Articulo) {
    setLineas((prev) => {
      const existente = prev.find((l) => l.articulo.id === art.id);
      if (existente) {
        return prev.map((l) => l.articulo.id === art.id ? { ...l, cantidad: l.cantidad + 1 } : l);
      }
      return [...prev, { articulo: art, cantidad: 1, slot_origen: 1, slot_destino: 1 }];
    });
  }

  const removeLinea = (idx: number) => setLineas((prev) => prev.filter((_, i) => i !== idx));

  const updateLinea = (idx: number, patch: Partial<LineaCarrito>) =>
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const carritoFiltrado = lineas
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => {
      if (!cartQ) return true;
      const qLow = cartQ.toLowerCase();
      return [l.articulo.clave, descripcionCompleta(l.articulo)]
        .filter(Boolean).join(' ').toLowerCase().includes(qLow);
    });

  async function guardar(enviar: boolean) {
    if (!empresa || !ubicacion) return;
    if (!empresaDstId || !ubDestinoId) { setError('Selecciona empresa y ubicación de destino'); return; }
    if (!lineas.length) { setError('Agrega al menos un artículo'); return; }
    setError(null);
    setSaving(true);
    try {
      const body = {
        empresa_origen_id:  empresa.id,
        ub_origen_id:       ubicacion.id,
        empresa_destino_id: empresaDstId,
        ub_destino_id:      ubDestinoId,
        concepto:           concepto || undefined,
        lineas: lineas.map((l) => ({
          articulo_id:    l.articulo.id,
          articulo_clave: l.articulo.clave,
          slot_origen:    l.slot_origen,
          slot_destino:   l.slot_destino,
          cantidad:       l.cantidad,
        })),
      };

      const rem = await api.post<{ id: string }>('/remisiones', body);

      if (enviar) {
        await api.patch(`/remisiones/${rem.id}/enviar`, {});
      }

      router.push(`/movimientos/remisiones/${rem.id}`);
    } catch (err: any) {
      setError(err?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const ubDestinoNombre = empresaDst?.ubicaciones.find((u) => u.id === ubDestinoId)?.nombre ?? '—';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-steel-200 bg-white flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.back()} className="text-steel-500 hover:text-steel-900 transition-colors">
          ←
        </button>
        <div>
          <h1 className="text-display-sm font-bold text-steel-900">Nueva remisión</h1>
          <p className="text-body-sm text-steel-500">Movimiento de inventario entre ubicaciones</p>
        </div>
      </div>

      {/* Ruta + Concepto */}
      <div className="px-4 md:px-6 py-4 bg-white border-b border-steel-200 flex-shrink-0 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_1fr] gap-3 items-end">
          <div className="space-y-1">
            <p className="text-meta font-medium text-steel-500 uppercase tracking-wide">Origen</p>
            <div className="bg-steel-50 border border-steel-200 rounded-lg px-3 py-2">
              <p className="text-body-sm font-semibold text-steel-800">{empresa?.nombre ?? '—'}</p>
              <p className="text-meta text-steel-500">{ubicacion?.nombre ?? '—'}</p>
            </div>
          </div>
          <div className="hidden md:flex items-center justify-center pb-2">
            <ArrowRight className="h-5 w-5 text-steel-400" />
          </div>
          <div className="space-y-1">
            <p className="text-meta font-medium text-steel-500 uppercase tracking-wide">Empresa destino</p>
            <select
              value={empresaDstId}
              onChange={(e) => { setEmpresaDstId(e.target.value); setUbDestinoId(''); }}
              className="w-full h-9 border border-steel-300 rounded-lg px-3 text-body-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Selecciona…</option>
              {destinos.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-meta font-medium text-steel-500 uppercase tracking-wide">Ubicación destino</p>
            <select
              value={ubDestinoId}
              onChange={(e) => setUbDestinoId(e.target.value)}
              disabled={!empresaDst}
              className="w-full h-9 border border-steel-300 rounded-lg px-3 text-body-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-steel-50 disabled:text-steel-400"
            >
              <option value="">Selecciona…</option>
              {empresaDst?.ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <Input
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Concepto (opcional) — ej. Reposición de stock, transferencia mensual…"
        />
      </div>

      {/* Split-view: catálogo | carrito */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Catálogo */}
        <div className="h-[45%] md:h-auto md:w-[58%] flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-steel-200">
          <div className="px-4 py-3 bg-steel-50 border-b border-steel-100 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
              <input
                className="h-9 w-full rounded-md border border-steel-300 bg-white pl-9 pr-3 text-body text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                placeholder="Buscar artículo por clave o descripción…"
                value={artsPagQ}
                onChange={(e) => setArtsPagQ(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {artsPagLoading ? (
              <div className="flex items-center justify-center h-32 text-body-sm text-steel-400">Cargando…</div>
            ) : artsPag.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-body-sm text-steel-400">Sin resultados</div>
            ) : (
              <table className="w-full text-body-sm">
                <thead className="sticky top-0 bg-steel-50 border-b border-steel-200 z-10">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-steel-600">Artículo</th>
                    <th className="text-right px-4 py-2.5 font-medium text-steel-600">Exist.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {artsPag.map((art) => {
                    const enCarrito = lineas.find((l) => l.articulo.id === art.id);
                    return (
                      <tr
                        key={art.id}
                        onClick={() => addLinea(art)}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-brand-50',
                          enCarrito ? 'bg-green-50' : '',
                        )}
                      >
                        <td className="px-4 py-2.5 min-w-0">
                          <p className="font-semibold text-steel-900 leading-tight break-words">
                            {descripcionCompleta(art) || art.clave}
                          </p>
                          <p className="text-meta text-steel-400">{art.clave}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span className="text-steel-600">{Number(art.existencia_1 ?? 0)}</span>
                          {enCarrito && (
                            <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                              x{enCarrito.cantidad}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-2 bg-white border-t border-steel-100 flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              disabled={artsPagPage <= 1}
              onClick={() => void cargarArticulosPag(artsPagPage - 1, artsPagQ)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-body-sm text-steel-500">Pág {artsPagPage}/{artsPagPages}</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={artsPagPage >= artsPagPages}
              onClick={() => void cargarArticulosPag(artsPagPage + 1, artsPagQ)}
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Carrito */}
        <div className="flex-1 flex flex-col min-h-0 min-h-[200px]">
          {lineas.length > 0 && (
            <div className="px-3 py-2 bg-steel-50 border-b border-steel-100 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
                <input
                  className="h-7 w-full rounded-md border border-steel-200 bg-white pl-8 pr-3 text-body-sm text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600"
                  placeholder="Filtrar carrito…"
                  value={cartQ}
                  onChange={(e) => setCartQ(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {lineas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-steel-400 p-8">
                <p className="text-body-sm text-center">Sin artículos — haz clic en un producto del catálogo</p>
              </div>
            ) : carritoFiltrado.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-body-sm text-steel-400">Sin coincidencias</div>
            ) : (
              <table className="w-full text-body-sm">
                <thead className="sticky top-0 bg-steel-50 border-b border-steel-200 z-10">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-steel-600">Artículo</th>
                    <th className="text-right px-2 py-2.5 font-medium text-steel-600 w-20">Cant</th>
                    <th className="px-2 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {carritoFiltrado.map(({ l, idx }) => (
                    <tr key={`${l.articulo.id}-${idx}`} className="bg-white">
                      <td className="px-4 py-2.5 min-w-0">
                        <p className="font-semibold text-steel-900 leading-tight break-words">{descripcionCompleta(l.articulo) || l.articulo.clave}</p>
                        <p className="text-meta text-steel-400">{l.articulo.clave}</p>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <input
                          type="number"
                          min={0.001}
                          step={0.001}
                          value={l.cantidad}
                          onChange={(e) => updateLinea(idx, { cantidad: Number(e.target.value) })}
                          className="w-16 border border-steel-300 rounded px-2 py-1 text-body-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <button onClick={() => removeLinea(idx)} className="text-steel-300 hover:text-brand-600 transition-colors" aria-label="Eliminar línea">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer carrito */}
          <div className="border-t border-steel-200 bg-steel-50 flex-shrink-0">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-body-sm text-steel-500">
                {lineas.length} artículo{lineas.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="flex items-center gap-1.5 text-body-sm text-steel-500 hover:text-steel-800 transition-colors"
              >
                {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPreview ? 'Ocultar vista previa' : 'Ver ticket'}
              </button>
            </div>

            {showPreview && (
              <div className="px-4 pb-4">
                <TicketPreviewRemision
                  logoUrl={getTicketLogoUrl(empresa, ubicacion)}
                  folio={null}
                  empresaOrigen={empresa?.nombre ?? '—'}
                  ubOrigen={ubicacion?.nombre ?? '—'}
                  empresaDestino={empresaDst?.nombre ?? '—'}
                  ubDestino={ubDestinoNombre}
                  fecha={new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  lineas={lineas.map((l) => ({ clave: l.articulo.clave, descripcion: l.articulo.descripcion_1, cantidad: l.cantidad }))}
                />
              </div>
            )}

            {error && (
              <div className="mx-4 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-body-sm text-red-700">
                {error}
              </div>
            )}

            <div className="px-4 pb-4 flex gap-2">
              <Button variant="ghost" onClick={() => router.back()} disabled={saving} className="flex-1">
                Cancelar
              </Button>
              <Button variant="outline" onClick={() => guardar(false)} disabled={saving} className="flex-1">
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Borrador
              </Button>
              <Button onClick={() => guardar(true)} disabled={saving} className="flex-1">
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {saving ? 'Guardando…' : 'Guardar y enviar'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
