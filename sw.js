// sw.js
// Service Worker BlueStorm
// Offline-first shell + assets, data en revalidation douce.

const APP_VERSION = "bluestorm-v1.0.0";
const CACHE_STATIC = `static-${APP_VERSION}`;
const CACHE_DYNAMIC = `dynamic-${APP_VERSION}`;
const CACHE_DATA = `data-${APP_VERSION}`;

// Fichiers essentiels (shell) — chemins RELATIFS (OK GitHub Pages sous-dossier)
const STATIC_ASSETS = [
  "./",
  "./index.html",

  // CSS (⚠️ adapte si tes dossiers sont /styles au lieu de /css)
  "./css/00-reset.css",
  "./css/10-token.css",
  "./css/20-base.css",
  "./css/30-components.css",
  "./css/40-pages.css",
  "./css/90-theme-bluestorm.css",

  // JS core
  "./js/app.js",
  "./js/router.js",

  // Components
  "./js/components/bottomNav.js",
  "./js/components/card.js",

  // Utils
  "./js/utils/escape.js",

  // Pages principales
  "./js/pages/cockpit.page.js",
  "./js/pages/program.page.js",
  "./js/pages/week.page.js",
  "./js/pages/journal.page.js",
  "./js/pages/journalNew.page.js",
  "./js/pages/flashcards.page.js",
  "./js/pages/skills.page.js",

  // Data
  "./data/program.v1.json",
  "./data/skills.map.json",
  "./data/theme.json",

  // Icons / PWA
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![CACHE_STATIC, CACHE_DYNAMIC, CACHE_DATA].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // Data JSON → stale-while-revalidate
  if (url.pathname.includes("/data/")) {
    event.respondWith(staleWhileRevalidate(req, CACHE_DATA));
    return;
  }

  // Assets statiques
  if (
    req.destination === "style" ||
    req.destination === "script" ||
    req.destination === "font" ||
    req.destination === "image"
  ) {
    event.respondWith(cacheFirst(req, CACHE_STATIC));
    return;
  }

  // HTML / routes SPA → network first
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(req, CACHE_DYNAMIC));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;

  const fresh = await fetch(req);
  cache.put(req, fresh.clone());
  return fresh;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return caches.match("./index.html");
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  const fetchPromise = fetch(req)
    .then((res) => {
      cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}
