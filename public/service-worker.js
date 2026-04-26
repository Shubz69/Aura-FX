/* AURA TERMINAL™ — Service Worker v6
   Handles: Web Push (PWA / iOS 16.4+ installed), offline navigation fallback
   Note: iOS Web Push only works for Home Screen PWAs with permission + HTTPS + valid SW.
*/

const CACHE_NAME = 'aura-terminal-v6';
const OFFLINE_URLS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function normalizeTargetUrl(raw) {
  if (!raw || typeof raw !== 'string') return '/';
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) {
      if (self.registration && self.registration.scope) {
        return new URL(raw, self.registration.scope).href;
      }
      return raw;
    }
    return '/';
  } catch (_) {
    return '/';
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'AURA TERMINAL™', body: event.data ? event.data.text() : 'New notification' };
  }

  const title = data.title || 'AURA TERMINAL™';
  const inner = data.data && typeof data.data === 'object' ? data.data : {};
  const targetPath = typeof data.url === 'string' && data.url.trim()
    ? data.url.trim()
    : (typeof inner.url === 'string' && inner.url.trim() ? inner.url.trim() : '/');
  const openUrl = normalizeTargetUrl(targetPath);

  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || `aura-${inner.notificationId || Date.now()}`,
    renotify: true,
    data: {
      url: openUrl,
      type: data.type || inner.type || 'general',
      notificationId: inner.notificationId || '',
      channelId: inner.channelId || '',
      messageId: inner.messageId || '',
      threadId: inner.threadId || '',
    },
    vibrate: [100, 50, 100],
    requireInteraction: data.type === 'mention' || data.type === 'channel_activity',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const raw = typeof d.url === 'string' && d.url ? d.url : '/';
  const targetUrl = normalizeTargetUrl(raw);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      let target;
      try {
        target = new URL(targetUrl);
      } catch (_) {
        target = null;
      }
      if (!target) {
        if (clients.openWindow) return clients.openWindow('/');
        return undefined;
      }
      for (const client of windowClients) {
        try {
          const u = new URL(client.url);
          if (u.origin !== target.origin) continue;
          if (typeof client.navigate === 'function') {
            return client.navigate(targetUrl).then(() => client.focus()).catch(() => client.focus());
          }
          if ('focus' in client) return client.focus();
        } catch (_) { /* ignore */ }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match('/').then(r => r || new Response('Offline', { status: 503 }))
    )
  );
});
