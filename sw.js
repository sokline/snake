const CACHE_VERSION = (typeof window !== 'undefined' && window.APP_VERSION)
  ? 'snake-' + window.APP_VERSION.version + '-' + window.APP_VERSION.commit
  : 'snake-v1';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './version.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  
  // version.js — network-first: свежая версия при наличии сети, кэш офлайн
  if(url.pathname.endsWith('version.js')){
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(response => {
          if(response && response.status === 200){
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  
  // Всё остальное — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(response => {
        if(!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => {
        if(e.request.mode === 'navigate'){
          return caches.match('./index.html');
        }
        return new Response('Offline', {status: 503});
      });
    })
  );
});
