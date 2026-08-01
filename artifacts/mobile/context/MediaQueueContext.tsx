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
import * as FileSystem from "expo-file-system/legacy";
import { customFetch } from "@workspace/api-client-react";

const QUEUE_KEY = "offline_media_queue_v1";
const LOCAL_DIR = `${FileSystem.documentDirectory}offline_media/`;
const MAX_RETRIES = 3;

export type MediaType = "photo" | "document";

export interface QueuedMedia {
  id: string;
  type: MediaType;
  localPath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  label: string;
  endpoint: string;
  body: Record<string, unknown>;
  status: "pending" | "failed";
  retries: number;
  createdAt: string;
}

interface MediaQueueContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  queue: QueuedMedia[];
  enqueueMedia: (params: {
    sourceUri: string;
    type: MediaType;
    fileName: string;
    mimeType: string;
    fileSize: number;
    label: string;
    endpoint: string;
    body?: Record<string, unknown>;
  }) => Promise<void>;
  syncQueue: () => Promise<void>;
  retryFailed: () => Promise<void>;
  clearFailed: () => Promise<void>;
}

const MediaQueueContext = createContext<MediaQueueContextValue>({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  queue: [],
  enqueueMedia: async () => {},
  syncQueue: async () => {},
  retryFailed: async () => {},
  clearFailed: async () => {},
});

export function useMediaQueue() {
  return useContext(MediaQueueContext);
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(LOCAL_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LOCAL_DIR, { intermediates: true });
  }
}

async function loadQueue(): Promise<QueuedMedia[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMedia[]) : [];
  } catch {
    return [];
  }
}

async function persistQueue(queue: QueuedMedia[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function uploadAndPost(item: QueuedMedia): Promise<void> {
  const { uploadURL, objectPath } = await customFetch<{
    uploadURL: string;
    objectPath: string;
  }>("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: item.fileName,
      size: item.fileSize,
      contentType: item.mimeType,
    }),
  });

  // M-U1/M-P1 fix: stream directly from disk — never load file into JS heap
  const allowed = new URL(uploadURL);
  if (!allowed.protocol.startsWith("https")) throw new Error("Unexpected upload destination protocol");

  const uploadResult = await FileSystem.uploadAsync(uploadURL, item.localPath, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": item.mimeType },
  });
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Upload PUT failed: ${uploadResult.status}`);
  }

  await customFetch(item.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...item.body, objectPath }),
  });

  await FileSystem.deleteAsync(item.localPath, { idempotent: true });
}

export function MediaQueueProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queue, setQueue] = useState<QueuedMedia[]>([]);
  const syncLock = useRef(false);
  const prevOnline = useRef(true);

  useEffect(() => {
    ensureDir().catch(() => {});
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
      const pending = current.filter((m) => m.status === "pending");

      for (const item of pending) {
        try {
          await uploadAndPost(item);
          current = current.filter((m) => m.id !== item.id);
          setQueue([...current]);
        } catch (syncErr) {
          const newRetries = item.retries + 1;
          console.warn("[MediaQueue] sync item failed", { id: item.id, endpoint: item.endpoint, retries: newRetries, err: String(syncErr) });
          const backoffMs = Math.min(8_000, 500 * 2 ** item.retries) + Math.random() * 500;
          await new Promise<void>((r) => setTimeout(r, backoffMs));
          current = current.map((m) =>
            m.id === item.id
              ? {
                  ...m,
                  retries: newRetries,
                  status: newRetries >= MAX_RETRIES ? ("failed" as const) : ("pending" as const),
                }
              : m
          );
          setQueue([...current]);
        }
      }

      // Single write per pass — O(1) vs per-item O(N²).
      await persistQueue(current);
    } finally {
      setIsSyncing(false);
      syncLock.current = false;
    }
  }, []);

  useEffect(() => {
    if (isOnline && !prevOnline.current) {
      const hasPending = queue.some((m) => m.status === "pending");
      if (hasPending) {
        const t = setTimeout(() => syncQueue(), Math.random() * 4000);
        prevOnline.current = isOnline;
        return () => clearTimeout(t);
      }
    }
    prevOnline.current = isOnline;
  }, [isOnline, queue, syncQueue]);

  const enqueueMedia = useCallback(
    async ({
      sourceUri,
      type,
      fileName,
      mimeType,
      fileSize,
      label,
      endpoint,
      body = {},
    }: {
      sourceUri: string;
      type: MediaType;
      fileName: string;
      mimeType: string;
      fileSize: number;
      label: string;
      endpoint: string;
      body?: Record<string, unknown>;
    }) => {
      await ensureDir();
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const ext = fileName.split(".").pop() ?? (type === "photo" ? "jpg" : "bin");
      const localPath = `${LOCAL_DIR}${id}.${ext}`;

      await FileSystem.copyAsync({ from: sourceUri, to: localPath });

      const item: QueuedMedia = {
        id,
        type,
        localPath,
        fileName,
        mimeType,
        fileSize,
        label,
        endpoint,
        body,
        status: "pending",
        retries: 0,
        createdAt: new Date().toISOString(),
      };

      // M-SC5 fix: functional updater avoids stale closure on rapid enqueue
      setQueue((prev) => {
        const updated = [...prev, item];
        persistQueue(updated).catch(() => {});
        return updated;
      });
    },
    []
  );

  const retryFailed = useCallback(async () => {
    const updated = queue.map((m) =>
      m.status === "failed" ? { ...m, status: "pending" as const, retries: 0 } : m
    );
    setQueue(updated);
    await persistQueue(updated);
    syncQueue();
  }, [queue, syncQueue]);

  const clearFailed = useCallback(async () => {
    const toDelete = queue.filter((m) => m.status === "failed");
    for (const item of toDelete) {
      await FileSystem.deleteAsync(item.localPath, { idempotent: true });
    }
    const updated = queue.filter((m) => m.status !== "failed");
    setQueue(updated);
    await persistQueue(updated);
  }, [queue]);

  const pendingCount = queue.filter((m) => m.status === "pending").length;
  const failedCount = queue.filter((m) => m.status === "failed").length;

  return (
    <MediaQueueContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        failedCount,
        queue,
        enqueueMedia,
        syncQueue,
        retryFailed,
        clearFailed,
      }}
    >
      {children}
    </MediaQueueContext.Provider>
  );
}
