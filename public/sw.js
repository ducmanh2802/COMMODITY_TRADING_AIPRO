// Service worker: offline shell for learning. Market data (/api/*) is NEVER cached: always network.
const VERSION = 'ctap-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.svg', '/icons/icon-512.svg'];

function isCacheableStatic(pathname) {
  return pathname.startsWith('/assets/') || pathname.startsWith('/fonts/') || pathname.startsWith('/icons/');
}

// Cache the hashed bundles referenced by index.html so the shell works offline after one visit.
async function cacheShellAssets(cache, html) {
  const urls = new Set();
  const re = /(?:src|href)="(\/(?:assets|fonts)\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) urls.add(m[1]);
  await Promise.all(Array.from(urls).map(function (u) {
    return cache.match(u).then(function (hit) {
      return hit || fetch(u).then(function (r) { if (r.ok) return cache.put(u, r); });
    }).catch(function () {});
  }));
}

self.addEventListener('install', function (event) {
  // No skipWaiting here: the app asks for it via the in-app update prompt.
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.all(SHELL.map(function (u) { return cache.add(u).catch(function () {}); })).then(function () {
        return cache.match('/').then(function (r) {
          return r ? r.clone().text().then(function (t) { return cacheShellAssets(cache, t); }) : undefined;
        });
      });
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== VERSION; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // always network, never cached

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then(function (cache) {
            cache.put('/', copy.clone());
            copy.text().then(function (t) { return cacheShellAssets(cache, t); }).catch(function () {});
          });
        }
        return response;
      }).catch(function () {
        return caches.match('/').then(function (r) { return r || new Response('Offline', { status: 503 }); });
      })
    );
    return;
  }

  if (isCacheableStatic(url.pathname)) {
    event.respondWith(
      caches.match(request).then(function (hit) {
        if (hit) return hit;
        return fetch(request).then(function (response) {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        });
      })
    );
  }
});

// Same-origin path only: rejects absolute URLs, protocol-relative '//host' and '/\host'.
function safePath(u) {
  return typeof u === 'string' && /^\/(?![/\\])/.test(u) && u.length < 500 ? u : '/';
}

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
      data: { url: safePath(data.url) },
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
