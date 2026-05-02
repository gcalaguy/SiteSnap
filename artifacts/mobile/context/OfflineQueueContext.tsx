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
import {
  createDailyReport,
  addReportPhoto,
  customFetch,
} from "@workspace/api-client-react";

const QUEUE_KEY = "offline_report_queue_v1";
const MAX_RETRIES = 3;

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

interface OfflineQueueContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  enqueue: (
    projectId: number,
    reportData: QueuedReport["reportData"],
    photos: QueuePhoto[]
  ) => Promise<void>;
  syncQueue: () => Promise<void>;
  retryFailed: () => Promise<void>;
  clearFailed: () => Promise<void>;
}

const OfflineQueueContext = createContext<OfflineQueueContextValue>({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  enqueue: async () => {},
  syncQueue: async () => {},
  retryFailed: async () => {},
  clearFailed: async () => {},
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

async function uploadPhoto(photo: QueuePhoto): Promise<string | null> {
  try {
    const res = await customFetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: photo.fileName,
        size: photo.fileSize,
        contentType: photo.mimeType,
      }),
    });
    if (!res.ok) throw new Error("Failed to get upload URL");
    const { uploadURL, objectPath } = (await res.json()) as {
      uploadURL: string;
      objectPath: string;
    };

    const fileRes = await fetch(photo.uri);
    const blob = await fileRes.blob();

    const putRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": photo.mimeType },
      body: blob,
    });
    if (!putRes.ok) throw new Error("Upload failed");
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
  const syncLock = useRef(false);
  const prevOnline = useRef(true);

  useEffect(() => {
    loadQueue().then(setQueue);
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
      const pending = current.filter((r) => r.status === "pending");
      for (const item of pending) {
        try {
          const report = await createDailyReport(
            item.projectId,
            item.reportData
          );
          for (const photo of item.photos) {
            const objectPath = await uploadPhoto(photo);
            if (objectPath) {
              await addReportPhoto(item.projectId, report.id, {
                objectPath,
              }).catch(() => {});
            }
          }
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
                  status: newRetries >= MAX_RETRIES ? "failed" : "pending",
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
      const item: QueuedReport = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        reportData,
        photos,
        createdAt: new Date().toISOString(),
        status: "pending",
        retries: 0,
      };
      const updated = [...queue, item];
      setQueue(updated);
      await persistQueue(updated);
    },
    [queue]
  );

  const retryFailed = useCallback(async () => {
    const updated = queue.map((r) =>
      r.status === "failed" ? { ...r, status: "pending" as const, retries: 0 } : r
    );
    setQueue(updated);
    await persistQueue(updated);
    syncQueue();
  }, [queue, syncQueue]);

  const clearFailed = useCallback(async () => {
    const updated = queue.filter((r) => r.status !== "failed");
    setQueue(updated);
    await persistQueue(updated);
  }, [queue]);

  const pendingCount = queue.filter((r) => r.status === "pending").length;
  const failedCount = queue.filter((r) => r.status === "failed").length;

  return (
    <OfflineQueueContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        failedCount,
        enqueue,
        syncQueue,
        retryFailed,
        clearFailed,
      }}
    >
      {children}
    </OfflineQueueContext.Provider>
  );
}
