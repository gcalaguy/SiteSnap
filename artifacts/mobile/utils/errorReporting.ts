import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { customFetch } from "@workspace/api-client-react";

// A fatal startup crash kills the process before the fire-and-forget POST in
// reportClientError can leave the device, which is exactly why TestFlight
// crash-on-open builds produce zero rows in system_logs. The global handler in
// app/_layout.tsx persists the fatal payload here first, and the next launch
// re-sends it (flushPendingCrashReport) before deleting the breadcrumb.
const PENDING_CRASH_KEY = "pending_crash_report_v1";

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
 * header (set in app/_layout.tsx), so the backend resolves user/company
 * identity from those, not from anything in this payload.
 */
export function reportClientError(payload: ClientErrorPayload): void {
  customFetch("/api/system-logs/report", {
    method: "POST",
    body: JSON.stringify({ ...payload, platform: Platform.OS === "ios" ? "iOS" : "Android" }),
  }).catch(() => {});
}

/**
 * Persist a fatal-crash payload to AsyncStorage so it survives process death.
 * Resolves (never rejects) once the write settles — the caller races this
 * against a timeout before letting the default fatal handler run.
 */
export function persistCrashReport(payload: ClientErrorPayload): Promise<void> {
  const record: ClientErrorPayload = {
    ...payload,
    // crashedAt goes inside metadata — the server's ReportBody schema strips
    // unknown top-level keys, but metadata is a free-form record.
    metadata: { ...payload.metadata, crashedAt: new Date().toISOString() },
  };
  return AsyncStorage.setItem(PENDING_CRASH_KEY, JSON.stringify(record)).catch(() => {});
}

/**
 * Send any crash breadcrumb left by a previous launch, then delete it — but
 * only after the POST succeeds, so a crash report is never lost to a flaky
 * network. POST /system-logs/report accepts unauthenticated requests, so this
 * works even when the crash happened before sign-in. Call once at startup.
 */
export async function flushPendingCrashReport(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_CRASH_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as ClientErrorPayload;
    await customFetch("/api/system-logs/report", {
      method: "POST",
      body: JSON.stringify({
        ...stored,
        logType: stored.logType || "CLIENT_EXCEPTION",
        metadata: { ...stored.metadata, source: "fatal-crash-breadcrumb" },
        platform: Platform.OS === "ios" ? "iOS" : "Android",
      }),
    });
    await AsyncStorage.removeItem(PENDING_CRASH_KEY);
  } catch {
    // Keep the breadcrumb for the next launch.
  }
}
