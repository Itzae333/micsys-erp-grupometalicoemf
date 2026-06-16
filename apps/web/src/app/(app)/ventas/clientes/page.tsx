'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Users, Search, ShoppingCart, FileText, BookOpen, ClipboardList } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { getTicketLogoUrl, logoToEscPosBase64 } from '@/lib/utils/ticket-logo';
import type { Cliente, ConfigColumnasSchema, CuentaClienteDetalle, AbonarCuentaResult } from '@/lib/types/api';

const METODOS_PAGO = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'DEPOSITO'] as const;
const METODO_LABEL_MAP: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
};
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { cn, formatPrecio } from '@/lib/utils';

const ClienteSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  apellidos: z.string().optional(),
  razon_social: z.string().optional(),
  rfc: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  direccion: z.string().optional(),
  precio_num: z.coerce.number().int().min(1).optional(),
  limite_credito: z.coerce.number().min(0).optional(),
});
type ClienteForm = z.infer<typeof ClienteSchema>;

export default function ClientesVentasPage() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const { empresa, ubicacion } = useContextoStore();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [schema, setSchema] = useState<ConfigColumnasSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Cliente | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Vista de cuenta
  const [dlgCuenta, setDlgCuenta] = useState<Cliente | null>(null);
  const [cuenta, setCuenta] = useState<CuentaClienteDetalle | null>(null);
  const [loadingCuenta, setLoadingCuenta] = useState(false);

  // Abono desde cuenta
  const [showAbonarCuenta, setShowAbonarCuenta] = useState(false);
  const [abonarMonto, setAbonarMonto] = useState(0);
  const [abonarMetodo, setAbonarMetodo] = useState('EFECTIVO');
  const [abonarRef, setAbonarRef] = useState('');
  const [abonarLoading, setAbonarLoading] = useState(false);
  const [abonarError, setAbonarError] = useState<string | null>(null);
  const [abonarResult, setAbonarResult] = useState<AbonarCuentaResult | null>(null);

  const canWrite = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR'].includes(usuario?.rol ?? '');
  const canEdit = ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO'].includes(usuario?.rol ?? '');
  const canVender = ['ADMIN', 'ENCARGADO', 'VENDEDOR'].includes(usuario?.rol ?? '');

  const {
    register, handleSubmit, reset, formState: { errors, isSubmitting },
  } = useForm<ClienteForm>({ resolver: zodResolver(ClienteSchema) });

  const preciosActivos = schema?.precios.filter((p) => p.activa) ?? [];

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<Cliente[]>(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setClientes(data);
    } catch { setClientes([]); } finally { setLoading(false); }
  }

  useEffect(() => {
    if (empresa?.id && ubicacion?.id) {
      api.get<ConfigColumnasSchema>(`/config-columnas/${empresa.id}/${ubicacion.id}/schema`)
        .then(setSchema)
        .catch(() => {});
    }
  }, [empresa?.id, ubicacion?.id]);

  useEffect(() => { load(); }, [q]);

  function precioLabel(num: number | null): string {
    if (!num) return '';
    return preciosActivos.find((p) => p.numero === num)?.label ?? `Precio ${num}`;
  }

  function openCreate() {
    setEditTarget(null);
    reset({});
    setFormError(null);
    setDlgOpen(true);
  }

  function openEdit(c: Cliente) {
    setEditTarget(c);
    reset({
      nombre: c.nombre,
      apellidos: c.apellidos ?? '',
      razon_social: c.razon_social ?? '',
      rfc: c.rfc ?? '',
      telefono: c.telefono ?? '',
      email: c.email ?? '',
      direccion: c.direccion ?? '',
      precio_num: c.precio_num ?? undefined,
      limite_credito: c.limite_credito,
    });
    setFormError(null);
    setDlgOpen(true);
  }

  async function openCuenta(c: Cliente) {
    setDlgCuenta(c);
    setCuenta(null);
    setLoadingCuenta(true);
    setShowAbonarCuenta(false);
    setAbonarResult(null);
    setAbonarError(null);
    setAbonarMonto(0);
    try {
      const data = await api.get<CuentaClienteDetalle>(`/clientes/${c.id}/cuenta`);
      setCuenta(data);
    } catch { setCuenta(null); } finally { setLoadingCuenta(false); }
  }

  async function refreshCuenta(c: Cliente) {
    setLoadingCuenta(true);
    try {
      const data = await api.get<CuentaClienteDetalle>(`/clientes/${c.id}/cuenta`);
      setCuenta(data);
    } catch { } finally { setLoadingCuenta(false); }
  }

  async function onAbonarCuenta() {
    if (!dlgCuenta || abonarMonto <= 0) return;
    setAbonarLoading(true);
    setAbonarError(null);
    try {
      const result = await api.post<AbonarCuentaResult>(`/clientes/${dlgCuenta.id}/abonar-cuenta`, {
        monto: abonarMonto,
        metodo: abonarMetodo,
        referencia: abonarRef || undefined,
      });
      setAbonarResult(result);
      void printAbonoTicket(result, dlgCuenta);
      setShowAbonarCuenta(false);
      // Refresh movements + client list
      await refreshCuenta(dlgCuenta);
      load();
    } catch (err) {
      setAbonarError(err instanceof Error ? err.message : 'Error al registrar abono');
    } finally {
      setAbonarLoading(false);
    }
  }

  async function printAbonoTicket(result: AbonarCuentaResult, cliente: Cliente) {
    const logoUrl = getTicketLogoUrl(empresa, ubicacion);
    const logo_escpos_b64 = logoUrl ? await logoToEscPosBase64(logoUrl) : null;
    const payload = {
      tipo: 'abono_cuenta',
      logo_escpos_b64,
      empresa: { nombre: empresa?.nombre ?? '' },
      ubicacion: {
        nombre: ubicacion?.nombre ?? '',
        razon_social: (ubicacion as { razon_social?: string | null } | undefined)?.razon_social ?? null,
        rfc: (ubicacion as { rfc?: string | null } | undefined)?.rfc ?? null,
        telefono: (ubicacion as { telefono?: string | null } | undefined)?.telefono ?? null,
      },
      cliente: {
        nombre: cliente.razon_social ?? `${cliente.nombre} ${cliente.apellidos ?? ''}`.trim(),
        telefono: cliente.telefono ?? null,
      },
      metodo: METODO_LABEL_MAP[abonarMetodo] ?? abonarMetodo,
      total_aplicado: result.total_aplicado,
      saldo_restante: Number(result.cliente.saldo_pendiente),
      fecha: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
      notas_pagadas: result.notas_pagadas.map((n) => ({
        folio: String(n.folio).padStart(4, '0'),
        total: n.total,
        monto_pagado: n.monto_pagado,
        nuevo_estatus: n.nuevo_estatus,
      })),
    };
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
      console.warn('[clientes] Print bridge no disponible en localhost:7788');
    }
  }

  async function onSubmit(data: ClienteForm) {
    setFormError(null);
    const payload = {
      ...data,
      apellidos:    data.apellidos    || undefined,
      razon_social: data.razon_social || undefined,
      rfc:          data.rfc          || undefined,
      telefono:     data.telefono     || undefined,
      email:        data.email        || undefined,
      direccion:    data.direccion    || undefined,
      precio_num:   data.precio_num   || undefined,
    };
    try {
      if (editTarget) {
        await api.patch(`/clientes/${editTarget.id}`, payload);
      } else {
        await api.post('/clientes', payload);
      }
      setDlgOpen(false);
      reset({});
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-steel-500 hover:text-steel-800 text-body-sm mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Ventas
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Ventas</p>
          <h1 className="text-display-md font-bold text-steel-900">Clientes</h1>
        </div>
        {canWrite && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo cliente
          </Button>
        )}
      </div>

      {/* Búsqueda */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-steel-400" />
        <input
          className="h-9 w-full rounded-md border border-steel-300 bg-white pl-8 pr-3 text-body text-steel-900 placeholder:text-steel-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
          placeholder="Buscar por nombre, RFC, teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-steel-100 rounded-lg animate-pulse" />)}
        </div>
      ) : clientes.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Sin clientes"
          description="Agrega el primer cliente para asignarlo a notas de venta."
          action={canWrite ? { label: 'Nuevo cliente', onClick: openCreate } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {clientes.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-4 px-4 py-3.5 bg-white border border-steel-200 rounded-xl hover:border-steel-300 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-steel-100 flex items-center justify-center flex-shrink-0">
                <span className="text-steel-600 font-bold text-body-sm">{c.nombre.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-semibold text-steel-900 truncate">
                  {c.razon_social || `${c.nombre} ${c.apellidos ?? ''}`.trim()}
                </p>
                <p className="text-body-sm text-steel-500 truncate">
                  {[c.rfc, c.telefono].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {c.precio_num && (
                    <span className="text-meta text-brand-600 font-medium">
                      {precioLabel(c.precio_num)}
                    </span>
                  )}
                  {c.limite_credito > 0 && (
                    <span className="text-meta text-steel-400">
                      límite {formatPrecio(c.limite_credito)}
                      {c.saldo_pendiente > 0 && (
                        <span className="text-brand-600"> · saldo {formatPrecio(c.saldo_pendiente)}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(c.saldo_pendiente > 0 || c.limite_credito > 0) && (
                  <button
                    onClick={() => void openCuenta(c)}
                    className="flex items-center gap-1 text-body-sm text-steel-500 hover:text-steel-800 px-2.5 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors"
                    title="Ver cuenta corriente"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Cuenta
                  </button>
                )}
                {canVender && (
                  <>
                    <button
                      onClick={() => router.push(`/ventas?cliente_id=${c.id}&cotizacion=1`)}
                      className="flex items-center gap-1 text-body-sm text-steel-500 hover:text-steel-800 px-2.5 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors"
                      title="Nueva cotización"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Cotizar
                    </button>
                    <button
                      onClick={() => router.push(`/pedidos?cliente_id=${c.id}`)}
                      className="flex items-center gap-1 text-body-sm text-steel-500 hover:text-steel-800 px-2.5 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors"
                      title="Nuevo pedido con anticipo"
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      Pedido
                    </button>
                    <button
                      onClick={() => router.push(`/ventas?cliente_id=${c.id}`)}
                      className="flex items-center gap-1 text-body-sm text-white bg-brand-600 hover:bg-brand-700 px-2.5 py-1.5 rounded-lg transition-colors"
                      title="Nueva venta"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Vender
                    </button>
                  </>
                )}
                {canEdit && (
                  <button
                    onClick={() => openEdit(c)}
                    className="text-body-sm text-steel-400 hover:text-steel-700 px-3 py-1.5 border border-steel-200 rounded-lg hover:bg-steel-50 transition-colors"
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Dialog: cuenta corriente ─────────────────────── */}
      <Dialog
        open={!!dlgCuenta}
        onClose={() => { setDlgCuenta(null); setCuenta(null); }}
        title={dlgCuenta
          ? `Cuenta — ${dlgCuenta.razon_social || `${dlgCuenta.nombre} ${dlgCuenta.apellidos ?? ''}`.trim()}`
          : 'Cuenta'}
        size="lg"
      >
        {dlgCuenta && (
          <div className="space-y-4">
            {/* Resumen de saldo */}
            <div className="grid grid-cols-2 gap-3">
              <div className={cn(
                'rounded-xl p-4 border',
                (cuenta?.cliente.saldo_pendiente ?? dlgCuenta.saldo_pendiente) > 0
                  ? 'bg-brand-50 border-brand-200'
                  : 'bg-green-50 border-green-200',
              )}>
                <p className="text-body-sm text-steel-500 mb-1">Saldo pendiente</p>
                <p className={cn(
                  'text-display-sm font-bold',
                  (cuenta?.cliente.saldo_pendiente ?? dlgCuenta.saldo_pendiente) > 0
                    ? 'text-brand-600'
                    : 'text-green-600',
                )}>
                  ${(cuenta?.cliente.saldo_pendiente ?? dlgCuenta.saldo_pendiente).toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl p-4 border border-steel-200 bg-steel-50">
                <p className="text-body-sm text-steel-500 mb-1">Límite de crédito</p>
                <p className="text-display-sm font-bold text-steel-900">
                  ${(cuenta?.cliente.limite_credito ?? dlgCuenta.limite_credito).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Movimientos */}
            {loadingCuenta ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-steel-100 rounded animate-pulse" />)}
              </div>
            ) : !cuenta || cuenta.movimientos.length === 0 ? (
              <p className="text-body-sm text-steel-400 text-center py-4">Sin movimientos registrados</p>
            ) : (
              <div className="border border-steel-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-steel-100 bg-steel-50">
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[1px] font-medium text-steel-400">Fecha</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[1px] font-medium text-steel-400">Concepto</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase tracking-[1px] font-medium text-steel-400">Monto</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase tracking-[1px] font-medium text-steel-400">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuenta.movimientos.map((m) => (
                      <tr key={m.id} className="border-b border-steel-50 last:border-b-0">
                        <td className="px-3 py-2.5">
                          <span className="text-body-sm text-steel-500">
                            {new Date(m.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="text-body-sm text-steel-700">{m.concepto}</p>
                          {m.nota && (
                            <span className="text-meta text-steel-400">Nota #{String(m.nota.folio).padStart(4, '0')}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={cn(
                            'text-body-sm font-semibold',
                            m.tipo === 'CARGO' ? 'text-brand-600' : 'text-green-600',
                          )}>
                            {m.tipo === 'CARGO' ? '+' : '−'}{formatPrecio(m.monto)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={cn(
                            'text-body-sm font-semibold',
                            m.saldo_despues > 0 ? 'text-brand-600' : 'text-steel-600',
                          )}>
                            {formatPrecio(m.saldo_despues)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cuenta.total > cuenta.limit && (
                  <div className="px-3 py-2 bg-steel-50 border-t border-steel-100 text-center">
                    <p className="text-meta text-steel-400">Mostrando {cuenta.movimientos.length} de {cuenta.total} movimientos</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Ticket de abono a cuenta ────────────────── */}
            {abonarResult && (
              <div className="space-y-3">
                {/* Ticket visual */}
                <div className="border border-steel-200 rounded-xl overflow-hidden bg-white text-[11px] font-mono">
                  {/* Cabecera empresa */}
                  <div className="bg-steel-900 text-white px-4 py-3 text-center">
                    <p className="font-bold text-[13px] tracking-wide uppercase">
                      {(empresa as { razon_social?: string } | undefined)?.razon_social ?? empresa?.nombre ?? 'EMPRESA'}
                    </p>
                    {(ubicacion as { nombre?: string } | undefined)?.nombre && (
                      <p className="text-steel-300 mt-0.5 text-[10px]">{(ubicacion as { nombre?: string }).nombre}</p>
                    )}
                  </div>
                  {/* Tipo de comprobante */}
                  <div className="px-4 py-2 text-center font-bold text-[12px] text-steel-700 border-b border-dashed border-steel-200 uppercase tracking-wider">
                    Comprobante de Abono
                  </div>
                  {/* Fecha + cliente */}
                  <div className="px-4 py-2 border-b border-dashed border-steel-200 space-y-0.5 text-steel-600">
                    <div className="flex justify-between">
                      <span className="text-steel-400">Fecha</span>
                      <span>{new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-steel-400">Cliente</span>
                      <span className="font-semibold">
                        {dlgCuenta!.razon_social ?? `${dlgCuenta!.nombre} ${dlgCuenta!.apellidos ?? ''}`.trim()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-steel-400">Método</span>
                      <span>{METODO_LABEL_MAP[abonarMetodo] ?? abonarMetodo}</span>
                    </div>
                  </div>
                  {/* Desglose por nota */}
                  <div className="px-4 pt-2 pb-1">
                    <p className="text-[10px] uppercase tracking-[1px] text-steel-400 mb-1">Desglose:</p>
                    {abonarResult.notas_pagadas.map((n) => (
                      <div key={n.nota_id} className="flex items-center justify-between py-0.5">
                        <span className="text-steel-600">Nota #{String(n.folio).padStart(4, '0')}</span>
                        <div className="text-right">
                          <span className="text-steel-800 font-semibold">{formatPrecio(n.monto_pagado)}</span>
                          <span className={cn(
                            'ml-2 text-[10px] font-bold',
                            n.nuevo_estatus === 'PAGADA' ? 'text-green-600' : 'text-amber-600',
                          )}>
                            {n.nuevo_estatus === 'PAGADA' ? '✓ PAGADA' : 'CRÉDITO'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Total + saldo */}
                  <div className="px-4 py-2 border-t border-dashed border-steel-300 space-y-0.5">
                    <div className="flex justify-between font-bold text-[13px] text-steel-900">
                      <span>TOTAL ABONADO</span>
                      <span>{formatPrecio(abonarResult.total_aplicado)}</span>
                    </div>
                    {Number(abonarResult.cliente.saldo_pendiente) > 0 ? (
                      <div className="flex justify-between text-amber-700 font-semibold">
                        <span>SALDO PENDIENTE</span>
                        <span>{formatPrecio(Number(abonarResult.cliente.saldo_pendiente))}</span>
                      </div>
                    ) : (
                      <div className="text-center text-green-700 font-bold text-[12px] pt-0.5">
                        *** CUENTA AL CORRIENTE ***
                      </div>
                    )}
                  </div>
                  {abonarResult.sobrante > 0 && (
                    <div className="px-4 py-1.5 bg-amber-50 text-amber-700 text-[10px] text-center">
                      Sobrante {formatPrecio(abonarResult.sobrante)} — no había más notas en crédito
                    </div>
                  )}
                  <div className="px-4 py-2 text-center text-steel-400 text-[10px]">¡Gracias por su pago!</div>
                </div>
                {/* Acciones */}
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void printAbonoTicket(abonarResult, dlgCuenta!)}
                  >
                    🖨️ Imprimir ticket
                  </Button>
                  <Button variant="ghost" className="text-steel-400" onClick={() => setAbonarResult(null)}>
                    Cerrar
                  </Button>
                </div>
              </div>
            )}

            {/* ── Formulario de abono ─────────────────────── */}
            {!abonarResult && showAbonarCuenta && (
              <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
                <p className="text-body-sm font-semibold text-amber-900">Registrar abono a cuenta</p>
                <p className="text-meta text-amber-700">
                  Se aplica a las notas en crédito de más antigua a más nueva.
                </p>
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-body-sm font-medium text-steel-900 mb-1">Método</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-steel-300 bg-white px-3 py-1 text-body text-steel-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      value={abonarMetodo}
                      onChange={(e) => setAbonarMetodo(e.target.value)}
                    >
                      {METODOS_PAGO.map((m) => <option key={m} value={m}>{METODO_LABEL_MAP[m]}</option>)}
                    </select>
                  </div>
                  <div className="w-32">
                    <label className="block text-body-sm font-medium text-steel-900 mb-1">Monto</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={abonarMonto || ''}
                      onChange={(e) => setAbonarMonto(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  {abonarMetodo !== 'EFECTIVO' && (
                    <div className="flex-1 min-w-[100px]">
                      <label className="block text-body-sm font-medium text-steel-900 mb-1">Ref.</label>
                      <Input
                        placeholder="Últimos 4 / folio…"
                        value={abonarRef}
                        onChange={(e) => setAbonarRef(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                {abonarError && (
                  <p className="text-body-sm text-brand-600">{abonarError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => { setShowAbonarCuenta(false); setAbonarError(null); }}>
                    Cancelar
                  </Button>
                  <Button
                    loading={abonarLoading}
                    disabled={abonarMonto <= 0}
                    onClick={() => void onAbonarCuenta()}
                    className="bg-amber-500 hover:bg-amber-600 border-amber-500"
                  >
                    Registrar abono
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={() => { setDlgCuenta(null); setCuenta(null); setAbonarResult(null); setShowAbonarCuenta(false); }}>
                Cerrar
              </Button>
              {!abonarResult && !showAbonarCuenta && (cuenta?.cliente.saldo_pendiente ?? dlgCuenta.saldo_pendiente) > 0 && canWrite && (
                <Button
                  className="bg-amber-500 hover:bg-amber-600 border-amber-500"
                  onClick={() => {
                    setAbonarMonto(+(cuenta?.cliente.saldo_pendiente ?? dlgCuenta.saldo_pendiente).toFixed(2));
                    setAbonarError(null);
                    setShowAbonarCuenta(true);
                  }}
                >
                  Abonar a cuenta
                </Button>
              )}
              {!abonarResult && !showAbonarCuenta && (
                <Button variant="secondary" onClick={() => router.push('/ventas?estatus=CREDITO')}>
                  Ver notas en crédito
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </Dialog>

      <Dialog
        open={dlgOpen}
        onClose={() => { setDlgOpen(false); reset({}); setFormError(null); }}
        title={editTarget ? `Editar: ${editTarget.nombre}` : 'Nuevo cliente'}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Nombre <span className="text-brand-600">*</span></label>
              <Input placeholder="Juan Carlos" error={errors.nombre?.message} {...register('nombre')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Apellidos</label>
              <Input placeholder="Hernández García" {...register('apellidos')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Razón social</label>
              <Input placeholder="Empresa S.A. de C.V." {...register('razon_social')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">RFC</label>
              <Input placeholder="EMP010101ABC" className="uppercase" {...register('rfc')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Teléfono</label>
              <Input placeholder="8112345678" type="tel" {...register('telefono')} />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Correo</label>
              <Input placeholder="correo@empresa.com" type="email" error={errors.email?.message} {...register('email')} />
            </div>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Dirección</label>
            <Input placeholder="Av. Industrial 123, Monterrey, NL" {...register('direccion')} />
          </div>

          <div className="border-t border-steel-100 pt-4 space-y-4">
            {/* Tipo de precio */}
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">
                Tipo de precio
              </label>
              {preciosActivos.length === 0 ? (
                <p className="text-body-sm text-steel-400 italic">
                  No hay tipos de precio configurados. El admin debe activar al menos un precio en Configuración → Inventario.
                </p>
              ) : (
                <Select {...register('precio_num', { valueAsNumber: true })}>
                  <option value="">Sin tipo asignado</option>
                  {preciosActivos.map((p) => (
                    <option key={p.numero} value={p.numero}>{p.label}</option>
                  ))}
                </Select>
              )}
              <p className="text-meta text-steel-400 mt-1">
                El precio correspondiente se autocompletará al hacer una venta a este cliente.
              </p>
            </div>

            {/* Límite de crédito */}
            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-1.5">Límite de crédito ($)</label>
              <Input type="number" min="0" step="100" placeholder="0.00" {...register('limite_credito', { valueAsNumber: true })} />
              <p className="text-meta text-steel-400 mt-1">
                Deja en 0 si el cliente no tiene crédito asignado.
              </p>
            </div>
          </div>

          {formError && (
            <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
              <p className="text-body-sm text-brand-600">{formError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setDlgOpen(false); reset({}); setFormError(null); }}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editTarget ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
