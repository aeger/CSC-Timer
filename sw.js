/*
PROJECT: CSC Adherence Timer — build1 baseline
Version: v0.5-build1
Generated: 2025-09-08 21:59:53
*/

const CACHE_VERSION = 'v0.5-build1';
const CACHE_NAME = 'csc-timer-' + CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './sfx.js',
  './demo-week-schedule.json',
  './manifest.webmanifest',
  './android-chrome-192x192.png',
  './android-chrome-512x512.png',
  './favicon-16x16.png',
  './favicon-32x32.png',
  './apple-touch-icon.png',
  './logo.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.mode === 'navigate') {
    // Network-first for HTML
    e.respondWith(fetch(req).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c=>c.put(req, copy));
      return res;
    }))
  );
});
