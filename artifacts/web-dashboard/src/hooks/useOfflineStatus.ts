import { useEffect, useState } from "react";

/**
 * Tracks the browser's online/offline state via the navigator.onLine API
 * and the window "online"/"offline" events. Used to surface a banner so
 * field crews know when they've lost connectivity and data may be stale.
 */
export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOffline;
}
