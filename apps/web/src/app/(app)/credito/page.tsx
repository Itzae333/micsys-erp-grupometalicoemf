'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { CuentaClienteResumen } from '@/lib/types/api';
import { EmptyState } from '@/components/ui/empty-state';

export default function CreditoPage() {
  const router = useRouter();
  const [cuentas, setCuentas] = useState<CuentaClienteResumen[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<CuentaClienteResumen[]>('/cuentas')
      .then(setCuentas)
      .catch(() => setCuentas([]))
      .finally(() => setLoading(false));
  }, []);

  const totalSaldo = cuentas.reduce((s, c) => s + c.saldo_pendiente, 0);

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-eyebrow text-steel-400 tracking-[2px] uppercase mb-0.5">Finanzas</p>
          <h1 className="text-display-md font-bold text-steel-900">Crédito a clientes</h1>
        </div>
        {!loading && cuentas.length > 0 && (
          <div className="text-right">
            <p className="text-body-sm text-steel-400">Total pendiente</p>
            <p className="text-display-sm font-bold text-brand-600">${totalSaldo.toFixed(2)}</p>
          </div>
        )}
      </div>

      {!loading && cuentas.length > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 flex items-center gap-3 mb-5">
          <AlertTriangle className="h-4 w-4 text-brand-600 flex-shrink-0" />
          <p className="text-body-sm text-brand-700">
            {cuentas.length} {cuentas.length === 1 ? 'cliente tiene' : 'clientes tienen'} saldo pendiente por cobrar.
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-steel-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : cuentas.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-8 w-8" />}
          title="Sin cuentas pendientes"
          description="Todos los clientes están al corriente en sus pagos."
        />
      ) : (
        <div className="space-y-2">
          {cuentas.map((c) => {
            const nombre = c.razon_social ?? `${c.nombre} ${c.apellidos ?? ''}`.trim();
            const porcentaje = c.limite_credito > 0
              ? Math.min(100, (c.saldo_pendiente / c.limite_credito) * 100)
              : 0;
            const sobreLimite = c.limite_credito > 0 && c.saldo_pendiente > c.limite_credito;

            return (
              <button
                key={c.id}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={() => router.push(`/credito/${c.id}` as any)}
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-white border border-steel-200 rounded-xl hover:border-steel-300 hover:shadow-sm transition-all text-left"
              >
                <div className="w-10 h-10 rounded-full bg-steel-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-steel-700 font-bold text-body">{nombre.charAt(0).toUpperCase()}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-body font-semibold text-steel-900 truncate">{nombre}</p>
                    <p className={`text-body font-bold flex-shrink-0 ${sobreLimite ? 'text-red-600' : 'text-steel-900'}`}>
                      ${c.saldo_pendiente.toFixed(2)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <p className="text-body-sm text-steel-400 truncate">
                      {'Crédito'}{c.telefono ? ` · ${c.telefono}` : ''}
                    </p>
                    {c.limite_credito > 0 && (
                      <p className="text-meta text-steel-400 flex-shrink-0">
                        límite ${c.limite_credito.toFixed(2)}
                      </p>
                    )}
                  </div>

                  {c.limite_credito > 0 && (
                    <div className="mt-1.5 h-1 bg-steel-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${sobreLimite ? 'bg-red-500' : porcentaje > 80 ? 'bg-amber-400' : 'bg-brand-500'}`}
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
