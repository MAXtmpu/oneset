// Retires the old web app's service worker at the site root. The web app now lives in /app/ with its
// own worker; the root is the Myodose landing page and needs no offline cache.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('oneset-') || (k.startsWith('myodose-') && !k.startsWith('myodose-app-')))
      .map((k) => caches.delete(k)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window' });
    windows.forEach((w) => w.navigate(w.url));
  })());
});
