import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";

const CACHE_KEY = "rq_offline_cache_v2";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PERSIST_INTERVAL_MS = 15_000;

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
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed: PersistedCache = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > MAX_AGE_MS) {
      await AsyncStorage.removeItem(CACHE_KEY);
      return;
    }
    for (const entry of parsed.entries) {
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
        .filter((q) => q.state.status === "success" && q.state.data !== undefined)
        .map((q) => ({ queryKey: q.queryKey as unknown[], data: q.state.data }));

      if (entries.length === 0) return;

      const payload: PersistedCache = { timestamp: Date.now(), entries };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
    }
  }, PERSIST_INTERVAL_MS);

  return () => {
    unsubscribe();
    clearInterval(intervalId);
  };
}
