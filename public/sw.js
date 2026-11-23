const CACHE_NAME = 'ctap-v1';
const STATIC_CACHE_NAME = CACHE_NAME + '-static';
const API_CACHE_NAME = CACHE_NAME + '-api';

const STATIC_ASSET_PATTERNS = [
  /\.(?:js|css|woff2?|png|svg|ico|webmanifest)$/,
];

function isStaticAsset(url) {
  try {
    const u = new URL(url);
    return STATIC_ASSET_PATTERNS.some(function(pattern) { return pattern.test(u.pathname); });
  } catch (e) {
    return false;
  }
}

function isApiGetRequest(request) {
  try {
    const u = new URL(request.url);
    return u.pathname.startsWith('/api/') && request.method === 'GET';
  } catch (e) {
    return false;
  }
}

async function installServiceWorker() {
  self.skipWaiting();
}

async function activateServiceWorker() {
  const cacheNames = await caches.keys();
  const validCaches = new Set([STATIC_CACHE_NAME, API_CACHE_NAME]);
  await Promise.all(
    cacheNames
      .filter(function(name) { return !validCaches.has(name); })
      .map(function(name) { return caches.delete(name); })
  );
  await self.clients.claim();
}

async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response('Offline', { status: 503 });
  }
}

async function handleApiGet(request) {
  const cache = await caches.open(API_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

self.addEventListener('install', function(event) {
  event.waitUntil(installServiceWorker());
});

self.addEventListener('activate', function(event) {
  event.waitUntil(activateServiceWorker());
});

self.addEventListener('fetch', function(event) {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  if (isStaticAsset(request.url)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  if (isApiGetRequest(request)) {
    event.respondWith(handleApiGet(request));
    return;
  }
});

// T101: Web Push. Payload is {title, body, url}; wording is informational only, never advice.
self.addEventListener('push', function(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = typeof data.title === 'string' ? data.title : 'Commodity Trading AI Pro';
  const body = typeof data.body === 'string' ? data.body : '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icons/icon-192.svg',
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
