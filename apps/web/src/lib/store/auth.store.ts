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
  // true = sesión bloqueada localmente ("Cerrar sesión" de cada turno) — a
  // diferencia de clearAuth(), NO borra usuario/accessToken, así se puede
  // reanudar sin internet con el PIN offline (ver lib/offline/pin.ts).
  locked: boolean;
  setAuth: (usuario: UsuarioSesion, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  lock: () => void;
  unlock: () => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      usuario: null,
      accessToken: null,
      locked: false,

      setAuth: (usuario, accessToken) => set({ usuario, accessToken, locked: false }),

      setAccessToken: (accessToken) => set({ accessToken }),

      lock: () => set({ locked: true }),

      unlock: () => set({ locked: false }),

      clearAuth: () => set({ usuario: null, accessToken: null, locked: false }),

      isAuthenticated: () => !!get().accessToken && !!get().usuario && !get().locked,
    }),
    {
      name: 'emf-auth',
      partialize: (state) => ({
        usuario: state.usuario,
        accessToken: state.accessToken,
        locked: state.locked,
      }),
    },
  ),
);
