/**
 * Service worker that caches map tile responses (Cesium imagery, MapLibre tiles)
 * in the Cache API so repeat visits / zoom-in on the same area are instant.
 *
 * Strategy: network-first with cache fallback.
 * - On fetch: try network, cache the response, return it.
 * - If network fails: return cached copy (offline-friendly).
 * - Cache is capped per-domain to prevent unbounded growth.
 */

const CACHE_NAME = 'map-tiles-v1';
const MAX_CACHE_ENTRIES = 4000;

const TILE_URL_PATTERNS = [
  /arcgisonline\.com\/.*\/tile\//,
  /basemaps\.cartocdn\.com\//,
  /\.tile\.openstreetmap\.org\//,
  /tiles\.mapbox\.com\//,
  /api\.maptiler\.com\//,
  /demotiles\.maplibre\.org\//,
  /\.tiles\.mapbox\.com\//,
  /tile\.opentopomap\.org\//,
  /server\.arcgisonline\.com\//,
  /\/cesium\/.*\.(jpg|jpeg|png|webp)/i,
  /\/imagery\/.*\.(jpg|jpeg|png|webp)/i,
];

function isTileRequest(url) {
  return TILE_URL_PATTERNS.some(pattern => pattern.test(url));
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_CACHE_ENTRIES) {
    const excess = keys.length - MAX_CACHE_ENTRIES;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  }
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(name => name.startsWith('map-tiles-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!isTileRequest(request.url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone());
          trimCache(cache);
        }
        return networkResponse;
      } catch {
        const cached = await cache.match(request);
        return cached || new Response('', { status: 504, statusText: 'Tile unavailable' });
      }
    })
  );
});
