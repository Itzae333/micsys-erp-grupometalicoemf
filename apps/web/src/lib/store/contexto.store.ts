import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface EmpresaContexto {
  id: string;
  nombre: string;
  logo_url?: string | null;
}

export interface UbicacionContexto {
  id: string;
  nombre: string;
  tipo: 'MATRIZ' | 'FABRICA' | 'PUNTO_VENTA';
}

interface ContextoState {
  empresa: EmpresaContexto | null;
  ubicacion: UbicacionContexto | null;
  setEmpresa: (empresa: EmpresaContexto) => void;
  setUbicacion: (ubicacion: UbicacionContexto) => void;
  setContexto: (empresa: EmpresaContexto, ubicacion: UbicacionContexto) => void;
  clearContexto: () => void;
}

export const useContextoStore = create<ContextoState>()(
  persist(
    (set) => ({
      empresa: null,
      ubicacion: null,

      setEmpresa: (empresa) => set({ empresa }),
      setUbicacion: (ubicacion) => set({ ubicacion }),

      setContexto: (empresa, ubicacion) => set({ empresa, ubicacion }),

      clearContexto: () => set({ empresa: null, ubicacion: null }),
    }),
    {
      name: 'emf-contexto',
    },
  ),
);
