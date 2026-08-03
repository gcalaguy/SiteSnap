import { createRoot } from "react-dom/client";
import App from "./App";
import { installGlobalErrorReporting } from "./lib/errorReporting";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { registerSW } from "virtual:pwa-register";
import "./index.css";

installGlobalErrorReporting();

// registerType: "prompt" (vite.config.ts) means a new service worker installs
// and waits — it never takes over silently. updateSW(true) is what tells it
// to skip waiting and reload, only once the user clicks "Reload" below.
const updateSW = registerSW({
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
});

createRoot(document.getElementById("root")!).render(<App />);
