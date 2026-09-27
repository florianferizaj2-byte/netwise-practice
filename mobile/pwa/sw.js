/* Build script replaces these values with an exact list of public app files. */
const CACHE = 'kaojiang-shell-__BUILD_ID__';
const PRECACHE = __PRECACHE__;
const FILES = new Set(PRECACHE);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(
    PRECACHE.map((url) => new Request(url, { cache: 'reload', credentials: 'omit' })),
  )));
  // Updates wait until the app is reopened or the user explicitly refreshes.
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('kaojiang-shell-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const navigation = request.mode === 'navigate' && ['/app/', '/app/index.html'].includes(url.pathname);
  if (navigation) {
    // Use the current HTML online; the previous complete app shell is an offline fallback.
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () =>
      (await caches.open(CACHE)).match('/app/index.html'),
    ));
    return;
  }
  // Never cache API responses, account data, uploaded images, or other site pages.
  if (url.search || !FILES.has(url.pathname)) return;
  event.respondWith((async () => (await (await caches.open(CACHE)).match(url.pathname)) ?? fetch(request))());
});
