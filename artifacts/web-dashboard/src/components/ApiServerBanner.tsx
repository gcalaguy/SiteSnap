import { AlertCircle, RefreshCw } from "lucide-react";
import { useApiServerStatus } from "@/hooks/useApiServerStatus";

/**
 * Fixed top banner shown when the API server is unreachable.
 * Automatically dismisses once the server recovers.
 */
export function ApiServerBanner() {
  const { isDown } = useApiServerStatus();

  if (!isDown) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 bg-orange-500 text-white text-sm font-medium px-4 py-2 shadow-md"
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Server temporarily unavailable — reconnecting automatically</span>
      <RefreshCw className="h-3.5 w-3.5 animate-spin ml-1 opacity-80" aria-hidden="true" />
    </div>
  );
}
