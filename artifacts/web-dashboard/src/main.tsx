import { createRoot } from "react-dom/client";
import App from "./App";
import { installGlobalErrorReporting } from "./lib/errorReporting";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { registerSW } from "virtual:pwa-register";
import "./index.css";

installGlobalErrorReporting();

// A legacy, hand-written service worker (public/service-worker.js, registered
// from index.html) predates the workbox PWA setup below and was never removed.
// It cache-first-served every GET forever, including /api/* — silently
// serving stale data no matter what React Query or Cache-Control said, since
// a service worker's own cache read never touches the network at all on a
// hit. Registration was removed from index.html and the file deleted, but a
// browser that already installed it won't drop it on its own until its next
// (up to 24h-delayed) background update check. Actively unregister and purge
// its cache on every load so already-affected sessions self-heal immediately.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) {
      const scriptURL =
        reg.active?.scriptURL ??
        reg.waiting?.scriptURL ??
        reg.installing?.scriptURL;
      if (import.meta.env.DEV || scriptURL?.endsWith("/service-worker.js")) {
        reg.unregister();
      }
    }
  });
}
if ("caches" in window) {
  caches.keys().then((keys) => {
    for (const key of keys) {
      if (import.meta.env.DEV || key.startsWith("sitesnap-v")) {
        caches.delete(key);
      }
    }
  });
}

// registerType: "prompt" (vite.config.ts) means a new service worker installs
// and waits — it never takes over silently. updateSW(true) is what tells it
// to skip waiting and reload, only once the user clicks "Reload" below.
const updateSW = import.meta.env.PROD
  ? registerSW({
      immediate: true,
      onNeedRefresh() {
        toast({
          title: "Update available",
          description: "A new version of Site Snap is ready.",
          action: (
            <ToastAction altText="Reload" onClick={() => updateSW(true)}>
              Reload
            </ToastAction>
          ),
        });
      },
      onOfflineReady() {
        toast({ title: "Site Snap is ready to work offline" });
      },
    })
  : () => {};

createRoot(document.getElementById("root")!).render(<App />);
