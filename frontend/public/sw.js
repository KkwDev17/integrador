// Semana 2: Service Worker con cache de app shell y fallback offline
const CACHE_VERSION = 'fielddesk-v3';
const CACHE_STATIC = `reportes-static-${CACHE_VERSION}`;
const CACHE_PAGES = `reportes-pages-${CACHE_VERSION}`;

const APP_SHELL = [
  ...(self.__FIELDDESK_ASSETS || []),
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('reportes-') && ![CACHE_STATIC, CACHE_PAGES].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar peticiones a la API (la app maneja offline con IndexedDB)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Navegación: network-first, fallback a cache (index.html) para offline
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          const cache = await caches.open(CACHE_PAGES);
          if (networkResponse.ok) await cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (_) {
          const cached = await caches.match(request);
          return cached || caches.match('/index.html');
        }
      })()
    );
    return;
  }

  // Assets estáticos (GET): cache-first, luego red
  if (request.method === 'GET') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok && (url.origin === self.location.origin)) {
            const cache = await caches.open(CACHE_STATIC);
          await cache.put(request, response.clone());
          }
          return response;
        } catch (_) {
          return cached || new Response('Recurso no disponible sin conexión', { status: 503 });
        }
      })()
    );
  }
});
