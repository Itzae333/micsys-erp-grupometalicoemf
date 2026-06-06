'use client';

import { Download, X } from 'lucide-react';
import { useState } from 'react';
import { useInstallPWA } from '@/hooks/useInstallPWA';
import { Button } from '@/components/ui/button';

export function InstallPWABanner() {
  const { canInstall, install } = useInstallPWA();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="bg-steel-900 text-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-[10px]">EMF</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-semibold">Instalar GrupoMetalicoEMF</p>
          <p className="text-meta text-steel-400">Acceso rápido y modo sin conexión</p>
        </div>
        <Button size="sm" onClick={install} className="flex-shrink-0">
          <Download className="h-3.5 w-3.5 mr-1" />
          Instalar
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="text-steel-500 hover:text-white transition-colors flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
