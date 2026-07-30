/* SafeNest BZR — Service Worker (Phase 2 offline-first)
 * Zadaci:
 *  - Background Sync API: kada se javi mreža, probudi stranice da pokrenu sync.
 *  - Offline detekcija (preko klijenata).
 *  - Push notifikacije nakon sync-a.
 *
 * Napomena: sama sync logika (IndexedDB + /api/sync) živi u stranici
 * (lib/offline/syncManager.ts) jer joj treba pristup auth sesiji i localforage.
 * SW ovde služi kao "okidač" i kanal za notifikacije.
 */

const SYNC_TAG = "safenest-sync";

/* Cache za Next static asset-e (content-hashed, pa je cache-first bezbedan).
 * Ovde završava i SheetJS chunk za uvoz tabela — uvoz radi i bez mreže. */
const STATIC_CACHE = "safenest-static-v2";
const KEEP_CACHES = [STATIC_CACHE];
const STATIC_PREFIX = "/_next/static/";

/* U dev-u se chunk-ovi menjaju na svaki rebuild — tada ne keširamo. */
const IS_LOCALHOST =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("safenest-") && !KEEP_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (IS_LOCALHOST) return;
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(STATIC_PREFIX)) return;

  event.respondWith(staticCacheFirst(request));
});

async function staticCacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      void cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const fallback = await cache.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    throw err;
  }
}

// Background Sync — okida se kada se vrati konekcija.
self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(notifyClientsToSync());
  }
});

// Periodic Background Sync (ako je dozvoljen) — best effort.
self.addEventListener("periodicsync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(notifyClientsToSync());
  }
});

// Poruke sa stranice.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (data.type === "PRECACHE_ASSETS" && Array.isArray(data.urls)) {
    event.waitUntil(precacheAssets(data.urls));
  }
  if (data.type === "SYNC_DONE") {
    // Opciono: prikaži notifikaciju kada se završi sync.
    if (data.uploaded > 0 && self.registration.showNotification) {
      self.registration.showNotification("SafeNest BZR", {
        body: `Sinhronizovano ${data.uploaded} zapis(a).`,
        tag: "safenest-sync-done",
        icon: "/icon.png",
        badge: "/icon.png",
      });
    }
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "SafeNest BZR", body: "Nova obaveštenja." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    /* nije JSON */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon.png",
      badge: "/icon.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/dashboard");
    }),
  );
});

async function precacheAssets(urls) {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      try {
        if (await cache.match(url)) return;
        const response = await fetch(url, { credentials: "same-origin" });
        if (response && response.ok) await cache.put(url, response);
      } catch {
        /* asset se dovlači kasnije, kada mreža bude dostupna */
      }
    }),
  );
}

async function notifyClientsToSync() {
  const allClients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: "window",
  });
  for (const client of allClients) {
    client.postMessage({ type: "SYNC_TRIGGER" });
  }
}
