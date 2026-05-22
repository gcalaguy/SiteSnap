import { ApiError } from "@workspace/api-client-react";

const RETRY_DELAYS_MS = [1500, 3000] as const;

/**
 * Returns true if the error is a transient network / server problem worth
 * retrying (dropped connection, DNS failure, 5xx).
 * Returns false for 4xx client errors — they will always fail again.
 */
export function isRetryableAiError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status >= 500;
  }
  return true;
}

/**
 * Runs `fn`, retrying up to twice on transient network/server errors with
 * short delays between attempts.  Calls `onRetry(attempt)` before each retry
 * so callers can update UI (e.g. show "Retrying…").
 *
 * 400 validation errors are never retried.
 */
export async function withAiRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const hasMoreAttempts = attempt < RETRY_DELAYS_MS.length;
      if (!hasMoreAttempts || !isRetryableAiError(err)) {
        throw err;
      }
      onRetry?.(attempt + 1);
      await new Promise<void>((resolve) =>
        setTimeout(resolve, RETRY_DELAYS_MS[attempt]),
      );
    }
  }
  throw lastError;
}
