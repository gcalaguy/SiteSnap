import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { customFetch } from "@workspace/api-client-react";
import { getCurrentUserId, onCurrentUserIdChange } from "@/utils/auth";

// Namespaced per signed-in user (see queueKey()) so a note queued by one
// account is never synced under a different account's session — that would
// silently post it into the wrong tenant/project.
const QUEUE_KEY_PREFIX = "offline_note_queue_v1";
const MAX_RETRIES = 3;

function queueKey(userId: string): string {
  return `${QUEUE_KEY_PREFIX}:${userId}`;
}

export interface QueuedNote {
  id: string;
  projectId: number;
  projectName: string;
  content: string;
  status: "pending" | "failed";
  retries: number;
  createdAt: string;
}

interface NoteQueueContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  queue: QueuedNote[];
  enqueueNote: (projectId: number, projectName: string, content: string) => Promise<void>;
  syncQueue: () => Promise<void>;
  retryFailed: () => Promise<void>;
  clearFailed: () => Promise<void>;
}

const NoteQueueContext = createContext<NoteQueueContextValue>({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  queue: [],
  enqueueNote: async () => {},
  syncQueue: async () => {},
  retryFailed: async () => {},
  clearFailed: async () => {},
});

export function useNoteQueue() {
  return useContext(NoteQueueContext);
}

async function loadQueue(userId: string): Promise<QueuedNote[]> {
  try {
    const raw = await AsyncStorage.getItem(queueKey(userId));
    return raw ? (JSON.parse(raw) as QueuedNote[]) : [];
  } catch {
    return [];
  }
}

async function persistQueue(userId: string, queue: QueuedNote[]): Promise<void> {
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
}

export function NoteQueueProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queue, setQueue] = useState<QueuedNote[]>([]);
  const syncLock = useRef(false);
  const prevOnline = useRef(true);

  // Tracks the signed-in Clerk user id (see utils/auth.ts) so the queue can
  // be reloaded from that account's own storage key whenever it changes —
  // an account switch on the same device must never keep showing (or
  // syncing) the previous account's queued notes.
  const [userId, setUserId] = useState<string | null>(getCurrentUserId());
  useEffect(() => onCurrentUserIdChange(setUserId), []);

  useEffect(() => {
    if (!userId) { setQueue([]); return; }
    loadQueue(userId).then(setQueue);
  }, [userId]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
    });
    NetInfo.fetch().then((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
      prevOnline.current = online;
    });
    return unsub;
  }, []);

  const syncQueue = useCallback(async () => {
    if (!userId) return;
    if (syncLock.current) return;
    syncLock.current = true;
    setIsSyncing(true);
    try {
      let current = await loadQueue(userId);
      const pending = current.filter((n) => n.status === "pending");

      for (const note of pending) {
        try {
          await customFetch(`/api/projects/${note.projectId}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: note.content }),
          });
          current = current.filter((n) => n.id !== note.id);
          setQueue([...current]);
        } catch (syncErr) {
          const newRetries = note.retries + 1;
          console.warn("[NoteQueue] sync item failed", { id: note.id, projectId: note.projectId, retries: newRetries, err: String(syncErr) });
          const backoffMs = Math.min(8_000, 500 * 2 ** note.retries) + Math.random() * 500;
          await new Promise<void>((r) => setTimeout(r, backoffMs));
          current = current.map((n) =>
            n.id === note.id
              ? {
                  ...n,
                  retries: newRetries,
                  status: newRetries >= MAX_RETRIES ? ("failed" as const) : ("pending" as const),
                }
              : n
          );
          setQueue([...current]);
        }
      }

      // Single write per pass — O(1) vs per-item O(N²).
      await persistQueue(userId, current);
    } finally {
      setIsSyncing(false);
      syncLock.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (isOnline && !prevOnline.current) {
      const hasPending = queue.some((n) => n.status === "pending");
      if (hasPending) {
        const t = setTimeout(() => syncQueue(), Math.random() * 4000);
        prevOnline.current = isOnline;
        return () => clearTimeout(t);
      }
    }
    prevOnline.current = isOnline;
  }, [isOnline, queue, syncQueue]);

  const enqueueNote = useCallback(
    async (projectId: number, projectName: string, content: string) => {
      if (!userId) return;
      const note: QueuedNote = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        projectName,
        content,
        status: "pending",
        retries: 0,
        createdAt: new Date().toISOString(),
      };
      // Functional updater prevents stale-closure note loss on rapid concurrent enqueues.
      let updated: QueuedNote[] = [];
      setQueue((prev) => { updated = [...prev, note]; return updated; });
      await persistQueue(userId, updated);
    },
    [userId]
  );

  const retryFailed = useCallback(async () => {
    if (!userId) return;
    const updated = queue.map((n) =>
      n.status === "failed" ? { ...n, status: "pending" as const, retries: 0 } : n
    );
    setQueue(updated);
    await persistQueue(userId, updated);
    syncQueue();
  }, [queue, syncQueue, userId]);

  const clearFailed = useCallback(async () => {
    if (!userId) return;
    const updated = queue.filter((n) => n.status !== "failed");
    setQueue(updated);
    await persistQueue(userId, updated);
  }, [queue, userId]);

  const pendingCount = queue.filter((n) => n.status === "pending").length;
  const failedCount = queue.filter((n) => n.status === "failed").length;

  return (
    <NoteQueueContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        failedCount,
        queue,
        enqueueNote,
        syncQueue,
        retryFailed,
        clearFailed,
      }}
    >
      {children}
    </NoteQueueContext.Provider>
  );
}
