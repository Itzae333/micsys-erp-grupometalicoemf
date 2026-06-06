// Registra el service worker generado por @ducanh2912/next-pwa.
// Se llama desde un Client Component en el layout raíz para que no bloquee
// la hidratación del servidor.

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Verifica actualizaciones cada 60 minutos
        setInterval(() => registration.update(), 60 * 60 * 1000);
      })
      .catch(() => {
        // Service worker no disponible (HTTP / privado) — sin acción
      });
  });
}
