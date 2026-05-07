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

const QUEUE_KEY = "offline_note_queue_v1";
const MAX_RETRIES = 3;

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

async function loadQueue(): Promise<QueuedNote[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedNote[]) : [];
  } catch {
    return [];
  }
}

async function persistQueue(queue: QueuedNote[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function NoteQueueProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queue, setQueue] = useState<QueuedNote[]>([]);
  const syncLock = useRef(false);
  const prevOnline = useRef(true);

  useEffect(() => {
    loadQueue().then(setQueue);
  }, []);

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
    if (syncLock.current) return;
    syncLock.current = true;
    setIsSyncing(true);
    try {
      let current = await loadQueue();
      const pending = current.filter((n) => n.status === "pending");

      for (const note of pending) {
        try {
          await customFetch(`/api/projects/${note.projectId}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: note.content }),
          });
          current = current.filter((n) => n.id !== note.id);
          await persistQueue(current);
          setQueue([...current]);
        } catch {
          const newRetries = note.retries + 1;
          current = current.map((n) =>
            n.id === note.id
              ? {
                  ...n,
                  retries: newRetries,
                  status: newRetries >= MAX_RETRIES ? ("failed" as const) : ("pending" as const),
                }
              : n
          );
          await persistQueue(current);
          setQueue([...current]);
        }
      }
    } finally {
      setIsSyncing(false);
      syncLock.current = false;
    }
  }, []);

  useEffect(() => {
    if (isOnline && !prevOnline.current) {
      const hasPending = queue.some((n) => n.status === "pending");
      if (hasPending) syncQueue();
    }
    prevOnline.current = isOnline;
  }, [isOnline, queue, syncQueue]);

  const enqueueNote = useCallback(
    async (projectId: number, projectName: string, content: string) => {
      const note: QueuedNote = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        projectName,
        content,
        status: "pending",
        retries: 0,
        createdAt: new Date().toISOString(),
      };
      const updated = [...queue, note];
      setQueue(updated);
      await persistQueue(updated);
    },
    [queue]
  );

  const retryFailed = useCallback(async () => {
    const updated = queue.map((n) =>
      n.status === "failed" ? { ...n, status: "pending" as const, retries: 0 } : n
    );
    setQueue(updated);
    await persistQueue(updated);
    syncQueue();
  }, [queue, syncQueue]);

  const clearFailed = useCallback(async () => {
    const updated = queue.filter((n) => n.status !== "failed");
    setQueue(updated);
    await persistQueue(updated);
  }, [queue]);

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
