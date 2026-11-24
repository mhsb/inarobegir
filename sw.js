// ایناروبگیر service worker: lets the app open instantly and without a connection.
// It never caches or answers data requests (Supabase), so lists are always live.
const VERSION = 'inarobeg-v3';
const SHELL = ['./', './index.html', './supabase.js', './Vazirmatn.woff2', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const NAV_TIMEOUT_MS = 4000;                       // on a slow or throttled network, open the saved app instead of waiting forever
const isAppPage = u => u.pathname.endsWith('/') || u.pathname.endsWith('/index.html');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages. Only the app itself is saved (never diag.html, error pages or anything else).
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const app = isAppPage(url);
      const cached = app ? await caches.match('./index.html') : null;
      const net = fetch(req).then(res => {
        if (app && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); }
        return res;
      });
      if (!cached) return net;                     // first visit, or not the app page: just use the network
      return Promise.race([net.catch(() => cached), new Promise(r => setTimeout(() => r(cached), NAV_TIMEOUT_MS))]);
    })());
    return;
  }

  // Our own files (library, font, icons, manifest): saved copy right away, refreshed in the background.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
          .catch(() => hit || Response.error());
        return hit || net;
      })
    );
    return;
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
