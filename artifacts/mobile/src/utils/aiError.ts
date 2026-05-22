import { ApiError } from "@workspace/api-client-react";

type ApiErrorBody = {
  error?: string;
  details?: Array<{ path?: string[]; message?: string; code?: string }>;
};

/**
 * Extracts a user-friendly error message from an AI endpoint failure.
 *
 * - 400 responses: reads the structured `{ error, details }` body the server
 *   sends on validation errors so the user sees the real reason (e.g. "Audio
 *   is too large" or "voiceInput is required") rather than a generic string.
 * - In __DEV__ mode the field-level Zod `details` array is appended so
 *   developers can see exactly which fields failed validation.
 * - All other errors fall back to `err.message` and then to `fallback`.
 */
export function getAiErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (err instanceof ApiError && err.status === 400) {
    const body = err.data as ApiErrorBody | null;
    const message = body?.error?.trim() || fallback;

    if (__DEV__ && body?.details && body.details.length > 0) {
      const details = body.details
        .map((d) => {
          const path = d.path && d.path.length > 0 ? d.path.join(".") : "(root)";
          return `• ${path}: ${d.message ?? d.code ?? "invalid"}`;
        })
        .join("\n");
      return `${message}\n\n[Dev] Field errors:\n${details}`;
    }

    return message;
  }

  if (err instanceof Error) {
    return err.message || fallback;
  }

  return fallback;
}
