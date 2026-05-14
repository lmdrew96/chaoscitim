/**
 * ChaosCitim service worker.
 *
 * Caching strategy:
 *   - HTML navigations (/, /read/[id], /offline): network-first with a
 *     cache fallback. If both miss, serve the /offline shell.
 *   - Static assets (_next/static/*, fonts, icons): stale-while-revalidate.
 *     Hashed by Next so safe to cache aggressively.
 *   - Auth/api routes: network only (never cache responses with cookies
 *     or per-user data).
 *
 * Versioning: bump CACHE_VERSION to invalidate the precache + runtime
 * caches on the next service-worker activation.
 */

const CACHE_VERSION = 'v2';
const PRECACHE = `chaoscitim-precache-${CACHE_VERSION}`;
const PAGES_CACHE = `chaoscitim-pages-${CACHE_VERSION}`;
const STATIC_CACHE = `chaoscitim-static-${CACHE_VERSION}`;

// The minimum app shell. /offline must always be available when offline.
const PRECACHE_URLS = ['/offline', '/manifest.webmanifest', '/icon', '/apple-icon'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // Use individual requests so one 404 doesn't abort the whole install.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            // Don't fail install if a non-critical precache fetch fails.
            console.warn('[sw] precache miss:', url, err);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const valid = new Set([PRECACHE, PAGES_CACHE, STATIC_CACHE]);
      await Promise.all(
        keys.filter((k) => k.startsWith('chaoscitim-') && !valid.has(k)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image') ||
    url.pathname === '/icon' ||
    url.pathname === '/apple-icon' ||
    url.pathname === '/manifest.webmanifest' ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)
  );
}

function isApi(url) {
  return url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // mutations bypass the SW
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin bypass

  if (isApi(url)) return; // network only — no caching of per-user data

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(navigationStrategy(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Default: try network, fall back to cache.
  event.respondWith(networkFirst(request, PAGES_CACHE));
});

function isCacheableNavigation(url) {
  // /read/* pages require authentication and may contain private BYO texts.
  // Never cache them — a stale cache entry could expose private content after
  // sign-out or an account switch on a shared device.
  // Public offline support for seed texts is a future patch (needs per-user
  // cache partitioning and an explicit server-side opt-in header).
  if (url.pathname.startsWith('/read/')) return false;
  // Auth routes carry Clerk session cookies — network only.
  if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/sign-up')) return false;
  return true;
}

async function navigationStrategy(request) {
  const url = new URL(request.url);
  const cacheable = isCacheableNavigation(url);
  const cache = await caches.open(PAGES_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && cacheable) {
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    if (cacheable) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    const offline = await caches.match('/offline');
    if (offline) return offline;
    return new Response('You are offline.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => cached);
  return cached ?? fetchPromise;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('Network error and no cache available.');
  }
}

// Allow the page to trigger immediate activation after a SW update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
