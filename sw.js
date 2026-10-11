/* 家本 PWA — Network First，離線時回退快取（從家菜金 sw.js 搬來，2026-10-11 慎言） */
/* 版號 = 改檔日期。動任何 SHELL 內的檔案就把這行改掉。 */
const CACHE = 'jiaben-20261011a';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/icons/app/icon-192.png',
  './assets/icons/app/icon-512.png',
  './assets/icons/app/icon-maskable-192.png',
  './assets/icons/app/icon-maskable-512.png',
  './assets/icons/app/apple-touch-icon.png',
  './assets/icons/app/favicon-32.png',
  './assets/opening/jiaben-opening-first.webp',
  './assets/opening/jiaben-opening-web-first.webp',
  './assets/loading/jiaben-loading-mobile-loop-first.webp',
  './assets/loading/jiaben-loading-web-2-loop-first.webp'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(SHELL.map(u =>
        c.add(u).catch(err => console.warn('[SW] 快取失敗:', u, err.message))
      ))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks =>
      Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
    .then(() => caches.open(CACHE).then(c =>
      Promise.all(SHELL.map(u =>
        fetch(u, { cache: 'no-store' })
          .then(r => r.ok ? c.put(u, r) : null)
          .catch(() => {})
      ))
    ))
    .then(() => self.clients.claim())
  );
});

/* ══ 推播（後端做好才會有東西送來）══
   ⚠️ 一定要 showNotification：訂閱時宣告 userVisibleOnly:true，
      收了不顯示，瀏覽器會默默撤銷訂閱。 */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '家本', {
    body:  d.body || '',
    icon:  './assets/icons/app/icon-192.png',
    badge: './assets/icons/app/icon-192.png',
    tag:   d.tag || 'jiaben',
    renotify: true,
    data:  { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
      for (const w of ws) {
        if (w.url.indexOf(self.registration.scope) === 0) {
          if (w.navigate) { try { w.navigate(url); } catch (_) {} }
          return w.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;   // GAS 那邊一律直通

  /* 影片直通：Range 分段（206）SW 一插手就轉圈圈轉到死 */
  if (req.destination === 'video' || req.destination === 'audio') return;
  if (/\.(mp4|m4v|mov|webm|mp3|m4a)($|\?)/i.test(req.url)) return;

  const isNav = req.mode === 'navigate' || /\.html?($|\?)/.test(req.url);
  const hit   = isNav ? fetch(req, { cache: 'no-store' }) : fetch(req);

  e.respondWith(
    hit
      .then(res => {
        /* 只存真的成功的（Pages 發佈中回的 404 不能進快取） */
        if (res && res.ok && res.status === 200 && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => {
        if (r) return r;
        if (isNav) return caches.match('./index.html');   // 只有開頁面才回 index.html
        return Response.error();
      }))
  );
});
