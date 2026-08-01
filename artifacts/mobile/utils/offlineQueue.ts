/**
 * offlineQueue.ts
 *
 * Offline submission queue for the Safety Check form (and any other form that
 * follows the same pattern).  Submissions that fail because the device is
 * offline – or because a network request times out – are persisted to
 * AsyncStorage so they can be retried automatically the next time the device
 * regains connectivity.
 *
 * Public API
 * ----------
 * queueOffline(formData)          – push one failed submission onto the queue.
 * flushOfflineQueue(apiSubmitFn)  – drain the queue, re-submitting each item
 *                                   through apiSubmitFn when the network is up.
 *
 * The module also registers a single, long-lived NetInfo listener (once, on
 * first import) so that any pending items are flushed automatically whenever
 * connectivity is restored – even if the safety-check screen is not mounted.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { ApiError } from "@workspace/api-client-react";
import { getCurrentUserId } from "./auth";

// AsyncStorage key prefix that holds the serialised queue (JSON array of
// payloads), namespaced per signed-in user (see queueKey()) so a queued
// submission from one account is never flushed under a different account's
// session — that would silently submit it to the wrong tenant.
const QUEUE_KEY_PREFIX = "safety_form_offline_queue";

function queueKey(userId: string): string {
  return `${QUEUE_KEY_PREFIX}:${userId}`;
}

// Matches OfflineQueueContext.tsx's cap — after this many failed attempts an
// item stops being retried automatically instead of being resubmitted forever.
const MAX_RETRIES = 3;

/**
 * A 4xx response (other than 429/408, which are typically transient rate
 * limits/timeouts) means the payload itself is invalid — retrying it
 * unchanged will just fail the same way every time. Anything else (network
 * errors, 5xx, 429, 408) is treated as transient and worth retrying.
 */
function isPermanentFailure(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 408;
  }
  return false;
}

// ---------------------------------------------------------------------------
// M-SC3 fix: The module-level NetInfo listener has been removed.
// Use startOfflineQueueListener() / stopOfflineQueueListener() instead so the
// caller controls the subscription lifetime and we never accumulate listeners.
// ---------------------------------------------------------------------------

let _storedApiSubmitFn: ((data: any) => Promise<any>) | null = null;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Read the current user's queue from AsyncStorage.
 * Returns an empty array when the key is absent or the stored value is invalid.
 */
async function readQueue(userId: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(queueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist an updated queue back to AsyncStorage, scoped to the given user.
 * A write failure is swallowed so it never crashes the caller.
 */
async function writeQueue(userId: string, queue: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
  } catch {
    // Nothing we can do if storage is unavailable; the item is simply lost.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * queueOffline
 *
 * Appends `formData` to the persisted offline queue.  Call this whenever a
 * submission attempt fails because the device is offline or the request times
 * out, so the payload is not permanently lost.
 *
 * @param formData – the raw form payload that could not be submitted.
 */
export async function queueOffline(formData: any): Promise<void> {
  const userId = getCurrentUserId();
  // No signed-in user to scope this to (e.g. mid-sign-out race) — nothing
  // safe to persist. The submission is lost, same as any other storage
  // failure this module already swallows.
  if (!userId) return;
  const queue = await readQueue(userId);
  queue.push({ ...formData, _queuedAt: Date.now(), _retries: 0 });
  await writeQueue(userId, queue);
}

/**
 * flushOfflineQueue
 *
 * Reads every non-failed item from AsyncStorage, checks whether the device
 * currently has network connectivity, and – if it does – calls `apiSubmitFn`
 * for each item **sequentially**.  Successfully submitted items are removed
 * from the queue.  Items that fail with a transient error (network issue,
 * 5xx, 429, 408) are left in place, up to MAX_RETRIES attempts, so the next
 * flush can retry them.  Items that fail with a permanent error (any other
 * 4xx – the payload itself is invalid) or that exhaust MAX_RETRIES are marked
 * `_failed` and skipped by future flushes — kept in storage rather than
 * silently discarded, since nothing else in this module can recover them once
 * gone.
 *
 * Storing `apiSubmitFn` in module scope also keeps the global NetInfo listener
 * (see below) up-to-date with the caller's latest reference.
 *
 * @param apiSubmitFn – async function that accepts one queued payload and
 *                      performs the actual API call; should throw on failure.
 */
export async function flushOfflineQueue(
  apiSubmitFn: (data: any) => Promise<any>
): Promise<void> {
  _storedApiSubmitFn = apiSubmitFn;

  // Resolve the *current* signed-in user at flush time (not at listener
  // registration time — see startOfflineQueueListener below) so a flush
  // triggered by a reconnect event always operates on whoever is actually
  // signed in right now, never a stale account from before a switch.
  const userId = getCurrentUserId();
  if (!userId) return;

  // Guard: do nothing when there is no network connection.
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return;

  const queue = await readQueue(userId);
  if (queue.length === 0) return;

  // Work through the queue one item at a time; track which items survive.
  const remaining: any[] = [];

  for (const item of queue) {
    if (item._failed) {
      // Already given up on this item in a previous flush — leave it in
      // storage untouched instead of retrying it forever.
      remaining.push(item);
      continue;
    }

    try {
      // Strip the internal bookkeeping fields before handing off to the API.
      const { _queuedAt, _retries, _failed, ...payload } = item;
      await apiSubmitFn(payload);
      // Submission succeeded – item will NOT be pushed back into `remaining`.
    } catch (err) {
      const retries = (item._retries ?? 0) + 1;
      if (isPermanentFailure(err) || retries >= MAX_RETRIES) {
        // Payload is invalid, or we've retried enough times — stop trying,
        // but keep the item around so it isn't silently lost.
        remaining.push({ ...item, _retries: retries, _failed: true });
        continue;
      }
      // Transient failure – keep the item, with its retry count bumped, for
      // the next flush attempt.
      remaining.push({ ...item, _retries: retries });
    }
  }

  // Persist every item that either still needs retrying or has terminally failed.
  await writeQueue(userId, remaining);
}

// ---------------------------------------------------------------------------
// M-SC3 fix: Explicit listener lifecycle — mount once, unsubscribe on cleanup
// ---------------------------------------------------------------------------

let _previouslyConnected: boolean | null = null;
let _netInfoUnsub: (() => void) | null = null;

/**
 * Call this from your top-level provider's useEffect to start watching for
 * reconnects. Returns a cleanup function — call it in the effect's return.
 */
export function startOfflineQueueListener(
  apiSubmitFn: (data: any) => Promise<any>
): () => void {
  _storedApiSubmitFn = apiSubmitFn;

  if (_netInfoUnsub) {
    // Already listening — just update the fn reference
    return stopOfflineQueueListener;
  }

  _netInfoUnsub = NetInfo.addEventListener((state) => {
    const nowConnected = state.isConnected ?? false;
    if (nowConnected && _previouslyConnected === false && _storedApiSubmitFn) {
      flushOfflineQueue(_storedApiSubmitFn).catch(() => {});
    }
    _previouslyConnected = nowConnected;
  });

  return stopOfflineQueueListener;
}

export function stopOfflineQueueListener(): void {
  _netInfoUnsub?.();
  _netInfoUnsub = null;
}
