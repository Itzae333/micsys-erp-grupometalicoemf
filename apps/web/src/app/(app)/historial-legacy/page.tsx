'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { formatFechaCorta } from '@/lib/utils';

interface VentaLegacy {
  id: string;
  legacy_id: number;
  sucursal: string;
  cliente_nombre: string | null;
  total: number;
  recibido: number;
  restan: number;
  estatus: string;
  tipo_pago: string;
  fecha_hora: string;
}

interface ListaResponse {
  data: VentaLegacy[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const ESTATUS_COLORS: Record<string, string> = {
  PAGADA: 'bg-green-50 text-green-700',
  CANCELADA: 'bg-red-50 text-red-600',
  CREDITO: 'bg-amber-50 text-amber-700',
  PENDIENTE: 'bg-blue-50 text-blue-700',
};

export default function HistorialLegacyPage() {
  const router = useRouter();
  const [ventas, setVentas] = useState<VentaLegacy[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [sucursal, setSucursal] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  async function cargar(p = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (q) params.set('q', q);
      if (sucursal) params.set('sucursal', sucursal);
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);

      const res = await api.get<ListaResponse>(`/migracion/ventas?${params}`);
      setVentas(res.data);
      setTotal(res.total);
      setPages(res.pages);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(1); }, []);

  function buscar() { cargar(1); }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <History className="h-5 w-5 text-steel-500" />
          <h1 className="text-title font-bold text-steel-900">Historial Legacy</h1>
        </div>
        <p className="text-body-sm text-steel-500">
          Ventas históricas del sistema MetalAlpha — solo lectura
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
          <Input
            className="pl-9"
            placeholder="Buscar cliente..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
          />
        </div>
        <select
          className="px-3 py-2 border border-steel-300 rounded-lg text-body-sm text-steel-700 bg-white"
          value={sucursal}
          onChange={(e) => setSucursal(e.target.value)}
        >
          <option value="">Todas las sucursales</option>
          <option value="virgen">Principal (virgen)</option>
          <option value="punto_venta">Punto de venta</option>
        </select>
        <Input
          type="date"
          className="w-40"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          placeholder="Desde"
        />
        <Input
          type="date"
          className="w-40"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          placeholder="Hasta"
        />
        <Button variant="secondary" onClick={buscar} disabled={loading}>
          Buscar
        </Button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-16 text-steel-400 text-body-sm">Cargando...</div>
      ) : ventas.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title="Sin ventas históricas"
          description="Importa el archivo ventas_detalle.csv desde Configuración → Migración"
        />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
            <table className="w-full text-body-sm">
              <thead className="bg-steel-50 border-b border-steel-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-steel-600">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-steel-600">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium text-steel-600">Sucursal</th>
                  <th className="text-right px-4 py-3 font-medium text-steel-600">Total</th>
                  <th className="text-right px-4 py-3 font-medium text-steel-600">Recibido</th>
                  <th className="text-right px-4 py-3 font-medium text-steel-600">Restan</th>
                  <th className="text-left px-4 py-3 font-medium text-steel-600">Estatus</th>
                  <th className="text-left px-4 py-3 font-medium text-steel-600">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {ventas.map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-steel-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/historial-legacy/${v.id}`)}
                  >
                    <td className="px-4 py-3 text-steel-700">
                      {formatFechaCorta(v.fecha_hora)}
                    </td>
                    <td className="px-4 py-3 text-steel-900 font-medium">
                      {v.cliente_nombre || <span className="text-steel-400">Sin cliente</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-caption bg-steel-100 text-steel-600 px-2 py-0.5 rounded-full">
                        {v.sucursal === 'virgen' ? 'Principal' : 'Punto Venta'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-steel-900">
                      ${v.total.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-steel-600">
                      ${v.recibido.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-steel-600">
                      ${v.restan.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-caption px-2 py-0.5 rounded-full font-medium ${ESTATUS_COLORS[v.estatus] ?? 'bg-steel-100 text-steel-600'}`}>
                        {v.estatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-steel-600">{v.tipo_pago}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between">
            <p className="text-body-sm text-steel-500">
              {total} ventas — página {page} de {pages}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => cargar(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => cargar(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
