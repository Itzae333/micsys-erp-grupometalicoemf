'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, PackageCheck } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useContextoStore } from '@/lib/store/contexto.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBlockRoles } from '@/lib/hooks/use-block-roles';
import { LineasExtraEditor, type LineaExtra } from '@/components/remisiones/LineasExtraEditor';

interface EmpresaOrigen {
  id: string;
  nombre: string;
  ubicaciones: { id: string; nombre: string; tipo: string }[];
}

// Recepción cuando el origen nunca capturó la remisión: el destino la crea con
// lo que recibió. Solo entra inventario al destino; el origen no se descuenta.
export default function RecepcionDirectaPage() {
  useBlockRoles(['SUPER_USUARIO']);
  const router = useRouter();
  const { empresa, ubicacion } = useContextoStore();

  const [origenes, setOrigenes]         = useState<EmpresaOrigen[]>([]);
  const [empresaOrgId, setEmpresaOrgId] = useState('');
  const [ubOrigenId, setUbOrigenId]     = useState('');
  const [concepto, setConcepto]         = useState('');
  const [lineas, setLineas]             = useState<LineaExtra[]>([]);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    api.get<EmpresaOrigen[]>('/remisiones/destinos').then(setOrigenes).catch(() => setOrigenes([]));
  }, []);

  const empresaOrg = origenes.find((e) => e.id === empresaOrgId);
  const ubicacionesOrigen = (empresaOrg?.ubicaciones ?? []).filter((u) => u.id !== ubicacion?.id);

  async function confirmar() {
    if (!empresaOrgId || !ubOrigenId) { setError('Selecciona el origen de la mercancía'); return; }
    if (!lineas.length) { setError('Agrega al menos un producto recibido'); return; }
    if (lineas.some((l) => !(l.cantidad > 0))) { setError('Todas las cantidades deben ser mayores a 0'); return; }
    setError(null);
    setSaving(true);
    try {
      const rem = await api.post<{ id: string }>('/remisiones/recepcion-directa', {
        empresa_origen_id: empresaOrgId,
        ub_origen_id:      ubOrigenId,
        concepto:          concepto || undefined,
        lineas: lineas.map((l) => ({
          articulo_destino_id: l.articulo.id,
          cantidad:            l.cantidad,
          slot_destino:        l.slot_destino,
        })),
      });
      router.push(`/movimientos/remisiones/${rem.id}`);
    } catch (err: any) {
      setError(err?.message ?? 'Error al registrar la recepción');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-display-sm font-bold text-steel-900">Recibir sin remisión</h1>
        <p className="text-body-sm text-steel-500 mt-0.5">
          El origen no capturó la remisión. Registra lo que recibiste; solo se suma al inventario de{' '}
          <strong>{ubicacion?.nombre ?? 'esta ubicación'}</strong>.
        </p>
      </div>

      <div className="bg-white border border-steel-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
          <div className="space-y-3">
            <p className="text-meta text-steel-500 uppercase tracking-wide font-medium">Origen</p>
            <select
              value={empresaOrgId}
              onChange={(e) => { setEmpresaOrgId(e.target.value); setUbOrigenId(''); }}
              className="w-full border border-steel-300 rounded px-3 py-2 text-body-sm"
            >
              <option value="">Empresa de origen…</option>
              {origenes.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <select
              value={ubOrigenId}
              onChange={(e) => setUbOrigenId(e.target.value)}
              disabled={!empresaOrgId}
              className="w-full border border-steel-300 rounded px-3 py-2 text-body-sm disabled:opacity-50"
            >
              <option value="">Ubicación de origen…</option>
              {ubicacionesOrigen.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <ArrowRight className="h-5 w-5 text-steel-400 hidden md:block mb-2" />
          <div>
            <p className="text-meta text-steel-500 uppercase tracking-wide font-medium mb-1">Destino (tú)</p>
            <p className="text-body font-semibold text-steel-800">{empresa?.nombre}</p>
            <p className="text-body-sm text-steel-500">{ubicacion?.nombre}</p>
          </div>
        </div>
        <Input
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Concepto o nota (opcional)"
        />
      </div>

      <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-steel-100 bg-steel-50">
          <p className="text-body-sm font-medium text-steel-700">Productos recibidos ({lineas.length})</p>
        </div>
        <LineasExtraEditor
          lineas={lineas}
          onChange={setLineas}
          disabled={saving}
          titulo="Agrega los productos desde tu inventario"
          ayuda="Busca cada producto que recibiste y captura la cantidad."
        />
        <div className="px-4 py-4 border-t border-steel-100 bg-steel-50 space-y-3">
          {error && (
            <p className="text-body-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => router.back()} disabled={saving}>Cancelar</Button>
            <Button onClick={confirmar} disabled={saving}>
              <PackageCheck className="h-4 w-4 mr-1.5" />
              {saving ? 'Registrando…' : 'Confirmar recepción'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
