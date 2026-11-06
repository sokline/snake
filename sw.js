// Динамическое имя кэша на основе версии
const getCacheName = () => {
  try {
    if (typeof self !== 'undefined' && self.APP_VERSION) {
      return 'snake-' + self.APP_VERSION.version + '-' + self.APP_VERSION.commit;
    }
  } catch(e) {}
  return 'snake-v1';
};

// Обязательные файлы (без version.js — он опционален)
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.json'
];

// Опциональные файлы
const OPTIONAL_ASSETS = [
  './version.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(getCacheName());
      
      // Кэшируем обязательные файлы — если что-то не удалось, всё равно продолжаем
      await Promise.allSettled(
        CORE_ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('Не удалось закэшировать обязательный:', url, err);
        }))
      );
      
      // Кэшируем опциональные — ошибки игнорируем
      await Promise.allSettled(
        OPTIONAL_ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('Опциональный файл недоступен:', url, err);
        }))
      );
      
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== getCacheName()).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  
  // version.js — network-first с fallback на кэш, затем на заглушку
  if (url.pathname.endsWith('version.js')) {
    e.respondWith(
      (async () => {
        // 1. Пытаемся из сети
        try {
          const response = await fetch(e.request, { cache: 'no-store' });
          if (response && response.status === 200) {
            const cache = await caches.open(getCacheName());
            cache.put(e.request, response.clone());
            return response;
          }
        } catch (err) {
          // Сети нет — идём дальше
        }
        
        // 2. Пытаемся из кэша
        const cached = await caches.match(e.request);
        if (cached) return cached;
        
        // 3. Fallback: генерируем заглушку на лету
        const fallback = new Response(
          `window.APP_VERSION = { version: "offline", commit: "cached", date: "${new Date().toISOString()}", message: "Офлайн-режим" };`,
          { headers: { 'Content-Type': 'application/javascript' } }
        );
        return fallback;
      })()
    );
    return;
  }
  
  // Всё остальное — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(getCacheName()).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => {
        // Для навигации — возвращаем index.html из кэша
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
