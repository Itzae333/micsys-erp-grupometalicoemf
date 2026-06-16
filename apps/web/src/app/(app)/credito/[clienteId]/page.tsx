'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, TrendingDown, TrendingUp, SlidersHorizontal } from 'lucide-react';
import { formatPrecio } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import type { CuentaClienteDetalle, MovimientoCuenta } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const AbonoSchema = z.object({
  monto: z.number({ coerce: true }).min(0.01, 'Monto mínimo $0.01'),
  concepto: z.string().optional(),
});
type AbonoForm = z.infer<typeof AbonoSchema>;

const AjusteSchema = z.object({
  tipo: z.enum(['CARGO', 'ABONO']),
  monto: z.number({ coerce: true }).min(0.01, 'Monto mínimo $0.01'),
  concepto: z.string().min(3, 'Ingresa una descripción'),
});
type AjusteForm = z.infer<typeof AjusteSchema>;

const TIPO_CONFIG: Record<MovimientoCuenta['tipo'], { label: string; variant: 'paid' | 'nota_por_pagar' | 'pending' }> = {
  CARGO: { label: 'Cargo', variant: 'nota_por_pagar' },
  ABONO: { label: 'Abono', variant: 'paid' },
  AJUSTE: { label: 'Ajuste', variant: 'pending' },
};

export default function CuentaClientePage() {
  const router = useRouter();
  const { clienteId } = useParams<{ clienteId: string }>();
  const { usuario } = useAuthStore();

  const [detalle, setDetalle] = useState<CuentaClienteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [abonoOpen, setAbonoOpen] = useState(false);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canAbono = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR'].includes(usuario?.rol ?? '');
  const canAjuste = ['SUPER_USUARIO', 'ADMIN'].includes(usuario?.rol ?? '');

  const {
    register: regAbono,
    handleSubmit: handleAbono,
    reset: resetAbono,
    formState: { errors: errorsAbono, isSubmitting: submittingAbono },
  } = useForm<AbonoForm>({ resolver: zodResolver(AbonoSchema) });

  const {
    register: regAjuste,
    handleSubmit: handleAjuste,
    reset: resetAjuste,
    formState: { errors: errorsAjuste, isSubmitting: submittingAjuste },
  } = useForm<AjusteForm>({
    resolver: zodResolver(AjusteSchema),
    defaultValues: { tipo: 'CARGO' },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<CuentaClienteDetalle>(`/cuentas/${clienteId}`);
      setDetalle(data);
    } catch { setDetalle(null); } finally { setLoading(false); }
  }, [clienteId]);

  useEffect(() => { load(); }, [load]);

  async function onAbono(data: AbonoForm) {
    setFormError(null);
    try {
      await api.post(`/cuentas/${clienteId}/abonos`, data);
      setAbonoOpen(false);
      resetAbono();
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al registrar abono');
    }
  }

  async function onAjuste(data: AjusteForm) {
    setFormError(null);
    try {
      await api.post(`/cuentas/${clienteId}/ajustes`, data);
      setAjusteOpen(false);
      resetAjuste({ tipo: 'CARGO' });
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al registrar ajuste');
    }
  }

  const cliente = detalle?.cliente;
  const nombre = cliente
    ? (cliente.razon_social ?? `${cliente.nombre} ${cliente.apellidos ?? ''}`.trim())
    : '…';

  return (
    <div className="p-6 max-w-3xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-steel-500 hover:text-steel-800 text-body-sm mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Crédito
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Cuenta de cliente</p>
          <h1 className="text-display-md font-bold text-steel-900">{nombre}</h1>
          {cliente && (
            <div className="flex items-center gap-3 mt-1">
              {cliente.telefono && (
                <p className="text-body-sm text-steel-500">{cliente.telefono}</p>
              )}
              <p className="text-body-sm text-steel-400">Crédito</p>
            </div>
          )}
        </div>

        {cliente && (
          <div className="text-right">
            <p className="text-body-sm text-steel-400 mb-0.5">Saldo pendiente</p>
            <p className={`text-display-sm font-bold ${cliente.saldo_pendiente > 0 ? 'text-brand-600' : 'text-green-600'}`}>
              {formatPrecio(cliente.saldo_pendiente)}
            </p>
            {cliente.limite_credito > 0 && (
              <p className="text-meta text-steel-400">límite {formatPrecio(cliente.limite_credito)}</p>
            )}
          </div>
        )}
      </div>

      {/* Acciones */}
      {cliente && cliente.saldo_pendiente > 0 && (
        <div className="flex gap-2 mb-6">
          {canAbono && (
            <Button
              onClick={() => { setFormError(null); resetAbono(); setAbonoOpen(true); }}
              className="flex items-center gap-1.5"
            >
              <TrendingDown className="h-4 w-4" />
              Registrar abono
            </Button>
          )}
          {canAjuste && (
            <Button
              variant="secondary"
              onClick={() => { setFormError(null); resetAjuste({ tipo: 'CARGO' }); setAjusteOpen(true); }}
              className="flex items-center gap-1.5"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Ajuste manual
            </Button>
          )}
        </div>
      )}

      {cliente && cliente.saldo_pendiente === 0 && canAbono && (
        <div className="flex gap-2 mb-6">
          {canAjuste && (
            <Button
              variant="secondary"
              onClick={() => { setFormError(null); resetAjuste({ tipo: 'CARGO' }); setAjusteOpen(true); }}
              className="flex items-center gap-1.5"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Ajuste manual
            </Button>
          )}
        </div>
      )}

      {/* Barra de uso de crédito */}
      {cliente && cliente.limite_credito > 0 && (
        <div className="mb-6 p-4 bg-white border border-steel-200 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-body-sm font-medium text-steel-700">Uso de línea de crédito</p>
            <p className="text-body-sm text-steel-500">
              {formatPrecio(cliente.saldo_pendiente)} / {formatPrecio(cliente.limite_credito)}
            </p>
          </div>
          <div className="h-2 bg-steel-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                cliente.saldo_pendiente > cliente.limite_credito
                  ? 'bg-red-500'
                  : (cliente.saldo_pendiente / cliente.limite_credito) > 0.8
                  ? 'bg-amber-400'
                  : 'bg-brand-500'
              }`}
              style={{ width: `${Math.min(100, (cliente.saldo_pendiente / cliente.limite_credito) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Movimientos */}
      <div>
        <h2 className="text-body font-semibold text-steel-900 mb-3">Historial de movimientos</h2>

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-steel-100 rounded-xl animate-pulse" />)}
          </div>
        ) : !detalle || detalle.movimientos.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-steel-400">
            <div className="text-center">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-body-sm">Sin movimientos registrados</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {detalle.movimientos.map((m) => {
              const cfg = TIPO_CONFIG[m.tipo];
              const esCargo = m.tipo === 'CARGO' || (m.tipo === 'AJUSTE');
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-4 px-4 py-3 bg-white border border-steel-200 rounded-xl"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    m.tipo === 'ABONO' ? 'bg-green-50' : m.tipo === 'CARGO' ? 'bg-brand-50' : 'bg-steel-100'
                  }`}>
                    {m.tipo === 'ABONO'
                      ? <TrendingDown className="h-4 w-4 text-green-600" />
                      : <TrendingUp className="h-4 w-4 text-brand-600" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      <p className="text-body-sm text-steel-700 truncate">{m.concepto}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-meta text-steel-400">
                        {new Date(m.created_at).toLocaleDateString('es-MX', {
                          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                      {m.usuario && (
                        <p className="text-meta text-steel-400">
                          · {m.usuario.nombre} {m.usuario.apellidos}
                        </p>
                      )}
                      {m.nota && (
                        <p className="text-meta text-steel-400">· Nota #{m.nota.folio}</p>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className={`text-body font-bold ${m.tipo === 'ABONO' ? 'text-green-600' : 'text-steel-900'}`}>
                      {m.tipo === 'ABONO' ? '-' : '+'}{formatPrecio(m.monto)}
                    </p>
                    <p className="text-meta text-steel-400">saldo {formatPrecio(m.saldo_despues)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog — Abono */}
      <Dialog
        open={abonoOpen}
        onClose={() => { setAbonoOpen(false); resetAbono(); setFormError(null); }}
        title="Registrar abono"
        size="sm"
      >
        <form onSubmit={handleAbono(onAbono)} className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Monto <span className="text-brand-600">*</span>
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              error={errorsAbono.monto?.message}
              {...regAbono('monto', { valueAsNumber: true })}
            />
            {cliente && (
              <p className="text-meta text-steel-400 mt-1">Saldo actual: {formatPrecio(cliente.saldo_pendiente)}</p>
            )}
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Concepto</label>
            <Input placeholder="Pago en efectivo, transferencia…" {...regAbono('concepto')} />
          </div>

          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setAbonoOpen(false); resetAbono(); setFormError(null); }}>
              Cancelar
            </Button>
            <Button type="submit" loading={submittingAbono}>
              Registrar abono
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Dialog — Ajuste manual */}
      <Dialog
        open={ajusteOpen}
        onClose={() => { setAjusteOpen(false); resetAjuste({ tipo: 'CARGO' }); setFormError(null); }}
        title="Ajuste manual de saldo"
        size="sm"
      >
        <form onSubmit={handleAjuste(onAjuste)} className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Tipo</label>
            <select
              className="h-9 w-full rounded-md border border-steel-300 bg-white px-3 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
              {...regAjuste('tipo')}
            >
              <option value="CARGO">Cargo (aumenta saldo)</option>
              <option value="ABONO">Abono (reduce saldo)</option>
            </select>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Monto <span className="text-brand-600">*</span>
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              error={errorsAjuste.monto?.message}
              {...regAjuste('monto', { valueAsNumber: true })}
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Descripción <span className="text-brand-600">*</span>
            </label>
            <Input
              placeholder="Motivo del ajuste…"
              error={errorsAjuste.concepto?.message}
              {...regAjuste('concepto')}
            />
          </div>

          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setAjusteOpen(false); resetAjuste({ tipo: 'CARGO' }); setFormError(null); }}>
              Cancelar
            </Button>
            <Button type="submit" loading={submittingAjuste}>
              Aplicar ajuste
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
