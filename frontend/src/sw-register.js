export function registerSW() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registrado:', registration.scope);
        })
        .catch((error) => {
          console.log('Error al registrar Service Worker:', error);
        });
    });
  }
}
