import { useAuthStore } from '../store/auth.store';
import { useContextoStore } from '../store/contexto.store';

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

  // Auto-refresh si el token expiró
  if (response.status === 401 && !skipAuth) {
    const refreshResult = await refreshAccessToken();
    if (refreshResult.ok) {
      headers['Authorization'] = `Bearer ${useAuthStore.getState().accessToken}`;
      let retryResponse: Response;
      try {
        retryResponse = await fetch(`${BASE_URL}${path}`, {
          ...fetchOptions,
          headers,
        });
      } catch {
        throw new ApiError(0, 'Sin conexión');
      }
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ message: 'Error desconocido' }));
        throw new ApiError(retryResponse.status, error.message ?? 'Error del servidor');
      }
      return retryResponse.json() as Promise<T>;
    }
    if (refreshResult.reason === 'network') {
      // No se pudo renovar la sesión por falta de conexión — no es una sesión
      // realmente expirada, así que no se cierra sesión ni se redirige.
      throw new ApiError(0, 'Sin conexión — no se pudo renovar la sesión');
    }
    // El servidor respondió que el refresh token es inválido/expirado — sesión realmente terminada.
    useAuthStore.getState().clearAuth();
    window.location.href = '/login';
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

type RefreshResult = { ok: true } | { ok: false; reason: 'network' | 'rejected' };

// El refresh token rota en cada uso (se revoca el anterior) — si dos requests en
// paralelo reciben 401 al mismo tiempo, solo la primera renovación debe pegarle al
// servidor; el resto debe esperar ese mismo resultado en vez de reintentar con la
// cookie ya revocada, o el servidor rechaza la segunda y se cierra la sesión sin motivo real.
let refreshPromise: Promise<RefreshResult> | null = null;

function refreshAccessToken(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh(): Promise<RefreshResult> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // La llamada de red falló (sin conexión) — no significa que el refresh token sea inválido.
    return { ok: false, reason: 'network' };
  }
  if (!response.ok) {
    // El servidor respondió: el refresh token es genuinamente inválido/expirado.
    return { ok: false, reason: 'rejected' };
  }
  const data = await response.json() as { access_token: string };
  useAuthStore.getState().setAccessToken(data.access_token);
  return { ok: true };
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

export const api = {
  get: <T>(path: string, options?: FetchOptions) =>
    apiFetch<T>(path, { method: 'GET', ...options }),

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
