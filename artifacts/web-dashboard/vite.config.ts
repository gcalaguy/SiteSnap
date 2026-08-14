import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

// PORT and BASE_PATH are Replit dev-server vars. They are not embedded in the
// built output, so we fall back to safe defaults when building for production
// (e.g. `vite build` in CI or manual build runs where Replit hasn't set them).
const rawPort = process.env.PORT ?? "3000";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    VitePWA({
      // injectManifest (not generateSW) so the caching logic lives in a real,
      // readable source file (src/sw.ts) instead of being generated from
      // opaque plugin options.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // "prompt" (not "autoUpdate") so a new SW waits for the user to accept
      // the in-app update toast rather than silently reloading underneath them.
      registerType: "prompt",
      injectRegister: null, // registration is hand-rolled in main.tsx
      manifestFilename: "manifest.json",
      devOptions: {
        // Never activate a SW during `vite dev` — dev runs the web dashboard
        // and api-server as separate processes/ports; an active SW here would
        // intercept HMR/module requests and produce confusing stale-code bugs.
        enabled: false,
      },
      injectManifest: {
        // The current production main chunk is ~4.98MB; Workbox's 2MB default
        // would fail the build. Raised with headroom for growth.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // The supersplat 3D viewer is a large (~2.9MB), on-demand, feature-
        // specific bundle — excluded from the app-shell precache so first-load
        // footprint isn't bloated for users who never open it.
        globIgnores: ["supersplat-viewer/**"],
      },
      manifest: {
        name: "Site Snap",
        short_name: "Site Snap",
        description:
          "Multi-tenant AI-powered project management and collaboration tool for Canadian construction companies.",
        theme_color: "#D4AF37",
        background_color: "#ffffff",
        display: "standalone",
        start_url: basePath,
        scope: basePath,
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
