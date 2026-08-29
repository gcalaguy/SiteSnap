// KILL-SWITCH for the legacy, hand-written cache-first service worker that
// used to live at this exact URL/scope. It cached every GET request
// (including /api/*) forever and was replaced by the workbox-based PWA setup
// registered from src/main.tsx at a DIFFERENT URL (/sw.js — see the VitePWA
// "filename" option in vite.config.ts), so this file never collides with it.
//
// Browsers that already installed the old worker keep re-fetching THIS exact
// URL as part of their normal service-worker update-check — a fetch the
// browser makes directly, per spec, bypassing any service worker's own fetch
// handler (including the OLD worker's cache-first handler). That's what lets
// this file reach an already-affected client at all. Once it does, its only
// job is to remove itself and force one clean, uncontrolled reload — it must
// NEVER cache or intercept anything itself, or it just becomes a second copy
// of the same bug.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();

      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));

      await self.registration.unregister();

      const allClients = await self.clients.matchAll({ type: "window" });
      for (const client of allClients) {
        client.navigate(client.url);
      }
    })(),
  );
});
