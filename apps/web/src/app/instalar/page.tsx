'use client';

import { useInstallPWA } from '@/hooks/useInstallPWA';
import { AbrirEnSafari, PasosSafari } from '@/components/pwa/IOSInstallSteps';
import { Button } from '@/components/ui/button';

// Página pública para compartir por WhatsApp: "entra a /instalar y sigue los pasos".
export default function InstalarPage() {
  const { isIOS, isIOSSafari, isInstalled, canInstall, install } = useInstallPWA();

  return (
    <main className="min-h-screen bg-steel-50 flex items-start justify-center p-5">
      <div className="w-full max-w-md bg-white rounded-2xl border border-steel-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-3">
          <img src="/brand/grupo/apple-touch-icon.png" alt="" className="w-14 h-14 rounded-2xl" />
          <div>
            <h1 className="text-xl font-bold text-steel-900 leading-tight">Instalar GrupoMetalicoEMF</h1>
            <p className="text-sm text-steel-500">Ten la app en tu pantalla de inicio.</p>
          </div>
        </div>

        {isInstalled ? (
          <p className="text-base text-steel-900">
            ¡Ya la tienes instalada! Ábrela desde el ícono <strong>EMF</strong> de tu pantalla.
          </p>
        ) : isIOS ? (
          isIOSSafari ? <PasosSafari /> : <AbrirEnSafari />
        ) : canInstall ? (
          <Button onClick={install} className="w-full">Instalar</Button>
        ) : (
          <div className="space-y-3 text-base text-steel-900">
            <p>
              <strong>En iPhone o iPad:</strong> abre esta página en Safari y toca Compartir → «Agregar a inicio».
            </p>
            <p>
              <strong>En Android o computadora:</strong> usa Chrome y toca el botón «Instalar» que aparece en la
              barra de direcciones o en el menú ⋮.
            </p>
          </div>
        )}

        <a href="/" className="block text-center text-base text-brand-600 font-medium pt-1">
          Entrar al sistema
        </a>
      </div>
    </main>
  );
}
