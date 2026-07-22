const CACHE_VERSION = 'bcb-finance-shell-v1';
const SAFE_SHELL = [
  '/offline.html',
  '/manifest.json',
  '/icons/bcb-finance-192.png',
  '/icons/bcb-finance-512.png',
  '/icons/bcb-finance-maskable-512.png',
  '/icons/bcb-finance-apple-touch.png',
  '/assets/images/bcb-logo.png',
  '/assets/images/auth-bg.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SAFE_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isConfidentialOrDynamic(url) {
  return url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/mail-api/')
    || url.pathname.startsWith('/uploads/')
    || url.pathname.startsWith('/profile_pics/')
    || /\.(?:pdf|zip|xlsx|csv)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isConfidentialOrDynamic(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  const safeStaticAsset = url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/icons/')
    || SAFE_SHELL.includes(url.pathname);
  if (!safeStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
