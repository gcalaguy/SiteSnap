/**
 * Lightweight IndexedDB manager for persisting FileSystemDirectoryHandle
 * across page reloads for the Automated Network/Local Drive Sync feature.
 */

const DB_NAME = "SiteSnapDriveSync";
const DB_VERSION = 1;
const STORE_NAME = "folderHandles";
const KEY = "default";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
  return dbPromise;
}

export interface DriveSyncState {
  enabled: boolean;
  handle: FileSystemDirectoryHandle | null;
  pathName: string | null;
}

function getDefaultState(): DriveSyncState {
  return { enabled: false, handle: null, pathName: null };
}

export async function loadDriveSyncState(): Promise<DriveSyncState> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(KEY);
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const data = req.result as { enabled: boolean; handle?: FileSystemDirectoryHandle; pathName?: string } | undefined;
        if (!data) return resolve(getDefaultState());
        resolve({
          enabled: !!data.enabled,
          handle: data.handle ?? null,
          pathName: data.pathName ?? null,
        });
      };
      req.onerror = () => resolve(getDefaultState());
    });
  } catch {
    return getDefaultState();
  }
}

export async function saveDriveSyncState(state: DriveSyncState): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ enabled: state.enabled, handle: state.handle, pathName: state.pathName }, KEY);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silently fail — drive sync is best-effort
  }
}

export async function clearDriveSyncState(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(KEY);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silently fail
  }
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}
