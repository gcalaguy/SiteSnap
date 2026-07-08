import { customFetch } from "@workspace/api-client-react";

export type ClientErrorPayload = {
  logType: string;
  message: string;
  stackTrace?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Fire-and-forget crash report to the native error-tracking system. The
 * `.catch(() => {})` is critical — a failed report must never itself throw,
 * or an error boundary/global handler could loop reporting its own failure.
 * customFetch already auto-attaches the auth bearer token and x-tenant-id
 * header, so the backend resolves user/company identity from those, not from
 * anything in this payload.
 */
export function reportClientError(payload: ClientErrorPayload): void {
  customFetch(`${import.meta.env.BASE_URL}api/system-logs/report`, {
    method: "POST",
    body: JSON.stringify({ ...payload, platform: "Web" }),
  }).catch(() => {});
}

/** Installs global window-level handlers for errors that escape React's render tree. */
export function installGlobalErrorReporting(): void {
  window.addEventListener("error", (event) => {
    reportClientError({
      logType: "CLIENT_EXCEPTION",
      message: event.error?.message ?? event.message ?? "Unknown window error",
      stackTrace: event.error?.stack,
      metadata: { source: "window.onerror" },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportClientError({
      logType: "CLIENT_EXCEPTION",
      message: reason instanceof Error ? reason.message : String(reason),
      stackTrace: reason instanceof Error ? reason.stack : undefined,
      metadata: { source: "unhandledrejection" },
    });
  });
}
