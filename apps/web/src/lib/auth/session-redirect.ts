// Cuando el servidor rechaza el refresh token (sesión realmente vencida),
// client.ts redirige a /login con `window.location.href`. Esa asignación
// dispara el evento `beforeunload` del navegador igual que si el usuario
// hubiera cerrado la pestaña — pero ContextGuard no debe interceptarla con
// el diálogo de "¿quieres salir de la aplicación?", porque no es el usuario
// cerrando la app, es la propia app cerrando la sesión.
let redirectingToLogin = false;

export function markLoginRedirect(): void {
  redirectingToLogin = true;
}

export function isRedirectingToLogin(): boolean {
  return redirectingToLogin;
}
