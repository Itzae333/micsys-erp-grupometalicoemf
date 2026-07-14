'use client';

import { useContextoStore } from '@/lib/store/contexto.store';

/**
 * Envuelve el contenido de cada página con una `key` derivada de
 * empresa/ubicación. Las páginas cargan sus datos en useEffect(() => {}, [])
 * sin depender del contexto, así que cambiar de empresa/ubicación no las
 * refrescaba solo — al cambiar la key, React desmonta y vuelve a montar
 * la página completa, forzando que vuelvan a pedir los datos frescos.
 */
export function ContextKeyedMain({ children }: { children: React.ReactNode }) {
  const { empresa, ubicacion } = useContextoStore();

  return (
    <main
      key={`${empresa?.id ?? 'sin-empresa'}:${ubicacion?.id ?? 'sin-ubicacion'}`}
      className="flex-1 overflow-y-auto"
    >
      {children}
    </main>
  );
}
