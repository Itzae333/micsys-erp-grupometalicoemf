import { emfDb } from '../db/emf-db';
import type { UsuarioSesion } from '../store/auth.store';

// Snapshot de sesión por usuario en este equipo — permite alternar entre
// varios usuarios ya autenticados (ej. terminal compartido por dos
// vendedores) sin conexión, cada uno con su propio PIN (ver pin.ts).

export async function saveSessionSnapshot(usuario: UsuarioSesion, accessToken: string): Promise<void> {
  await emfDb.offlineSessions.put({
    usuarioId: usuario.id,
    email: usuario.email,
    usuario: JSON.stringify(usuario),
    accessToken,
    savedAt: new Date(),
  });
}

export interface CachedUser {
  usuarioId: string;
  usuario: UsuarioSesion;
  accessToken: string;
  savedAt: Date;
}

function parse(row: { usuarioId: string; usuario: string; accessToken: string; savedAt: Date }): CachedUser {
  return {
    usuarioId: row.usuarioId,
    usuario: JSON.parse(row.usuario) as UsuarioSesion,
    accessToken: row.accessToken,
    savedAt: row.savedAt,
  };
}

export async function getSessionSnapshot(usuarioId: string): Promise<CachedUser | undefined> {
  const row = await emfDb.offlineSessions.get(usuarioId);
  return row ? parse(row) : undefined;
}

export async function getSessionSnapshotByEmail(email: string): Promise<CachedUser | undefined> {
  const row = await emfDb.offlineSessions.where('email').equals(email).first();
  return row ? parse(row) : undefined;
}

export async function listCachedUsers(excludeUsuarioId?: string): Promise<CachedUser[]> {
  const rows = await emfDb.offlineSessions.toArray();
  return rows
    .filter((r) => r.usuarioId !== excludeUsuarioId)
    .map(parse)
    .sort((a, b) => a.usuario.nombre.localeCompare(b.usuario.nombre));
}

export async function deleteSessionSnapshot(usuarioId: string): Promise<void> {
  await emfDb.offlineSessions.delete(usuarioId);
}
