import Dexie, { type EntityTable } from 'dexie';

// ── Sync Queue ──────────────────────────────────────────────────────────────

export type SyncStatus = 'pending' | 'processing' | 'error' | 'done';
export type HttpMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SyncQueueItem {
  id?: number;
  createdAt: Date;
  status: SyncStatus;
  method: HttpMethod;
  url: string;
  body: string;       // JSON serializado del payload
  retries: number;
  lastError?: string;
  httpStatus?: number; // status HTTP de la última respuesta (ej. 422 = rechazo de negocio)
  empresaId: string;
  ubicacionId: string;
  accessToken: string; // snapshot del token al encolar
}

// ── Caché de artículos (catálogo para búsqueda offline) ────────────────────

export interface ArticuloCache {
  id: string;
  empresaId: string;
  ubicacionId: string;
  clave: string;
  nombre: string;
  payload: string;  // JSON completo del artículo
  cachedAt: Date;
}

// ── Caché de config columnas ───────────────────────────────────────────────

export interface ConfigColumnasCache {
  id: string;        // `${empresaId}:${ubicacionId}`
  empresaId: string;
  ubicacionId: string;
  schema: string;    // JSON del ConfigColumnasSchema
  cachedAt: Date;
}

// ── Caché de clientes (para elegir cliente de crédito estando offline) ────

export interface ClienteCacheItem {
  id: string;         // `${empresaId}:${ubicacionId}:list` — un solo registro con la lista completa
  empresaId: string;
  ubicacionId: string;
  payload: string;     // JSON de Cliente[]
  cachedAt: Date;
}

// ── Ventas creadas offline, pendientes de sincronizar ──────────────────────

export type VentaPendienteSyncStatus = 'queued' | 'synced' | 'failed';

export interface VentaPendiente {
  clientRef: string;   // PK — mismo UUID enviado como `client_ref` a /ventas/rapida
  empresaId: string;
  ubicacionId: string;
  createdAt: Date;
  usuarioId: string;
  clienteId: string | null;
  clienteNombre: string | null;
  lineas: string;       // JSON: { articulo_id, clave, descripcion, cantidad, precio_unitario, descuento, subtotal }[]
  subtotal: number;
  total: number;
  tipoCierre: 'PAGADA' | 'CREDITO' | 'PENDIENTE';
  pagos: string;        // JSON: { metodo, monto, referencia? }[]
  syncStatus: VentaPendienteSyncStatus;
  syncQueueId?: number; // FK a syncQueue.id
  folioLocal: number;   // contador local para folio provisional ("OFFLINE-3")
  lastError?: string;
}

// ── PIN de acceso sin conexión (bloquea/reanuda sesión ya autenticada) ─────

export interface OfflinePin {
  usuarioId: string;   // PK
  hash: string;        // base64 del digest PBKDF2
  salt: string;         // base64
  iterations: number;
  failedAttempts: number;
  lockedUntil: Date | null;   // bloqueo temporal tras varios intentos fallidos
  expiresAt: Date;      // si ya pasó, el PIN deja de aceptar (exige reconectar)
  createdAt: Date;
}

// ── Snapshot de sesión por usuario (para alternar usuarios sin conexión) ───

export interface OfflineSession {
  usuarioId: string;   // PK
  email: string;        // indexado — se busca por correo desde /login sin red
  usuario: string;       // JSON de UsuarioSesion completo
  accessToken: string;   // último access token conocido (se refresca al reconectar)
  savedAt: Date;
}

// ── Definición de la base de datos ────────────────────────────────────────

export class EmfDatabase extends Dexie {
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  articulosCache!: EntityTable<ArticuloCache, 'id'>;
  configColumnasCache!: EntityTable<ConfigColumnasCache, 'id'>;
  clientesCache!: EntityTable<ClienteCacheItem, 'id'>;
  ventasPendientes!: EntityTable<VentaPendiente, 'clientRef'>;
  offlinePin!: EntityTable<OfflinePin, 'usuarioId'>;
  offlineSessions!: EntityTable<OfflineSession, 'usuarioId'>;

  constructor() {
    super('emf-v1');

    this.version(1).stores({
      // syncQueue: índices para consultas por status y empresa
      syncQueue: '++id, status, empresaId, ubicacionId, createdAt',
      // articulosCache: índice compuesto para búsqueda por empresa+ubicación
      articulosCache: 'id, empresaId, ubicacionId, clave, cachedAt',
      // configColumnasCache: PK compuesta empresa:ubicacion
      configColumnasCache: 'id, empresaId, ubicacionId, cachedAt',
    });

    this.version(2).stores({
      syncQueue: '++id, status, empresaId, ubicacionId, createdAt',
      articulosCache: 'id, empresaId, ubicacionId, clave, cachedAt',
      configColumnasCache: 'id, empresaId, ubicacionId, cachedAt',
      clientesCache: 'id, empresaId, ubicacionId, cachedAt',
      ventasPendientes: 'clientRef, empresaId, ubicacionId, syncStatus, createdAt',
    });

    this.version(3).stores({
      syncQueue: '++id, status, empresaId, ubicacionId, createdAt',
      articulosCache: 'id, empresaId, ubicacionId, clave, cachedAt',
      configColumnasCache: 'id, empresaId, ubicacionId, cachedAt',
      clientesCache: 'id, empresaId, ubicacionId, cachedAt',
      ventasPendientes: 'clientRef, empresaId, ubicacionId, syncStatus, createdAt',
      offlinePin: 'usuarioId',
    });

    this.version(4).stores({
      syncQueue: '++id, status, empresaId, ubicacionId, createdAt',
      articulosCache: 'id, empresaId, ubicacionId, clave, cachedAt',
      configColumnasCache: 'id, empresaId, ubicacionId, cachedAt',
      clientesCache: 'id, empresaId, ubicacionId, cachedAt',
      ventasPendientes: 'clientRef, empresaId, ubicacionId, syncStatus, createdAt',
      offlinePin: 'usuarioId',
      offlineSessions: 'usuarioId, email',
    });
  }
}

export const emfDb = new EmfDatabase();
