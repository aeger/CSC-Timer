// r24 service worker
const CACHE = "csc-cache-r24";
const PRECACHE = ["/","/index.html","/styles.css","/app.js","/sfx.js","/manifest.webmanifest","/icon-192.png","/icon-512.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of PRECACHE) { try { await cache.add(url); } catch (e) {} }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (new URL(req.url).origin === location.origin) cache.put(req, res.clone());
      return res;
    } catch (_e) {
      return cached || new Response("Offline", { status: 503 });
    }
  })());
});
