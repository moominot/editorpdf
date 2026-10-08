// Service worker: permet usar l'app sense connexió. Vendor = cache primer; codi de l'app = xarxa primer.
const VERSION = 'pdfsimple-v2';
const SHELL = ['./', 'index.html', 'css/style.css', 'img/icon.svg', 'img/icon-192.png', 'img/icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isVendor = url.pathname.includes('/vendor/');
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (isVendor) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req); if (res.status === 200) cache.put(req, res.clone()); return res;
    }
    try {
      const res = await fetch(req);
      if (res.status === 200) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req)) || (await cache.match('index.html'));
    }
  })());
});
