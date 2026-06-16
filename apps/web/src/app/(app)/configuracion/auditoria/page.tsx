'use client';

import { useState, useCallback, useEffect } from 'react';
import { Shield, RefreshCw, Search } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/store/auth.store';

interface AuditLog {
  id: string;
  empresa_id: string | null;
  usuario_id: string | null;
  usuario_name: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  ip: string | null;
  created_at: string;
}

interface AuditPage {
  data: AuditLog[];
  total: number;
  page: number;
  pages: number;
}

const ACCION_CFG: Record<string, { label: string; variant: 'paid' | 'cancelled' | 'credit' | 'default' }> = {
  CREATE: { label: 'Crear',     variant: 'paid'      },
  UPDATE: { label: 'Actualizar',variant: 'credit'    },
  DELETE: { label: 'Eliminar',  variant: 'cancelled' },
};

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AuditoriaPage() {
  const { usuario } = useAuthStore();
  const [logs, setLogs]       = useState<AuditLog[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(false);
  const [entidad, setEntidad] = useState('');
  const [applied, setApplied] = useState('');

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: '50' });
      if (applied) params.set('entidad', applied);
      const res = await api.get<AuditPage>(`/reportes/auditoria?${params}`);
      setLogs(res.data);
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
    } catch { /* noop */ } finally { setLoading(false); }
  }, [applied]);

  useEffect(() => { void load(1); }, [load]);

  const isAdmin = ['SUPER_USUARIO', 'ADMIN'].includes(usuario?.rol ?? '');
  if (!isAdmin) {
    return (
      <div className="p-8">
        <p className="text-body text-steel-500">Sin acceso.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-steel-100 flex items-center justify-center">
          <Shield className="h-5 w-5 text-steel-600" />
        </div>
        <div>
          <h1 className="text-display-sm font-bold text-steel-900">Log de auditoría</h1>
          <p className="text-body-sm text-steel-500">{total.toLocaleString('es-MX')} registros</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-steel-200 rounded-xl p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
          <Input
            className="pl-9"
            placeholder="Filtrar por módulo (ventas, articulos…)"
            value={entidad}
            onChange={(e) => setEntidad(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setApplied(entidad); } }}
          />
        </div>
        <Button
          size="sm"
          onClick={() => { setApplied(entidad); }}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Buscar
        </Button>
        {applied && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setEntidad(''); setApplied(''); }}
          >
            Limpiar
          </Button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-body-sm text-steel-400">Cargando…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-steel-400">Sin registros</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-steel-100 bg-steel-50">
                  <th className="px-4 py-2.5 text-left font-medium text-steel-500">Fecha</th>
                  <th className="px-4 py-2.5 text-left font-medium text-steel-500">Usuario</th>
                  <th className="px-4 py-2.5 text-left font-medium text-steel-500">Acción</th>
                  <th className="px-4 py-2.5 text-left font-medium text-steel-500">Módulo</th>
                  <th className="px-4 py-2.5 text-left font-medium text-steel-500">ID</th>
                  <th className="px-4 py-2.5 text-left font-medium text-steel-500">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {logs.map((log) => {
                  const cfg = ACCION_CFG[log.accion] ?? { label: log.accion, variant: 'default' as const };
                  return (
                    <tr key={log.id} className="hover:bg-steel-50 transition-colors">
                      <td className="px-4 py-2.5 text-steel-500 tabular-nums whitespace-nowrap">
                        {fmtFecha(log.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-steel-700">
                        {log.usuario_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-steel-700 text-meta">
                        {log.entidad}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-steel-400 text-meta truncate max-w-[120px]">
                        {log.entidad_id ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-meta text-steel-400 font-mono">
                        {log.ip ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-body-sm text-steel-500">
            Página {page} de {pages} · {total.toLocaleString('es-MX')} registros
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => void load(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= pages || loading}
              onClick={() => void load(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
