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
  empresaId: string;
  ubicacionId: string;
  accessToken: string; // snapshot del token al encolar
}

// ── Caché de artículos (placeholder Fase 2) ────────────────────────────────

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

// ── Definición de la base de datos ────────────────────────────────────────

export class EmfDatabase extends Dexie {
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  articulosCache!: EntityTable<ArticuloCache, 'id'>;
  configColumnasCache!: EntityTable<ConfigColumnasCache, 'id'>;

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
  }
}

export const emfDb = new EmfDatabase();
