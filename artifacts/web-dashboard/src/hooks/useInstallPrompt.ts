import { useCallback, useEffect, useState } from "react";

// Not in lib.dom.d.ts — this event is non-standard (Chromium-only today).
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Captures the browser's install prompt so it can be triggered from a custom
 * "Install App" button instead of waiting for the browser's own UI.
 *
 * Usage:
 *   const { canInstall, promptInstall } = useInstallPrompt();
 *   {canInstall && <Button onClick={promptInstall}>Install App</Button>}
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return { canInstall: deferredPrompt !== null, promptInstall };
}
