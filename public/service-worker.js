/* AURA TERMINAL — Service Worker v1
   Handles: push notifications, background sync, offline caching
*/

const CACHE_NAME = 'aura-terminal-v1';
const OFFLINE_URLS = ['/'];

// ── INSTALL: cache offline shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// ── ACTIVATE: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── PUSH: show notification from server
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'AURA TERMINAL', body: event.data ? event.data.text() : 'New notification' };
  }

  const title = data.title || 'AURA TERMINAL';
  const options = {
    body: data.body || '',
    icon: '/logos/a7-logo.png',
    badge: '/logos/a7-logo.png',
    tag: data.tag || 'aura-notification',
    data: { url: data.url || '/', type: data.type || 'general' },
    vibrate: [100, 50, 100],
    requireInteraction: data.type === 'mention',
    actions: data.actions || []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── NOTIFICATION CLICK: navigate to target URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── FETCH: network-first with offline fallback for navigation
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match('/').then(r => r || new Response('Offline', { status: 503 }))
    )
  );
});
