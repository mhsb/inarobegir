// ایناروبگیر service worker: lets the app open instantly and without a connection.
// It never caches or answers data requests (Supabase), so lists are always live.
const VERSION = 'inarobeg-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The page itself: newest version when online, saved copy when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Our own files (icons, manifest): show saved copy, refresh in the background.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => { if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone())); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Pinned library and font files from the CDN: they never change, so keep them.
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque') caches.open(VERSION).then(c => c.put(req, res.clone())); return res; }))
    );
  }
  // Everything else (Supabase API, auth, realtime) goes straight to the network.
});

// ---------- Push notifications ----------
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    // Android/desktop: no banner if the app is open on screen (the app shows its own notice).
    // iPhone requires every push to show something, so it never skips.
    if (!/iPhone|iPad|iPod/.test(self.navigator.userAgent)) {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some(c => c.visibilityState === 'visible')) return;
    }
    await self.registration.showNotification(d.title || 'ایناروبگیر', {
      body: d.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: d.tag || undefined,
      renotify: !!(d.tag && d.renotify),
      lang: 'fa',
      dir: 'rtl',
      data: { url: d.url || './' },
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
    for (const c of wins) {
      if ('focus' in c) { c.postMessage({ type: 'open', url }); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
