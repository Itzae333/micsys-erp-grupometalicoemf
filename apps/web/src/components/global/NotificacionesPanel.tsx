'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CreditCard, FileText, ShoppingCart, X, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useContextoStore } from '@/lib/store/contexto.store';

interface AlertaItem {
  id: string;
  label: string;
  sub: string;
  href: string;
  dias: number;
}

interface Alerta {
  tipo: string;
  titulo: string;
  count: number;
  href: string;
  items: AlertaItem[];
}

interface Resumen {
  total: number;
  alertas: Alerta[];
}

const TIPO_ICON: Record<string, React.ReactNode> = {
  credito_vencido:  <CreditCard   className="h-3.5 w-3.5 text-red-500"    />,
  cotizacion_vieja: <FileText     className="h-3.5 w-3.5 text-amber-500"  />,
  oc_pendiente:     <ShoppingCart className="h-3.5 w-3.5 text-blue-500"   />,
};

export function NotificacionesPanel() {
  const router = useRouter();
  const { empresa } = useContextoStore();

  const [open, setOpen]         = useState(false);
  const [data, setData]         = useState<Resumen | null>(null);
  const [loading, setLoading]   = useState(false);
  const panelRef                = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      const res = await api.get<Resumen>('/notificaciones/resumen');
      setData(res);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [empresa?.id]);

  // Cargar al montar y cada 2 minutos
  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function navigate(href: string) {
    router.push(href);
    setOpen(false);
  }

  const total = data?.total ?? 0;

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => { setOpen((o) => !o); if (!open) void load(); }}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-steel-400 hover:text-white hover:bg-steel-700 transition-colors"
        title="Notificaciones"
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute left-full top-0 ml-2 w-80 bg-white rounded-xl shadow-xl border border-steel-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-steel-100">
            <span className="text-body-sm font-semibold text-steel-900">
              Notificaciones {total > 0 && <span className="text-red-500">({total})</span>}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => void load()}
                className="p-1 text-steel-400 hover:text-steel-700 rounded transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-steel-400 hover:text-steel-700 rounded transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Contenido */}
          <div className="max-h-96 overflow-y-auto">
            {loading && !data ? (
              <div className="p-6 text-center text-body-sm text-steel-400">Cargando…</div>
            ) : !data || data.alertas.length === 0 ? (
              <div className="p-6 text-center">
                <Bell className="h-8 w-8 text-steel-200 mx-auto mb-2" />
                <p className="text-body-sm text-steel-400">Sin alertas activas</p>
              </div>
            ) : (
              data.alertas.map((alerta) => (
                <div key={alerta.tipo} className="border-b border-steel-50 last:border-0">
                  {/* Encabezado grupo */}
                  <button
                    onClick={() => navigate(alerta.href)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-steel-50 hover:bg-steel-100 transition-colors"
                  >
                    {TIPO_ICON[alerta.tipo]}
                    <span className="flex-1 text-left text-meta font-semibold text-steel-700 truncate">
                      {alerta.titulo}
                    </span>
                    <span className="text-meta font-bold text-red-500 flex-shrink-0">
                      {alerta.count}
                    </span>
                  </button>

                  {/* Items */}
                  {alerta.items.slice(0, 5).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.href)}
                      className="w-full flex items-start gap-2 px-4 py-2 hover:bg-steel-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm text-steel-800 truncate">{item.label}</p>
                        <p className="text-meta text-steel-400 truncate">{item.sub}</p>
                      </div>
                      <span className="text-meta text-steel-400 flex-shrink-0 whitespace-nowrap">
                        {item.dias}d
                      </span>
                    </button>
                  ))}

                  {alerta.items.length > 5 && (
                    <button
                      onClick={() => navigate(alerta.href)}
                      className="w-full px-4 py-1.5 text-meta text-brand-600 hover:text-brand-700 text-center"
                    >
                      Ver {alerta.items.length - 5} más…
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
