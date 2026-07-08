import { Platform } from "react-native";
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
 * header (set in app/_layout.tsx), so the backend resolves user/company
 * identity from those, not from anything in this payload.
 */
export function reportClientError(payload: ClientErrorPayload): void {
  customFetch("/api/system-logs/report", {
    method: "POST",
    body: JSON.stringify({ ...payload, platform: Platform.OS === "ios" ? "iOS" : "Android" }),
  }).catch(() => {});
}
