import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";

// Bumped to v3: earlier builds could persist an HTML error page as a successful
// result, and installing an update does not clear AsyncStorage — without a new
// key those devices would rehydrate the poisoned cache and keep crashing on the
// fixed build too. Superseded keys are deleted on first run below.
const CACHE_KEY = "rq_offline_cache_v3";
const LEGACY_CACHE_KEYS = ["rq_offline_cache_v2", "rq_offline_cache"];
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PERSIST_INTERVAL_MS = 15_000;
// M-SC2 fix: cap total cache size to stay safely under AsyncStorage's ~6 MB limit
const MAX_CACHE_BYTES = 2 * 1024 * 1024; // 2 MB

// Keys whose data is too sensitive or too large to persist to plaintext AsyncStorage
const EXCLUDED_KEY_PREFIXES = [
  "signedUrl",        // presigned photo URLs — short-lived, no value in persisting
  "resendApiKey",     // any billing / key query
  "stripe",
];

interface CacheEntry {
  queryKey: unknown[];
  data: unknown;
}

interface PersistedCache {
  timestamp: number;
  entries: CacheEntry[];
}

export async function hydrateQueryCache(queryClient: QueryClient): Promise<void> {
  try {
    await AsyncStorage.multiRemove(LEGACY_CACHE_KEYS).catch(() => {});
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed: PersistedCache = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > MAX_AGE_MS) {
      await AsyncStorage.removeItem(CACHE_KEY);
      return;
    }
    for (const entry of parsed.entries) {
      // Never restore a markup payload: it is an error page that was mistaken
      // for data, and screens expecting an array crash on it.
      if (typeof entry.data === "string" && entry.data.trimStart().startsWith("<")) {
        continue;
      }
      const existing = queryClient.getQueryState(entry.queryKey);
      if (existing?.status !== "success") {
        queryClient.setQueryData(entry.queryKey, entry.data);
      }
    }
  } catch {
  }
}

export function startCachePersistence(queryClient: QueryClient): () => void {
  let dirty = false;

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event?.type === "updated" && event.query.state.status === "success") {
      dirty = true;
    }
  });

  const intervalId = setInterval(async () => {
    if (!dirty) return;
    dirty = false;
    try {
      const entries: CacheEntry[] = queryClient
        .getQueryCache()
        .getAll()
        .filter((q) => {
          if (q.state.status !== "success" || q.state.data === undefined) return false;
          // M-SC2 fix: exclude sensitive or high-cardinality query keys
          const keyStr = JSON.stringify(q.queryKey).toLowerCase();
          return !EXCLUDED_KEY_PREFIXES.some((p) => keyStr.includes(p));
        })
        .map((q) => ({ queryKey: q.queryKey as unknown[], data: q.state.data }));

      if (entries.length === 0) return;

      const payload: PersistedCache = { timestamp: Date.now(), entries };
      const serialised = JSON.stringify(payload);

      // M-SC2 fix: skip write if payload exceeds safe AsyncStorage size threshold
      if (serialised.length > MAX_CACHE_BYTES) return;

      await AsyncStorage.setItem(CACHE_KEY, serialised);
    } catch {
    }
  }, PERSIST_INTERVAL_MS);

  return () => {
    unsubscribe();
    clearInterval(intervalId);
  };
}
