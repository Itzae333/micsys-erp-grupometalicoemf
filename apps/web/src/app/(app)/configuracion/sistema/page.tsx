'use client';

import { useState } from 'react';
import { Database, Download, AlertTriangle, Trash2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/store/auth.store';
import { api } from '@/lib/api/client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type ResetResult = {
  ok: boolean;
  eliminados: Record<string, number>;
};

export default function SistemaPage() {
  const { accessToken } = useAuthStore();
  const [downloading, setDownloading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Reset parcial
  const [dlgReset, setDlgReset] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  async function doBackup() {
    setDownloading(true);
    setBackupError(null);
    try {
      const res = await fetch(`${BASE_URL}/admin/backup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      const blob     = await res.blob();
      const filename = res.headers.get('Content-Disposition')
        ?.match(/filename="([^"]+)"/)?.[1] ?? 'micsys-backup.dump';
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setDownloading(false);
    }
  }

  async function doReset() {
    if (confirmText !== 'RESET') return;
    setResetting(true);
    setResetError(null);
    try {
      const result = await api.post<ResetResult>('/admin/reset-parcial', {});
      setResetResult(result);
      setConfirmText('');
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Error al ejecutar reset');
    } finally {
      setResetting(false);
    }
  }

  function closeReset() {
    setDlgReset(false);
    setConfirmText('');
    setResetError(null);
    setResetResult(null);
  }

  const totalEliminados = resetResult
    ? Object.values(resetResult.eliminados).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-steel-100 flex items-center justify-center">
          <Database className="h-5 w-5 text-steel-600" />
        </div>
        <div>
          <h1 className="text-display-sm font-bold text-steel-900">Sistema</h1>
          <p className="text-body-sm text-steel-500">Herramientas avanzadas — solo SUPER_USUARIO</p>
        </div>
      </div>

      {/* Backup */}
      <div className="bg-white border border-steel-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Download className="h-5 w-5 text-steel-500 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="text-body font-semibold text-steel-900">Backup de base de datos</h2>
            <p className="text-body-sm text-steel-500 mt-1">
              Genera un dump de PostgreSQL en formato custom (<code className="bg-steel-100 px-1 rounded text-meta">.dump</code>).
              Requiere que <code className="bg-steel-100 px-1 rounded text-meta">pg_dump</code> esté instalado en el servidor.
            </p>
            <p className="text-meta text-steel-400 mt-1">
              Para restaurar: <code className="bg-steel-100 px-1 rounded text-meta">pg_restore -d &lt;dbname&gt; archivo.dump</code>
            </p>
          </div>
        </div>
        {backupError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
            <p className="text-body-sm text-red-700">{backupError}</p>
          </div>
        )}
        <Button onClick={() => void doBackup()} disabled={downloading} size="sm">
          <Download className={`h-3.5 w-3.5 mr-1.5 ${downloading ? 'animate-bounce' : ''}`} />
          {downloading ? 'Generando backup…' : 'Descargar backup'}
        </Button>
      </div>

      {/* Reset parcial */}
      <div className="bg-white border-2 border-red-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="text-body font-semibold text-red-700">Reset parcial de datos operativos</h2>
            <p className="text-body-sm text-steel-600 mt-1">
              Borra permanentemente todos los datos operativos y deja el sistema listo para producción real.
              <strong className="text-steel-800"> No se puede deshacer.</strong>
            </p>
            <div className="mt-3 space-y-1">
              <p className="text-meta font-semibold text-red-600 uppercase tracking-wide">Se elimina:</p>
              <p className="text-meta text-steel-600">Clientes · Artículos · Ventas · Pedidos · Remisiones · Compras · Movimientos de inventario · Cuentas por cobrar</p>
              <p className="text-meta font-semibold text-green-700 uppercase tracking-wide mt-2">Se conserva:</p>
              <p className="text-meta text-steel-600">Empresas · Ubicaciones · Usuarios · Configuración de columnas y precios · Proveedores · Empleados · Historial legacy</p>
            </div>
          </div>
        </div>
        <Button
          onClick={() => setDlgReset(true)}
          className="bg-red-600 hover:bg-red-700 border-red-600 text-white"
          size="sm"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Reset parcial…
        </Button>
      </div>

      {/* Dialog confirmación reset */}
      <Dialog
        open={dlgReset}
        onClose={closeReset}
        title="Confirmar reset parcial"
        size="md"
      >
        {resetResult ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <p className="text-body-sm text-green-700 font-semibold">
                Reset completado — {totalEliminados.toLocaleString('es-MX')} registros eliminados
              </p>
            </div>
            <div className="border border-steel-200 rounded-xl overflow-hidden">
              <table className="w-full text-body-sm">
                <tbody>
                  {Object.entries(resetResult.eliminados).map(([key, count]) => (
                    <tr key={key} className="border-b border-steel-50 last:border-0">
                      <td className="px-3 py-1.5 text-steel-600 capitalize">{key.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-steel-800">{count.toLocaleString('es-MX')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button onClick={closeReset}>Cerrar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-body-sm font-semibold text-red-800">Esta acción es irreversible</p>
                <p className="text-body-sm text-red-700">
                  Se borrarán permanentemente todos los clientes, artículos, ventas, pedidos, remisiones, compras y movimientos de inventario de <strong>todas las empresas</strong>.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-body-sm font-medium text-steel-900 mb-2">
                Escribe <code className="bg-steel-100 px-1.5 py-0.5 rounded font-bold text-red-700">RESET</code> para confirmar:
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESET"
                className="font-mono uppercase"
                autoComplete="off"
              />
            </div>

            {resetError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-body-sm text-red-700">{resetError}</p>
              </div>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={closeReset} disabled={resetting}>
                Cancelar
              </Button>
              <Button
                onClick={() => void doReset()}
                loading={resetting}
                disabled={confirmText !== 'RESET' || resetting}
                className="bg-red-600 hover:bg-red-700 border-red-600 text-white disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Ejecutar reset
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>
    </div>
  );
}
