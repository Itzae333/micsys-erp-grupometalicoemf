'use client';

import { useEffect } from 'react';
import { useContextoStore } from '@/lib/store/contexto.store';
import { refreshArticulosCacheIfStale } from '@/lib/db/articulos-cache';
import { getClientesCache } from '@/lib/db/clientes-cache';

/**
 * Envuelve el contenido de cada página con una `key` derivada de
 * empresa/ubicación. Las páginas cargan sus datos en useEffect(() => {}, [])
 * sin depender del contexto, así que cambiar de empresa/ubicación no las
 * refrescaba solo — al cambiar la key, React desmonta y vuelve a montar
 * la página completa, forzando que vuelvan a pedir los datos frescos.
 */
export function ContextKeyedMain({ children }: { children: React.ReactNode }) {
  const { empresa, ubicacion } = useContextoStore();

  // Precarga en segundo plano el catálogo de artículos y clientes en Dexie
  // para que la búsqueda offline de "Venta rápida" tenga algo que encontrar
  // aunque el cajero nunca haya abierto esa pantalla estando conectado.
  useEffect(() => {
    if (!empresa?.id || !ubicacion?.id || !navigator.onLine) return;
    void refreshArticulosCacheIfStale(empresa.id, ubicacion.id).catch(() => {});
    void getClientesCache(empresa.id, ubicacion.id).catch(() => {});
  }, [empresa?.id, ubicacion?.id]);

  return (
    <main
      key={`${empresa?.id ?? 'sin-empresa'}:${ubicacion?.id ?? 'sin-ubicacion'}`}
      className="flex-1 overflow-y-auto"
    >
      {children}
    </main>
  );
}
