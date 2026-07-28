import { emfDb } from '../db/emf-db';

// PIN de acceso sin conexión: reabre localmente una sesión que ya fue válida
// online (ver auth.store.ts `lock()`/`unlock()`) — nunca crea una sesión
// nueva por sí solo. El PIN nunca se guarda en claro, solo su hash PBKDF2.

const ITERATIONS = 150_000;
const PIN_LENGTH = 6;
const VIGENCIA_DIAS = 7;
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 5 * 60 * 1000;

function randomBytes(len: number): Uint8Array {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

function toBase64(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = '';
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return toBase64(bits);
}

// Comparación en tiempo constante — no crítico contra un atacante remoto (el
// PIN nunca viaja por red), pero es buena práctica no dar pistas por timing.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isPinFormatValid(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export { PIN_LENGTH };

export async function hasPin(usuarioId: string): Promise<boolean> {
  const row = await emfDb.offlinePin.get(usuarioId);
  return !!row;
}

export async function setPin(usuarioId: string, pin: string): Promise<void> {
  if (!isPinFormatValid(pin)) {
    throw new Error(`El PIN debe tener ${PIN_LENGTH} dígitos`);
  }
  const salt = randomBytes(16);
  const hash = await derive(pin, salt, ITERATIONS);
  await emfDb.offlinePin.put({
    usuarioId,
    hash,
    salt: toBase64(salt),
    iterations: ITERATIONS,
    failedAttempts: 0,
    lockedUntil: null,
    expiresAt: new Date(Date.now() + VIGENCIA_DIAS * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  });
}

export async function clearPin(usuarioId: string): Promise<void> {
  await emfDb.offlinePin.delete(usuarioId);
}

// Extiende la vigencia otros 7 días — se llama tras cada login o refresh de
// token exitosos, para que la ventana ruede igual que el refresh_token real.
export async function bumpExpiry(usuarioId: string): Promise<void> {
  const row = await emfDb.offlinePin.get(usuarioId);
  if (!row) return;
  await emfDb.offlinePin.update(usuarioId, {
    expiresAt: new Date(Date.now() + VIGENCIA_DIAS * 24 * 60 * 60 * 1000),
  });
}

export type VerifyPinResult =
  | { ok: true }
  | { ok: false; reason: 'sin-pin' | 'expirado' | 'bloqueado' | 'incorrecto'; lockedUntil?: Date };

export async function verifyPin(usuarioId: string, pin: string): Promise<VerifyPinResult> {
  const row = await emfDb.offlinePin.get(usuarioId);
  if (!row) return { ok: false, reason: 'sin-pin' };

  if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    return { ok: false, reason: 'bloqueado', lockedUntil: row.lockedUntil };
  }

  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'expirado' };
  }

  const attemptHash = await derive(pin, fromBase64(row.salt), row.iterations);
  const match = constantTimeEqual(attemptHash, row.hash);

  if (match) {
    await emfDb.offlinePin.update(usuarioId, { failedAttempts: 0, lockedUntil: null });
    return { ok: true };
  }

  const failedAttempts = row.failedAttempts + 1;
  const lockedUntil = failedAttempts >= MAX_INTENTOS ? new Date(Date.now() + BLOQUEO_MS) : null;
  await emfDb.offlinePin.update(usuarioId, {
    failedAttempts: lockedUntil ? 0 : failedAttempts,
    lockedUntil,
  });
  return { ok: false, reason: 'incorrecto', lockedUntil: lockedUntil ?? undefined };
}
