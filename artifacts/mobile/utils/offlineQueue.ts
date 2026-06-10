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

// AsyncStorage key that holds the serialised queue (JSON array of payloads).
const QUEUE_KEY = "safety_form_offline_queue";

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
 * Read the current queue from AsyncStorage.
 * Returns an empty array when the key is absent or the stored value is invalid.
 */
async function readQueue(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist an updated queue back to AsyncStorage.
 * A write failure is swallowed so it never crashes the caller.
 */
async function writeQueue(queue: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
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
  const queue = await readQueue();
  queue.push({ ...formData, _queuedAt: Date.now() });
  await writeQueue(queue);
}

/**
 * flushOfflineQueue
 *
 * Reads every pending item from AsyncStorage, checks whether the device
 * currently has network connectivity, and – if it does – calls `apiSubmitFn`
 * for each item **sequentially**.  Successfully submitted items are removed
 * from the queue.  Items that fail again are left in place so the next flush
 * can retry them.
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

  // Guard: do nothing when there is no network connection.
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return;

  const queue = await readQueue();
  if (queue.length === 0) return;

  // Work through the queue one item at a time; track which items survive.
  const remaining: any[] = [];

  for (const item of queue) {
    try {
      // Strip the internal bookkeeping field before handing off to the API.
      const { _queuedAt, ...payload } = item;
      await apiSubmitFn(payload);
      // Submission succeeded – item will NOT be pushed back into `remaining`.
    } catch {
      // Submission failed again – keep the item for the next flush attempt.
      remaining.push(item);
    }
  }

  // Persist only the items that still need to be retried.
  await writeQueue(remaining);
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
