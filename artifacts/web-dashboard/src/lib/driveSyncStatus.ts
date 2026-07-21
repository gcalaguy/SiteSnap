/**
 * Tracks the outcome of the last drive-sync mirror attempt so the settings UI
 * can surface failures instead of them being silently swallowed.
 */

const STORAGE_KEY = "siteSnapDriveSyncStatus";

export interface DriveSyncStatus {
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
}

type Listener = (status: DriveSyncStatus) => void;
const listeners = new Set<Listener>();

function defaultStatus(): DriveSyncStatus {
  return { lastSuccessAt: null, lastErrorAt: null, lastError: null };
}

function readStatus(): DriveSyncStatus {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultStatus(), ...JSON.parse(raw) } : defaultStatus();
  } catch {
    return defaultStatus();
  }
}

function writeStatus(status: DriveSyncStatus): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  } catch {
    // localStorage unavailable (e.g. private browsing) — status just won't persist across reloads
  }
  listeners.forEach((listener) => listener(status));
}

export function getDriveSyncStatus(): DriveSyncStatus {
  return readStatus();
}

export function subscribeDriveSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportSyncSuccess(): void {
  writeStatus({ ...readStatus(), lastSuccessAt: Date.now(), lastError: null });
}

export function reportSyncError(message: string): void {
  writeStatus({ ...readStatus(), lastErrorAt: Date.now(), lastError: message });
}
