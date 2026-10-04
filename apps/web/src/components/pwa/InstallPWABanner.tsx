'use client';

import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useInstallPWA } from '@/hooks/useInstallPWA';
import { Button } from '@/components/ui/button';
import { AbrirEnSafari, PasosSafari } from './IOSInstallSteps';

const DISMISS_KEY = 'emf_ios_install_dismissed_at';
const DISMISS_DAYS = 14;

export function InstallPWABanner() {
  const { canInstall, install, isIOS, isIOSSafari, isInstalled } = useInstallPWA();
  const [dismissed, setDismissed] = useState(false);
  const [iosOculto, setIosOculto] = useState(true);

  // En iOS no hay botón de instalar: mostramos la guía, y si el usuario la cierra
  // no se vuelve a mostrar por un tiempo (se puede volver a ver en /instalar).
  useEffect(() => {
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      setIosOculto(Date.now() - t < DISMISS_DAYS * 24 * 60 * 60 * 1000);
    } catch {
      setIosOculto(false);
    }
  }, []);

  function cerrarIOS() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sin storage */ }
    setIosOculto(true);
  }

  if (isIOS && !isInstalled) {
    if (iosOculto) return null;
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3">
        <div className="mx-auto max-w-md bg-white rounded-2xl shadow-2xl border border-steel-200 p-5 max-h-[85vh] overflow-y-auto">
          <div className="flex items-start gap-3 mb-4">
            <img src="/brand/grupo/apple-touch-icon.png" alt="" className="w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="flex-1">
              <p className="text-lg font-bold text-steel-900 leading-tight">Instala la app en tu iPhone</p>
              <p className="text-sm text-steel-500">Entra más rápido, sin escribir la dirección.</p>
            </div>
            <button onClick={cerrarIOS} className="text-steel-400 p-1" aria-label="Cerrar">
              <X className="h-6 w-6" />
            </button>
          </div>
          {isIOSSafari ? <PasosSafari /> : <AbrirEnSafari />}
          <button onClick={cerrarIOS} className="mt-4 w-full text-base text-steel-500 py-2">
            Ahora no
          </button>
        </div>
      </div>
    );
  }

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
          aria-label="Descartar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
