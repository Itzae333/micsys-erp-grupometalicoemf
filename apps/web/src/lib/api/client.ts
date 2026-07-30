import { useAuthStore } from '../store/auth.store';
import { useContextoStore } from '../store/contexto.store';
import { markLoginRedirect } from '../auth/session-redirect';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

type FetchOptions = RequestInit & { skipAuth?: boolean };

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, ...fetchOptions } = options;
  const token = useAuthStore.getState().accessToken;
  const { empresa, ubicacion } = useContextoStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (empresa?.id) headers['x-empresa-id'] = empresa.id;
  if (ubicacion?.id) headers['x-ubicacion-id'] = ubicacion.id;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
    });
  } catch {
    // fetch() en sí falló (sin conexión, DNS, etc.) — no es un error del servidor
    throw new ApiError(0, 'Sin conexión');
  }

  // El access_token dura años — un 401 aquí es una señal inequívoca de que
  // ya no hay nada que renovar: la sesión fue revocada de verdad ("Cerrar
  // todas las sesiones") o el usuario fue desactivado. No hay refresh token
  // ni reintento posible, se cierra sesión directo.
  if (response.status === 401 && !skipAuth) {
    console.warn('[auth] sesión cerrada: token inválido o revocado', { path, at: new Date().toISOString() });
    useAuthStore.getState().clearAuth();
    const destino = encodeURIComponent(window.location.pathname + window.location.search);
    markLoginRedirect();
    window.location.href = `/login?motivo=sesion_expirada&redirect=${destino}`;
    throw new ApiError(401, 'Sesión expirada');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Error desconocido' }));
    const message = typeof error.message === 'string'
      ? error.message
      : Array.isArray(error.message)
        ? error.message.join(', ')
        : 'Error del servidor';
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// El access_token ya no expira solo (JWT_EXPIRES_IN largo) — la única razón
// para pegarle al servidor tras un evento local (PIN correcto, cola offline
// por vaciar) es confirmar que no fue revocado mientras el equipo estuvo
// bloqueado/desconectado (logout explícito, "Cerrar todas las sesiones", o
// el usuario fue desactivado). GET /auth/me ya hace una consulta fresca a
// BD — no hace falta un endpoint dedicado de refresh. Si sí fue revocado,
// el 401 de arriba ya dispara clearAuth + redirect; cualquier otro error
// (sin conexión, etc.) se ignora, es una verificación best-effort.
export async function checkSessionAlive(): Promise<void> {
  try {
    await apiFetch('/auth/me');
  } catch {
    // ver comentario de arriba
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Descarga de archivos (ej. reportes XLSX) — el navegador no puede mandar el
// header Authorization en una navegación/link normal, así que se pide con
// fetch autenticado y se arma un blob descargable a partir de la respuesta.
async function apiGetBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const token = useAuthStore.getState().accessToken;
  const { empresa, ubicacion } = useContextoStore.getState();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (empresa?.id) headers['x-empresa-id'] = empresa.id;
  if (ubicacion?.id) headers['x-ubicacion-id'] = ubicacion.id;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { headers });
  } catch {
    throw new ApiError(0, 'Sin conexión');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Error al descargar el archivo' }));
    throw new ApiError(response.status, error.message ?? 'Error al descargar el archivo');
  }
  const disposition = response.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="?([^"]+)"?/);
  return { blob: await response.blob(), filename: match?.[1] ?? null };
}

export const api = {
  get: <T>(path: string, options?: FetchOptions) =>
    apiFetch<T>(path, { method: 'GET', ...options }),

  getBlob: apiGetBlob,

  post: <T>(path: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    }),

  patch: <T>(path: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    }),

  put: <T>(path: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    }),

  delete: <T>(path: string, options?: FetchOptions) =>
    apiFetch<T>(path, { method: 'DELETE', ...options }),
};
