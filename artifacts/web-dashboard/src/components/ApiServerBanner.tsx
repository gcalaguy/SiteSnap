import { RefreshCw } from "lucide-react";
import { useApiServerStatus } from "@/hooks/useApiServerStatus";

/**
 * Fixed top banner shown when the API server is unreachable (e.g. rebuilding in dev).
 * Automatically dismisses once the server responds again.
 */
export function ApiServerBanner() {
  const { isDown } = useApiServerStatus();

  if (!isDown) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-medium px-4 py-2 shadow-md"
    >
      <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
      <span>API rebuilding&hellip; reconnecting automatically</span>
    </div>
  );
}
