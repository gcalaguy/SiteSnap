import NetInfo from "@react-native-community/netinfo";
import { ApiError } from "@workspace/api-client-react";

const RETRY_DELAYS_MS = [1500, 3000] as const;
const MAX_SERVER_ERROR_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

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
 * Waits until NetInfo reports the device is online.
 * Returns immediately if already connected.
 */
async function waitForConnectivity(): Promise<void> {
  const state = await NetInfo.fetch();
  const alreadyOnline =
    state.isConnected === true && state.isInternetReachable !== false;
  if (alreadyOnline) return;

  return new Promise<void>((resolve) => {
    const unsub = NetInfo.addEventListener((netState) => {
      const online =
        netState.isConnected === true && netState.isInternetReachable !== false;
      if (online) {
        unsub();
        resolve();
      }
    });
  });
}

/**
 * Runs `fn`, retrying on transient network/server errors with short delays.
 *
 * When the device is **offline** (before the first attempt or mid-retry),
 * the call is held until connectivity is restored instead of failing
 * immediately.  The server-error retry budget (3 attempts) resets each time
 * the device comes back online so a brief dead-zone never exhausts retries.
 *
 * Callbacks:
 *   onRetry(attempt)  — called before each server-error retry (UI: "Retrying…")
 *   onWaiting()       — called when the device is offline (UI: "Waiting for connection…")
 *
 * 400 validation errors are never retried.
 */
export async function withAiRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number) => void,
  onWaiting?: () => void,
): Promise<T> {
  const initialState = await NetInfo.fetch();
  const initiallyOnline =
    initialState.isConnected === true &&
    initialState.isInternetReachable !== false;
  if (!initiallyOnline) {
    onWaiting?.();
    await waitForConnectivity();
  }

  let serverErrorAttempts = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableAiError(err)) {
        throw err;
      }

      const netState = await NetInfo.fetch();
      const online =
        netState.isConnected === true && netState.isInternetReachable !== false;

      if (!online) {
        onWaiting?.();
        await waitForConnectivity();
        serverErrorAttempts = 0;
        continue;
      }

      serverErrorAttempts++;
      if (serverErrorAttempts >= MAX_SERVER_ERROR_ATTEMPTS) {
        throw err;
      }

      onRetry?.(serverErrorAttempts);
      await new Promise<void>((resolve) =>
        setTimeout(resolve, RETRY_DELAYS_MS[serverErrorAttempts - 1]),
      );
    }
  }
}
