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
  submitTimesheet,
  createFormSubmission,
  customFetch,
} from "@workspace/api-client-react";
import type {
  SubmitTimesheetBody,
  CreateFormSubmissionBody,
} from "@workspace/api-client-react";

const QUEUE_KEY = "offline_op_queue_v2";
const HISTORY_KEY = "offline_op_history_v2";
const MAX_RETRIES = 3;
const MAX_HISTORY = 20;
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOCAL_DIR = `${FileSystem.documentDirectory}offline_photos/`;

// ── Photo attachment (only used by daily-report operations) ──────────────────

export interface QueuePhoto {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

// ── Discriminated union of offline-able operations ───────────────────────────

export interface DailyReportOp {
  type: "daily_report";
  projectId: number;
  reportData: {
    reportDate: string;
    weather?: string;
    crewCount: number;
    workPerformed: string;
    aiSummary?: string;
  };
  photos: QueuePhoto[];
}

export interface TimesheetOp {
  type: "timesheet";
  body: SubmitTimesheetBody;
}

export interface SafetyFormOp {
  type: "safety_form";
  body: CreateFormSubmissionBody;
}

export type OfflineOp = DailyReportOp | TimesheetOp | SafetyFormOp;

// ── Queue item wrapper ────────────────────────────────────────────────────────

export interface QueuedItem {
  id: string;
  op: OfflineOp;
  createdAt: string;
  status: "pending" | "failed";
  retries: number;
}

export interface SyncedItem {
  id: string;
  op: OfflineOp;
  createdAt: string;
  syncedAt: string;
}

// ── Legacy alias so existing call-sites that enqueue daily reports still work ─
export type QueuedReport = QueuedItem & { op: DailyReportOp };

// ── Context shape ─────────────────────────────────────────────────────────────

interface OfflineQueueContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  queue: QueuedItem[];
  syncedHistory: SyncedItem[];
  lastSyncedAt: string | null;
  enqueueReport: (
    projectId: number,
    reportData: DailyReportOp["reportData"],
    photos: QueuePhoto[]
  ) => Promise<void>;
  enqueueTimesheet: (body: SubmitTimesheetBody) => Promise<void>;
  enqueueSafetyForm: (body: CreateFormSubmissionBody) => Promise<void>;
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
  enqueueReport: async () => {},
  enqueueTimesheet: async () => {},
  enqueueSafetyForm: async () => {},
  syncQueue: async () => {},
  retryFailed: async () => {},
  clearFailed: async () => {},
  clearHistory: async () => {},
});

export function useOfflineQueue() {
  return useContext(OfflineQueueContext);
}

// ── Persistence helpers ───────────────────────────────────────────────────────

async function loadQueue(): Promise<QueuedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedItem[]) : [];
  } catch {
    return [];
  }
}

async function persistQueue(queue: QueuedItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function loadHistory(): Promise<SyncedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SyncedItem[]) : [];
  } catch {
    return [];
  }
}

async function persistHistory(history: SyncedItem[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

async function ensurePhotoDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(LOCAL_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(LOCAL_DIR, { intermediates: true });
}

async function uploadPhoto(photo: QueuePhoto): Promise<string> {
  const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
    "/api/storage/uploads/request-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: photo.fileName, size: photo.fileSize, contentType: photo.mimeType }),
    },
  );

  const dest = new URL(uploadURL);
  if (!dest.protocol.startsWith("https")) throw new Error("Unexpected upload destination");

  const result = await FileSystem.uploadAsync(uploadURL, photo.uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": photo.mimeType },
  });
  if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed: ${result.status}`);

  return objectPath;
}

// ── Execute a single queued operation ────────────────────────────────────────

async function executeOp(item: QueuedItem): Promise<void> {
  const { op } = item;

  if (op.type === "daily_report") {
    const report = await createDailyReport(
      op.projectId,
      { ...op.reportData, clientIdempotencyKey: item.id } as Parameters<typeof createDailyReport>[1],
    );
    for (const photo of op.photos) {
      const objectPath = await uploadPhoto(photo); // throws → sync loop retries this item
      await addReportPhoto(op.projectId, report.id, { objectPath }).catch(() => {});
    }
    return;
  }

  if (op.type === "timesheet") {
    await submitTimesheet(op.body);
    return;
  }

  if (op.type === "safety_form") {
    await createFormSubmission(op.body);
    return;
  }
}

async function deletePhotoFiles(item: QueuedItem): Promise<void> {
  if (item.op.type === "daily_report") {
    for (const p of item.op.photos) {
      await FileSystem.deleteAsync(p.uri, { idempotent: true }).catch(() => {});
    }
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function OfflineQueueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [syncedHistory, setSyncedHistory] = useState<SyncedItem[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const syncLock = useRef(false);
  const prevOnline = useRef(true);

  useEffect(() => {
    loadQueue().then(async (q) => {
      const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
      const expired = q.filter((r) => new Date(r.createdAt).getTime() < cutoff);
      for (const r of expired) await deletePhotoFiles(r);
      const fresh = q.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
      if (expired.length > 0) await persistQueue(fresh);
      setQueue(fresh);
    });
    loadHistory().then(setSyncedHistory);
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
      let history = await loadHistory();
      const pending = current.filter((r) => r.status === "pending");

      let historyChanged = false;
      let lastSynced: string | null = null;

      for (const item of pending) {
        try {
          await executeOp(item);

          const synced: SyncedItem = {
            id: item.id,
            op: item.op,
            createdAt: item.createdAt,
            syncedAt: new Date().toISOString(),
          };

          history = [synced, ...history].slice(0, MAX_HISTORY);
          current = current.filter((r) => r.id !== item.id);
          lastSynced = synced.syncedAt;
          historyChanged = true;
          setQueue([...current]);
        } catch (syncErr) {
          const newRetries = item.retries + 1;
          console.warn("[OfflineQueue] sync item failed", { id: item.id, op: item.op, retries: newRetries, err: String(syncErr) });
          // Exponential back-off: 500 ms × 2^retries + jitter, capped at 8 s.
          // Prevents hammering an overloaded server on consecutive failures.
          const backoffMs = Math.min(8_000, 500 * 2 ** item.retries) + Math.random() * 500;
          await new Promise<void>((r) => setTimeout(r, backoffMs));
          current = current.map((r) =>
            r.id === item.id
              ? { ...r, retries: newRetries, status: newRetries >= MAX_RETRIES ? ("failed" as const) : ("pending" as const) }
              : r,
          );
          setQueue([...current]);
        }
      }

      // Single write per pass — O(1) vs per-item O(N²).
      // daily_report items carry clientIdempotencyKey so replays on crash are safe.
      await persistQueue(current);
      if (historyChanged) {
        setSyncedHistory([...history]);
        await persistHistory(history);
        if (lastSynced) setLastSyncedAt(lastSynced);
      }
    } finally {
      setIsSyncing(false);
      syncLock.current = false;
    }
  }, []);

  useEffect(() => {
    if (isOnline && !prevOnline.current) {
      const hasPending = queue.some((r) => r.status === "pending");
      if (hasPending) {
        // Random 0–4 s jitter: staggers the three queues so they don't all
        // hit the server simultaneously, and spreads multi-device reconnect bursts.
        const t = setTimeout(() => syncQueue(), Math.random() * 4000);
        prevOnline.current = isOnline;
        return () => clearTimeout(t);
      }
    }
    prevOnline.current = isOnline;
  }, [isOnline, queue, syncQueue]);

  const makeItemId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const enqueueReport = useCallback(
    async (
      projectId: number,
      reportData: DailyReportOp["reportData"],
      photos: QueuePhoto[],
    ) => {
      await ensurePhotoDir();
      const stablePhotos: QueuePhoto[] = await Promise.all(
        photos.map(async (p) => {
          const id = makeItemId();
          const ext = p.fileName.split(".").pop() ?? "jpg";
          const dest = `${LOCAL_DIR}${id}.${ext}`;
          await FileSystem.copyAsync({ from: p.uri, to: dest });
          return { ...p, uri: dest };
        }),
      );

      const item: QueuedItem = {
        id: makeItemId(),
        op: { type: "daily_report", projectId, reportData, photos: stablePhotos },
        createdAt: new Date().toISOString(),
        status: "pending",
        retries: 0,
      };

      // Capture new queue synchronously from the updater, then persist outside.
      // React Native uses legacy synchronous mode so the updater runs before the next line.
      let updated: QueuedItem[] = [];
      setQueue((prev) => { updated = [...prev, item]; return updated; });
      await persistQueue(updated);
    },
    [],
  );

  const enqueueTimesheet = useCallback(async (body: SubmitTimesheetBody) => {
    const item: QueuedItem = {
      id: makeItemId(),
      op: { type: "timesheet", body },
      createdAt: new Date().toISOString(),
      status: "pending",
      retries: 0,
    };
    let updated: QueuedItem[] = [];
    setQueue((prev) => { updated = [...prev, item]; return updated; });
    await persistQueue(updated);
  }, []);

  const enqueueSafetyForm = useCallback(async (body: CreateFormSubmissionBody) => {
    const item: QueuedItem = {
      id: makeItemId(),
      op: { type: "safety_form", body },
      createdAt: new Date().toISOString(),
      status: "pending",
      retries: 0,
    };
    let updated: QueuedItem[] = [];
    setQueue((prev) => { updated = [...prev, item]; return updated; });
    await persistQueue(updated);
  }, []);

  const retryFailed = useCallback(async () => {
    const updated = queue.map((r) =>
      r.status === "failed" ? { ...r, status: "pending" as const, retries: 0 } : r,
    );
    setQueue(updated);
    await persistQueue(updated);
    syncQueue();
  }, [queue, syncQueue]);

  const clearFailed = useCallback(async () => {
    const failed = queue.filter((r) => r.status === "failed");
    for (const r of failed) await deletePhotoFiles(r);
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
        enqueueReport,
        enqueueTimesheet,
        enqueueSafetyForm,
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
