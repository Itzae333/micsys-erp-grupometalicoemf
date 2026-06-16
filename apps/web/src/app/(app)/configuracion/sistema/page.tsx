'use client';

import { useState } from 'react';
import { Database, Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth.store';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export default function SistemaPage() {
  const { accessToken } = useAuthStore();
  const [downloading, setDownloading] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function doBackup() {
    setDownloading(true);
    setError(null);
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
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setDownloading(false);
    }
  }

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

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
            <p className="text-body-sm text-red-700">{error}</p>
          </div>
        )}

        <Button
          onClick={() => void doBackup()}
          disabled={downloading}
          size="sm"
        >
          <Download className={`h-3.5 w-3.5 mr-1.5 ${downloading ? 'animate-bounce' : ''}`} />
          {downloading ? 'Generando backup…' : 'Descargar backup'}
        </Button>
      </div>
    </div>
  );
}
