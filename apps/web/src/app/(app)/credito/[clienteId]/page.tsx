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
import { useContextoStore } from '@/lib/store/contexto.store';
import type { CuentaClienteDetalle, MovimientoCuenta } from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { buildWhatsAppGroupLink } from '@/lib/utils/whatsapp';
import { getTicketLogoUrl, logoToEscPosBase64, buildTicketUbicacionFiscal } from '@/lib/utils/ticket-logo';
import { generateEstadoCuentaPDF } from '@/lib/utils/estado-cuenta-pdf';

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
  const { empresa, ubicacion } = useContextoStore();

  const [detalle, setDetalle] = useState<CuentaClienteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [abonoOpen, setAbonoOpen] = useState(false);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [abonoConfirmado, setAbonoConfirmado] = useState<{ monto: number; saldoRestante: number } | null>(null);
  const [descargandoEstado, setDescargandoEstado] = useState(false);

  // Esta pantalla solo abona/ajusta "otras deudas" — las ventas a crédito (ligadas
  // a una nota) se pagan desde Ventas, donde se elige la nota exacta a liquidar.
  const [abonoMonto, setAbonoMonto] = useState(0);
  const [abonoConcepto, setAbonoConcepto] = useState('');
  const [abonoSubmitting, setAbonoSubmitting] = useState(false);

  const canAbono = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR'].includes(usuario?.rol ?? '');
  const canAjuste = ['SUPER_USUARIO', 'ADMIN'].includes(usuario?.rol ?? '');

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

  // Un mismo ticket cubre abono (tipo ABONO) y cargo manual (tipo CARGO) sobre
  // "otras deudas" — el print-bridge ajusta el texto ("abonado"/"cargado") según
  // movimiento_tipo, para no imprimir "¡Gracias por su pago!" en un cargo.
  async function printMovimientoTicket(opts: {
    tipo: 'CARGO' | 'ABONO';
    monto: number;
    saldoDespues: number;
    concepto: string;
  }) {
    if (!cliente) return;
    const logoUrl = getTicketLogoUrl(empresa, ubicacion);
    const logo_escpos_b64 = logoUrl ? await logoToEscPosBase64(logoUrl) : null;
    const payload = {
      tipo: 'abono_cuenta',
      titulo: opts.tipo === 'CARGO' ? 'CARGO A CUENTA' : 'ABONO A CUENTA',
      movimiento_tipo: opts.tipo,
      logo_escpos_b64,
      empresa: { nombre: empresa?.nombre ?? '' },
      ubicacion: {
        nombre: ubicacion?.nombre ?? '',
        ...buildTicketUbicacionFiscal(ubicacion),
      },
      cliente: { nombre, telefono: cliente.telefono ?? null },
      fecha: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
      total_aplicado: opts.monto,
      saldo_restante: opts.saldoDespues,
      concepto: opts.concepto,
    };
    try {
      const controller = new AbortController();
      // El print-bridge deja hasta 25s al proceso de PowerShell que manda a
      // imprimir — este timeout debe ser mayor, o el navegador cancela la
      // petición antes de que termine y muestra error aunque sí haya impreso.
      const timer = setTimeout(() => controller.abort(), 30000);
      await fetch('http://localhost:7788/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch {
      // Print bridge no disponible — no bloquear la UI
    }
  }

  async function onAbono() {
    if (abonoMonto <= 0) return;
    setFormError(null);
    setAbonoSubmitting(true);
    try {
      const saldoRestante = Math.max(0, (cliente?.saldo_pendiente ?? 0) - abonoMonto);
      await api.post(`/cuentas/${clienteId}/abonos`, {
        monto: abonoMonto,
        concepto: abonoConcepto || undefined,
      });
      void printMovimientoTicket({
        tipo: 'ABONO',
        monto: abonoMonto,
        saldoDespues: saldoRestante,
        concepto: abonoConcepto || 'Abono a cuenta',
      });
      setAbonoOpen(false);
      setAbonoConfirmado({ monto: abonoMonto, saldoRestante });
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al registrar abono');
    } finally {
      setAbonoSubmitting(false);
    }
  }

  async function onAjuste(data: AjusteForm) {
    setFormError(null);
    try {
      const mov = await api.post<MovimientoCuenta>(`/cuentas/${clienteId}/ajustes`, data);
      void printMovimientoTicket({
        tipo: data.tipo,
        monto: Number(mov.monto),
        saldoDespues: Number(mov.saldo_despues),
        concepto: data.concepto,
      });
      setAjusteOpen(false);
      resetAjuste({ tipo: 'CARGO' });
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al registrar ajuste');
    }
  }

  async function descargarEstadoCuenta() {
    if (!cliente) return;
    setDescargandoEstado(true);
    try {
      // Se piden todos los movimientos (no solo la página que ya está en
      // pantalla) para que el estado de cuenta quede completo.
      const data = await api.get<CuentaClienteDetalle>(`/cuentas/${clienteId}?limit=1000`);
      const c = data.cliente;
      await generateEstadoCuentaPDF(
        {
          nombre: c.razon_social ?? `${c.nombre} ${c.apellidos ?? ''}`.trim(),
          telefono: c.telefono,
          saldo_pendiente: c.saldo_pendiente,
          saldo_ventas_credito: c.saldo_ventas_credito,
          saldo_otras_deudas: c.saldo_otras_deudas,
        },
        data.movimientos,
        empresa,
        ubicacion,
      );
    } finally {
      setDescargandoEstado(false);
    }
  }

  const cliente = detalle?.cliente;
  const nombre = cliente
    ? (cliente.razon_social ?? `${cliente.nombre} ${cliente.apellidos ?? ''}`.trim())
    : '…';
  const saldoVentasCredito = cliente?.saldo_ventas_credito ?? 0;
  const saldoOtrasDeudas = cliente?.saldo_otras_deudas ?? 0;

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

      {/* Desglose: ventas a crédito vs otros conceptos (deudas migradas, ajustes) */}
      {cliente && (saldoVentasCredito > 0 || saldoOtrasDeudas > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-xl p-4 border border-steel-200 bg-white">
            <p className="text-body-sm text-steel-500 mb-1">Ventas a crédito</p>
            <p className="text-display-sm font-bold text-steel-900">{formatPrecio(saldoVentasCredito)}</p>
            {saldoVentasCredito > 0 && (
              <p className="text-meta text-steel-400 mt-1">Se paga desde la nota, en Ventas</p>
            )}
          </div>
          <div className="rounded-xl p-4 border border-steel-200 bg-white">
            <p className="text-body-sm text-steel-500 mb-1">Otras deudas / otros conceptos</p>
            <p className="text-display-sm font-bold text-steel-900">{formatPrecio(saldoOtrasDeudas)}</p>
          </div>
        </div>
      )}

      {/* Confirmación de abono + aviso a grupo de Créditos */}
      {abonoConfirmado && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6">
          <div className="flex-1">
            <p className="text-body-sm text-green-700">
              Abono registrado: <strong>{formatPrecio(abonoConfirmado.monto)}</strong>
              {' · '}Saldo restante: <strong>{formatPrecio(abonoConfirmado.saldoRestante)}</strong>
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const mensaje = `🟢 Abono registrado\nCliente: ${nombre}\nMonto abonado: ${formatPrecio(abonoConfirmado.monto)}\nSaldo restante: ${formatPrecio(abonoConfirmado.saldoRestante)}`;
              window.open(buildWhatsAppGroupLink(mensaje), '_blank');
              setAbonoConfirmado(null);
            }}
          >
            Avisar grupo de Créditos
          </Button>
          <button
            onClick={() => setAbonoConfirmado(null)}
            className="text-steel-400 hover:text-steel-600 text-body-sm flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Acciones — solo "otras deudas": las ventas a crédito se abonan desde Ventas */}
      {cliente && (
        <div className="flex gap-2 mb-6">
          {canAbono && saldoOtrasDeudas > 0 && (
            <Button
              onClick={() => {
                setFormError(null);
                setAbonoMonto(0);
                setAbonoConcepto('');
                setAbonoOpen(true);
              }}
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-body font-semibold text-steel-900">Historial de movimientos</h2>
          {cliente && (
            <Button
              variant="secondary"
              size="sm"
              loading={descargandoEstado}
              onClick={() => void descargarEstadoCuenta()}
            >
              Descargar estado de cuenta
            </Button>
          )}
        </div>

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
        onClose={() => { setAbonoOpen(false); setFormError(null); }}
        title="Registrar abono"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
              Monto <span className="text-brand-600">*</span>
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={abonoMonto || ''}
              onChange={(e) => setAbonoMonto(parseFloat(e.target.value) || 0)}
            />
            <p className="text-meta text-steel-400 mt-1">
              Saldo en otras deudas: {formatPrecio(saldoOtrasDeudas)}
            </p>
          </div>

          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Concepto</label>
            <Input
              placeholder="Pago en efectivo, transferencia…"
              value={abonoConcepto}
              onChange={(e) => setAbonoConcepto(e.target.value)}
            />
          </div>

          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setAbonoOpen(false); setFormError(null); }}>
              Cancelar
            </Button>
            <Button type="button" loading={abonoSubmitting} disabled={abonoMonto <= 0} onClick={() => void onAbono()}>
              Registrar abono
            </Button>
          </DialogFooter>
        </div>
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
