// sw.js — แคชตัวแอปให้เปิดได้แม้ออฟไลน์ (ข้อมูลอยู่ใน IndexedDB ไม่ได้อยู่ในแคชนี้)
const VERSION = 'v1.1.0';
const CACHE = 'baby-log-' + VERSION;
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/rules.js', './js/db.js', './js/sync.js', './js/charts.js', './js/photos.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './fonts/ibm-plex-sans-thai-latin-400-normal.woff2',
  './fonts/ibm-plex-sans-thai-latin-600-normal.woff2',
  './fonts/ibm-plex-sans-thai-latin-700-normal.woff2',
  './fonts/ibm-plex-sans-thai-thai-400-normal.woff2',
  './fonts/ibm-plex-sans-thai-thai-600-normal.woff2',
  './fonts/ibm-plex-sans-thai-thai-700-normal.woff2',
  './img/cons-hard.jpg',
  './img/cons-mucus.jpg',
  './img/cons-watery.jpg',
  './img/stool-01-white.jpg',
  './img/stool-02-clay.jpg',
  './img/stool-03-paleyellow.jpg',
  './img/stool-04-meconium.jpg',
  './img/stool-05-transitional.jpg',
  './img/stool-06-mustard.jpg',
  './img/stool-07-green.jpg',
  './img/stool-08-brown.jpg',
  './img/stool-09-orange.jpg',
  './img/stool-10-blood.jpg',
  './img/stool-11-black.jpg',
  './img/urine-01-clear.jpg',
  './img/urine-02-yellow.jpg',
  './img/urine-03-dark.jpg',
  './img/urine-04-urate.jpg',
  './img/urine-05-red.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('baby-log-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ไม่ยุ่งกับ Google Apps Script
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
