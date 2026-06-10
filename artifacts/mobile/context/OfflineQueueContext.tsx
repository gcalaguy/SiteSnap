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
import {
  createDailyReport,
  addReportPhoto,
  customFetch,
} from "@workspace/api-client-react";

const QUEUE_KEY = "offline_report_queue_v1";
const HISTORY_KEY = "offline_report_history_v1";
const MAX_RETRIES = 3;
const MAX_HISTORY = 20;
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOCAL_DIR = `${FileSystem.documentDirectory}offline_photos/`;

export interface QueuePhoto {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

export interface QueuedReport {
  id: string;
  projectId: number;
  reportData: {
    reportDate: string;
    weather?: string;
    crewCount: number;
    workPerformed: string;
    aiSummary?: string;
  };
  photos: QueuePhoto[];
  createdAt: string;
  status: "pending" | "failed";
  retries: number;
}

export interface SyncedReport {
  id: string;
  projectId: number;
  reportData: QueuedReport["reportData"];
  photos: QueuePhoto[];
  createdAt: string;
  syncedAt: string;
}

interface OfflineQueueContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  queue: QueuedReport[];
  syncedHistory: SyncedReport[];
  lastSyncedAt: string | null;
  enqueue: (
    projectId: number,
    reportData: QueuedReport["reportData"],
    photos: QueuePhoto[]
  ) => Promise<void>;
  syncQueue: () => Promise<void>;
  retryFailed: () => Promise<void>;
  clearFailed: () => Promise<void>;
  clearHistory: () => Promise<void>;
}

const OfflineQueueContext = createContext<OfflineQueueContextValue>({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  queue: [],
  syncedHistory: [],
  lastSyncedAt: null,
  enqueue: async () => {},
  syncQueue: async () => {},
  retryFailed: async () => {},
  clearFailed: async () => {},
  clearHistory: async () => {},
});

export function useOfflineQueue() {
  return useContext(OfflineQueueContext);
}

async function loadQueue(): Promise<QueuedReport[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedReport[]) : [];
  } catch {
    return [];
  }
}

async function persistQueue(queue: QueuedReport[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function loadHistory(): Promise<SyncedReport[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SyncedReport[]) : [];
  } catch {
    return [];
  }
}

async function persistHistory(history: SyncedReport[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

async function ensurePhotoDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(LOCAL_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(LOCAL_DIR, { intermediates: true });
}

async function uploadPhoto(photo: QueuePhoto): Promise<string | null> {
  try {
    // M-S1 fix: use customFetch so Clerk JWT + x-tenant-id are always attached
    const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
      "/api/storage/uploads/request-url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: photo.fileName, size: photo.fileSize, contentType: photo.mimeType }),
      },
    );

    // M-S4 fix: validate upload destination before PUT
    const dest = new URL(uploadURL);
    if (!dest.protocol.startsWith("https")) throw new Error("Unexpected upload destination");

    // M-P1 fix: stream from disk — never load file blob into JS heap
    const result = await FileSystem.uploadAsync(uploadURL, photo.uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": photo.mimeType },
    });
    if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed: ${result.status}`);

    return objectPath;
  } catch {
    return null;
  }
}

export function OfflineQueueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queue, setQueue] = useState<QueuedReport[]>([]);
  const [syncedHistory, setSyncedHistory] = useState<SyncedReport[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const syncLock = useRef(false);
  const prevOnline = useRef(true);

  useEffect(() => {
    // M-U2 fix: purge items older than 7 days on startup to prevent stale queue growth
    loadQueue().then(async (q) => {
      const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
      const expired = q.filter((r) => new Date(r.createdAt).getTime() < cutoff);
      for (const r of expired) {
        for (const p of r.photos) {
          await FileSystem.deleteAsync(p.uri, { idempotent: true }).catch(() => {});
        }
      }
      const fresh = q.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
      if (expired.length > 0) await persistQueue(fresh);
      setQueue(fresh);
    });
    loadHistory().then(setSyncedHistory);
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online =
        state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
    });
    NetInfo.fetch().then((state) => {
      const online =
        state.isConnected === true && state.isInternetReachable !== false;
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
      let history = await loadHistory();
      const pending = current.filter((r) => r.status === "pending");

      for (const item of pending) {
        try {
          const report = await createDailyReport(item.projectId, item.reportData);
          for (const photo of item.photos) {
            const objectPath = await uploadPhoto(photo);
            if (objectPath) {
              await addReportPhoto(item.projectId, report.id, {
                objectPath,
              }).catch(() => {});
            }
          }

          const synced: SyncedReport = {
            id: item.id,
            projectId: item.projectId,
            reportData: item.reportData,
            photos: item.photos,
            createdAt: item.createdAt,
            syncedAt: new Date().toISOString(),
          };

          history = [synced, ...history].slice(0, MAX_HISTORY);
          await persistHistory(history);
          setSyncedHistory([...history]);
          setLastSyncedAt(synced.syncedAt);

          current = current.filter((r) => r.id !== item.id);
          await persistQueue(current);
          setQueue([...current]);
        } catch {
          const newRetries = item.retries + 1;
          current = current.map((r) =>
            r.id === item.id
              ? {
                  ...r,
                  retries: newRetries,
                  status:
                    newRetries >= MAX_RETRIES
                      ? ("failed" as const)
                      : ("pending" as const),
                }
              : r
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
      const hasPending = queue.some((r) => r.status === "pending");
      if (hasPending) syncQueue();
    }
    prevOnline.current = isOnline;
  }, [isOnline, queue, syncQueue]);

  const enqueue = useCallback(
    async (
      projectId: number,
      reportData: QueuedReport["reportData"],
      photos: QueuePhoto[]
    ) => {
      // M-SC1 fix: copy each photo to a stable documentDirectory path so the
      // URI remains valid across app restarts (camera roll URIs can be invalidated)
      await ensurePhotoDir();
      const stablePhotos: QueuePhoto[] = await Promise.all(
        photos.map(async (p) => {
          const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const ext = p.fileName.split(".").pop() ?? "jpg";
          const dest = `${LOCAL_DIR}${id}.${ext}`;
          await FileSystem.copyAsync({ from: p.uri, to: dest });
          return { ...p, uri: dest };
        }),
      );

      const item: QueuedReport = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        reportData,
        photos: stablePhotos,
        createdAt: new Date().toISOString(),
        status: "pending",
        retries: 0,
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
    const updated = queue.map((r) =>
      r.status === "failed"
        ? { ...r, status: "pending" as const, retries: 0 }
        : r
    );
    setQueue(updated);
    await persistQueue(updated);
    syncQueue();
  }, [queue, syncQueue]);

  const clearFailed = useCallback(async () => {
    // M-U2 fix: delete stable local photo copies when clearing failed items
    const failed = queue.filter((r) => r.status === "failed");
    for (const r of failed) {
      for (const p of r.photos) {
        await FileSystem.deleteAsync(p.uri, { idempotent: true }).catch(() => {});
      }
    }
    const updated = queue.filter((r) => r.status !== "failed");
    setQueue(updated);
    await persistQueue(updated);
  }, [queue]);

  const clearHistory = useCallback(async () => {
    setSyncedHistory([]);
    await persistHistory([]);
  }, []);

  const pendingCount = queue.filter((r) => r.status === "pending").length;
  const failedCount = queue.filter((r) => r.status === "failed").length;

  return (
    <OfflineQueueContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        failedCount,
        queue,
        syncedHistory,
        lastSyncedAt,
        enqueue,
        syncQueue,
        retryFailed,
        clearFailed,
        clearHistory,
      }}
    >
      {children}
    </OfflineQueueContext.Provider>
  );
}
