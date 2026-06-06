import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type RolUsuario =
  | 'SUPER_USUARIO'
  | 'ADMIN'
  | 'ENCARGADO'
  | 'VENDEDOR'
  | 'ALMACENISTA'
  | 'JEFE_MANUFACTURA'
  | 'JEFE_RH';

export interface UsuarioSesion {
  id: string;
  nombre: string;
  apellidos: string;
  email: string;
  rol: RolUsuario;
  empresa_id: string;
  ubicacion_ids: string[];
}

interface AuthState {
  usuario: UsuarioSesion | null;
  accessToken: string | null;
  setAuth: (usuario: UsuarioSesion, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      usuario: null,
      accessToken: null,

      setAuth: (usuario, accessToken) => set({ usuario, accessToken }),

      setAccessToken: (accessToken) => set({ accessToken }),

      clearAuth: () => set({ usuario: null, accessToken: null }),

      isAuthenticated: () => !!get().accessToken && !!get().usuario,
    }),
    {
      name: 'emf-auth',
      partialize: (state) => ({
        usuario: state.usuario,
        // No persistimos el token — lo refrescamos al cargar
      }),
    },
  ),
);
