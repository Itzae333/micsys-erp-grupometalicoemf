import { useAuthStore } from '../store/auth.store';
import { useContextoStore } from '../store/contexto.store';
import { bumpExpiry } from '../offline/pin';
import { saveSessionSnapshot } from '../offline/session-cache';

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
    console.warn('[auth] sesión cerrada: el servidor rechazó el refresh token', { path, at: new Date().toISOString() });
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    useAuthStore.getState().clearAuth();
    const destino = encodeURIComponent(window.location.pathname + window.location.search);
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

type RefreshResult = { ok: true } | { ok: false; reason: 'network' | 'rejected' };

// El refresh token rota en cada uso (se revoca el anterior) — si dos requests en
// paralelo reciben 401 al mismo tiempo, solo la primera renovación debe pegarle al
// servidor; el resto debe esperar ese mismo resultado en vez de reintentar con la
// cookie ya revocada, o el servidor rechaza la segunda y se cierra la sesión sin motivo real.
let refreshPromise: Promise<RefreshResult> | null = null;

// Exportada para que sync-queue.ts pueda forzar un token fresco antes de
// reproducir la cola offline (un token snapshoteado hace días ya está vencido).
export function refreshAccessToken(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = refreshAcrossTabs().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

const REFRESH_LOCK_NAME = 'micsys-auth-refresh';

// El mismo usuario puede tener la pestaña del navegador Y la PWA instalada
// abiertas a la vez (mismo origen, mismas cookies) — ambas calculan el mismo
// momento para renovar el token y, sin coordinarse, pueden pegarle al
// servidor casi al mismo tiempo. Como el refresh token rota en cada uso (el
// anterior se revoca), la segunda en llegar recibe un rechazo real aunque la
// sesión esté sana, y esa pestaña cierra sesión sin motivo. El Web Lock
// serializa el refresh entre pestañas del mismo navegador; la que pierde la
// carrera revisa si la otra ya la refrescó (ver el listener de `storage` más
// abajo) antes de intentar su propio refresh con un token ya rotado.
async function refreshAcrossTabs(): Promise<RefreshResult> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return doRefresh();
  }
  return navigator.locks.request(REFRESH_LOCK_NAME, async () => {
    const current = useAuthStore.getState().accessToken;
    if (current) {
      const expiryMs = getTokenExpiryMs(current);
      if (expiryMs !== null && expiryMs - Date.now() > SAFETY_MARGIN_MS) {
        return { ok: true };
      }
    }
    return doRefresh();
  });
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
  // El refresh_token real sigue vivo — se extiende la vigencia del PIN offline
  // en la misma medida, y se refresca el snapshot cacheado (ver lib/offline/).
  const usuarioActivo = useAuthStore.getState().usuario;
  if (usuarioActivo) {
    void bumpExpiry(usuarioActivo.id);
    void saveSessionSnapshot(usuarioActivo, data.access_token);
  }
  return { ok: true };
}

// ── Refresh proactivo ───────────────────────────────────────
// El access token dura poco (JWT_EXPIRES_IN) y el refresh de arriba es
// reactivo (solo corre cuando una petición ya regresó 401, es decir, cuando
// el token YA expiró). En uso activo eso puede sentirse como que "se cierra
// solo": dos peticiones casi simultáneas justo al expirar, un refresh que
// tarda, un timer de fondo suspendido en una tablet, etc. Para que sea
// invisible, se renueva solo un poco ANTES de expirar, y el 401 de arriba
// queda solo como respaldo si este timer llegara a fallar/perderse.
const SAFETY_MARGIN_MS = 2 * 60 * 1000; // renovar 2 min antes de expirar
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

// Decodifica el `exp` real del JWT (segundo segmento, base64url) en vez de
// asumir una duración fija — sigue funcionando aunque JWT_EXPIRES_IN cambie.
function getTokenExpiryMs(token: string): number | null {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function scheduleProactiveRefresh(token: string) {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  const expiryMs = getTokenExpiryMs(token);
  if (expiryMs === null) return; // sin exp decodificable, se depende solo del respaldo reactivo
  const delay = Math.max(expiryMs - Date.now() - SAFETY_MARGIN_MS, 0);
  refreshTimer = setTimeout(() => { void triggerProactiveRefresh(); }, delay);
}

async function triggerProactiveRefresh() {
  const result = await refreshAccessToken();
  // Si sale bien, setAccessToken ya disparó (vía el subscribe de abajo) una
  // reprogramación del timer con la nueva expiración — no hay que hacer nada más.
  // Si falla por red, se reintenta pronto (no hay una petición del usuario que lo reintente sola).
  if (!result.ok && result.reason === 'network') {
    refreshTimer = setTimeout(() => { void triggerProactiveRefresh(); }, 30_000);
  }
  // Si fue rechazado de verdad, no se hace nada aquí — la siguiente petición
  // real del usuario pegará el 401 y seguirá el flujo de cierre de sesión ya existente.
}

if (typeof window !== 'undefined') {
  const initialToken = useAuthStore.getState().accessToken;
  if (initialToken) scheduleProactiveRefresh(initialToken);

  useAuthStore.subscribe((state, prevState) => {
    if (state.accessToken === prevState.accessToken) return;
    if (state.accessToken) {
      scheduleProactiveRefresh(state.accessToken);
    } else if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  });

  // Cuando otra pestaña/PWA del mismo navegador renueva el token, Zustand
  // persist ya lo escribió en localStorage — este evento solo llega a las
  // OTRAS pestañas (no a la que hizo el cambio), así que sirve para que se
  // enteren sin tener que esperar su propio timer ni pegarle al servidor.
  window.addEventListener('storage', (e) => {
    if (e.key !== 'emf-auth' || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as { state?: { accessToken?: string | null } };
      const newToken = parsed.state?.accessToken;
      if (newToken && newToken !== useAuthStore.getState().accessToken) {
        useAuthStore.getState().setAccessToken(newToken);
      }
    } catch {
      // Payload inesperado en localStorage — se ignora, el respaldo reactivo cubre el resto.
    }
  });

  // Las tablets/navegadores pueden suspender setTimeout en segundo plano —
  // al regresar a la pestaña, se corrige de inmediato en vez de esperar un
  // timer que pudo haberse perdido.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    const expiryMs = getTokenExpiryMs(token);
    if (expiryMs === null || expiryMs - Date.now() <= SAFETY_MARGIN_MS) {
      void triggerProactiveRefresh();
    } else {
      scheduleProactiveRefresh(token);
    }
  });
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
