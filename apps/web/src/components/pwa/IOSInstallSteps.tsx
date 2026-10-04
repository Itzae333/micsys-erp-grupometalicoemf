'use client';

import { useState } from 'react';
import { Check, Copy, Share } from 'lucide-react';
import { cn } from '@/lib/utils';

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center text-base">
        {n}
      </span>
      <p className="text-base leading-snug text-steel-900 pt-0.5">{children}</p>
    </li>
  );
}

// Mismo aspecto que el botón de Safari, para que lo reconozcan a simple vista.
function BotonCompartir() {
  return (
    <span className="inline-flex items-center justify-center align-middle w-8 h-8 mx-0.5 rounded-md border border-steel-300 bg-white text-blue-600">
      <Share className="h-4 w-4" />
    </span>
  );
}

/** Pasos para instalar desde Safari en iPhone/iPad. Texto grande a propósito. */
export function PasosSafari({ className }: { className?: string }) {
  return (
    <ol className={cn('space-y-4', className)}>
      <Paso n={1}>
        Toca el botón <strong>Compartir</strong> <BotonCompartir /> (el cuadro con una flecha hacia arriba)
        en la barra de abajo de Safari.
        <span className="block text-sm text-steel-500 mt-1">En iPad está arriba a la derecha.</span>
      </Paso>
      <Paso n={2}>
        Desliza el menú hacia arriba y toca <strong>«Agregar a inicio»</strong>.
      </Paso>
      <Paso n={3}>
        Toca <strong>«Agregar»</strong>, arriba a la derecha. Listo: aparecerá el ícono <strong>EMF</strong> en tu
        pantalla, como cualquier otra app.
      </Paso>
    </ol>
  );
}

/** Para quien abrió el enlace en Chrome, WhatsApp, etc.: solo Safari puede instalar. */
export function AbrirEnSafari({ className }: { className?: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const url = window.location.origin + '/instalar';
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      window.prompt('Copia este enlace y pégalo en Safari:', url);
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      <p className="text-base font-semibold text-steel-900">
        Para instalar la app hay que abrirla en <span className="text-brand-600">Safari</span>
        {' '}(el navegador azul con una brújula).
      </p>
      <ol className="space-y-4">
        <Paso n={1}>Toca el botón de abajo para copiar el enlace.</Paso>
        <Paso n={2}>Abre <strong>Safari</strong>, toca la barra de arriba y pega el enlace.</Paso>
        <Paso n={3}>Sigue los pasos que te aparecerán ahí.</Paso>
      </ol>
      <button
        type="button"
        onClick={copiar}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 text-white text-base font-semibold py-3.5 active:bg-brand-700"
      >
        {copiado ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
        {copiado ? '¡Enlace copiado!' : 'Copiar enlace'}
      </button>
    </div>
  );
}
