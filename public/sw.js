/* Keeps the app opening instantly and even without internet. Data always comes from the server. */
const V = 'kfit-staff-v1';
const SHELL = ['./', 'index.html', 'net.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  const own = u.origin === location.origin;
  if (own && (r.mode === 'navigate' || /\.(html|js)$/.test(u.pathname) || u.pathname === '/')) { // newest first, saved copy when offline
    e.respondWith(fetch(r).then(x => { const c = x.clone(); caches.open(V).then(k => k.put(r, c)); return x; }).catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
  } else { // fonts, excel library, icons: saved copy first
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(x => { if (x.ok || x.type === 'opaque') { const c = x.clone(); caches.open(V).then(k => k.put(r, c)); } return x; })));
  }
});
