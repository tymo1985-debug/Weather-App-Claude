/**
 * service-worker.js
 * ---------------------------------------------------------------------------
 * Provides offline support for the Weather PWA:
 *  - App shell (HTML/CSS/JS/icons) is precached on install and served
 *    cache-first, so the app opens instantly even with no connection.
 *  - Weather/geocoding API requests use a network-first strategy with a
 *    runtime cache fallback, so the last successful forecast is still
 *    available offline (in addition to the localStorage cache app.js keeps).
 *
 * Bump CACHE_VERSION whenever app-shell files change so old caches are
 * cleaned up and clients pick up the new assets.
 */

const CACHE_VERSION = 'weather-pwa-v7';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/themes.css',
  './css/components.css',
  './css/runner.css',
  './css/chart.css',
  './css/animations.css',
  './js/app.js',
  './js/ui.js',
  './js/storage.js',
  './js/geocoding.js',
  './js/weather-api.js',
  './js/runner-engine.js',
  './js/astro.js',
  './js/icons.js',
  './js/units.js',
  './js/calibration.js',
  './js/radar.js',
  './js/share.js',
  './js/ensemble.js',
  './js/climate.js',
  './js/meteoalarm.js',
  './js/i18n.js',
  './icons/icon.svg',
];

const API_HOSTS = ['api.open-meteo.com', 'air-quality-api.open-meteo.com', 'geocoding-api.open-meteo.com', 'api.bigdatacloud.net', 'api.rainviewer.com', 'tilecache.rainviewer.com', 'archive-api.open-meteo.com', 'feeds.meteoalarm.org'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('weather-pwa-') && key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (API_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (event.request.mode === 'navigate' || APP_SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  // Everything else: try cache, then network, as a safe default.
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const cache = await caches.open(APP_SHELL_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }
    throw err;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('index.html') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

// Best-effort periodic background refresh (where the browser supports the
// Periodic Background Sync API and the PWA is installed). The service worker
// itself has no notion of "which city" — it just wakes up any open app
// instance so it can refresh with its own in-memory state.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-weather') {
    event.waitUntil(
      self.clients.matchAll().then((clientList) => {
        clientList.forEach((client) => client.postMessage({ type: 'PERIODIC_REFRESH' }));
      })
    );
  }
});
