/**
 * Convierte "Nd" (ej. "3650d") a milisegundos. Usado tanto para el
 * `expires_at` del refresh_token en BD como para el `maxAge` de la cookie
 * que lo transporta — deben coincidir siempre, o la cookie desaparece del
 * navegador antes de que el registro en BD expire (o al revés), y la sesión
 * se cierra por un timer, no por una decisión explícita del usuario.
 */
export function refreshExpiresInMs(config: { get<T = string>(key: string): T | undefined }): number {
  const raw = config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '3650d';
  const days = parseInt(raw.replace('d', ''), 10);
  return (Number.isFinite(days) ? days : 3650) * 24 * 60 * 60 * 1000;
}
