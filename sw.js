/*
PROJECT: CSC Adherence Timer — build1 baseline
Version: v0.5-build1
Generated: 2025-09-09 14:43:17
*/
/* sw.js simple cache */
// Use a versioned cache name for the service worker.  Bump this when
// updating cached files.  Paths below are relative so the app works from
// subdirectories (e.g. /Test1/).
const CACHE = 'csc-v1-r50-v0.5-build1';
const CORE = [
  './',
  'index.html', 'styles.css', 'app.js', 'sfx.js',
  'manifest.webmanifest', 'logo.png', 'favicon.ico',
  'demo-week-schedule.json', 'sounds/manifest.json',
  'sounds/click.mp3', 'sounds/a.mp3'
];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{})));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c=>{ if(resp.ok) c.put(req, copy); }).catch(()=>{});
        return resp;
      }).catch(()=>cached || new Response('Offline', {status:503}));
      return cached || fetchPromise;
    })
  );
});
