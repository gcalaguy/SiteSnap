import { WifiOff } from "lucide-react";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";

/**
 * Slim sticky banner shown at the top of the app whenever the browser
 * loses connectivity. Data on screen may be stale while this is visible;
 * the service worker (src/sw.ts) keeps the app shell usable offline, but
 * writes still require a live connection.
 */
export function OfflineBanner() {
  const isOffline = useOfflineStatus();

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium text-center flex-shrink-0"
      style={{ background: "#7a1f1f", color: "#fff" }}
    >
      <WifiOff size={14} />
      <span>You're offline — showing last saved data. Changes will sync once you're back online.</span>
    </div>
  );
}
