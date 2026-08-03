/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/client" />
export {};
declare const self: ServiceWorkerGlobalScope;

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, NetworkOnly } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { clientsClaim } from "workbox-core";

// ── Static build assets: Cache-First via precache ───────────────────────────
// self.__WB_MANIFEST is replaced at build time with the list of Vite-hashed
// JS/CSS/font/image files. Content hashing means a new deploy always produces
// new URLs, so Cache-First here can never serve stale code — the "wrong"
// bundle simply isn't a URL the app will ever request again.
precacheAndRoute(self.__WB_MANIFEST);

// Prunes precache entries from previous versions whose hashed filenames no
// longer appear in the current manifest — this is the "cache cleanup on
// version updates" safeguard.
cleanupOutdatedCaches();

// ── Dynamic/auth traffic: Network-Only, never cached ────────────────────────
// registerRoute() defaults to matching GET requests only (Workbox's `Route`
// constructor default), so POST/PUT/PATCH/DELETE are never matched by any
// route below and always fall straight through to the browser's normal,
// uncached fetch — no explicit method check needed. This is deliberate:
// customFetch (lib/api-client-react/src/custom-fetch.ts) already refuses to
// retry writes (a retried POST once created duplicate tenants in production),
// so the service worker must not add Background Sync / replay on top of that
// and risk reintroducing the same class of bug.
//
// Every backend route in this app — including the Clerk auth proxy
// (/api/__clerk, which streams raw bytes), health checks, and file/storage
// endpoints — is mounted only under /api/*. One prefix rule covers all of it.
// NetworkOnly never buffers or clones the response for caching, so it's safe
// for the Clerk proxy's raw streaming body too.
registerRoute(({ url }) => url.pathname.startsWith("/api/"), new NetworkOnly());

// Defensive bypass for WebSocket/SSE requests. Nothing in this app uses them
// today, but if a future real-time endpoint is added outside /api/*, it must
// never be handled by the caching routes below.
registerRoute(
  ({ request }) =>
    request.headers.get("upgrade") === "websocket" ||
    request.headers.get("accept") === "text/event-stream",
  new NetworkOnly(),
);

// ── SPA navigations: Network-First ───────────────────────────────────────────
// Prevents "stuck app" syndrome: every normal page load tries the network
// first (so a fresh deploy's index.html — pointing at the new hashed bundle —
// is always preferred), falling back to the last-cached HTML only when
// genuinely offline.
registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkFirst({
    cacheName: "html-cache",
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

// ── Google Fonts: Cache-First ────────────────────────────────────────────────
// The app's only cross-origin static dependency (see index.html preconnect
// tags). Effectively immutable — safe to cache aggressively for full offline
// availability.
registerRoute(
  ({ url }) =>
    url.origin === "https://fonts.googleapis.com" ||
    url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
);

// ── Update handshake ─────────────────────────────────────────────────────────
// skipWaiting() is deliberately NOT called unconditionally — a newly
// installed SW stays in "waiting" state until the client explicitly asks it
// to take over. This pairs with registerType: "prompt" in vite.config.ts and
// the update-available toast in main.tsx, so users are notified instead of
// being silently switched to new code mid-session.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

clientsClaim();
