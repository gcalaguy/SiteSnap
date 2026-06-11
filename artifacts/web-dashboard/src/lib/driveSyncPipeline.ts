/**
 * Auto-save pipeline: writes exported blobs (PDF, DOCX, XLSX, CSV, images)
 * into the user's selected FileSystemDirectoryHandle when drive sync is enabled.
 */

import { loadDriveSyncState } from "./driveSyncManager";

/**
 * Internal helper: ensures the directory handle still has permission.
 * Browsers revoke permissions on reload unless the user re-grants them.
 */
async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: "readwrite" as const };
  try {
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
  } catch {
    // queryPermission/requestPermission may throw (e.g. not supported, no user gesture,
    // or permission revoked). Gracefully fall through so the normal export flow is
    // never interrupted.
  }
  return false;
}

/**
 * Writes a Blob to the selected directory with the given filename.
 * Overwrites if the file already exists (matching expected "exact copy" behavior).
 */
async function writeBlobToDir(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * Main pipeline entrypoint. Call this after every client-side file export
 * or upload to mirror a copy into the local/network directory.
 *
 * @param filename  Target filename inside the directory (e.g. "INV-0001.pdf")
 * @param blob      The Blob / File / ArrayBuffer to write
 */
export async function mirrorToLocalDrive(filename: string, blob: Blob): Promise<void> {
  const state = await loadDriveSyncState();
  if (!state.enabled || !state.handle) return;

  const hasPermission = await verifyPermission(state.handle);
  if (!hasPermission) {
    // If permission lost, silently skip. We don't want to break the normal flow.
    return;
  }

  try {
    await writeBlobToDir(state.handle, filename, blob);
  } catch {
    // Best-effort: do not throw so upstream flows keep working.
  }
}

/**
 * Convenience: mirrors an already-uploaded File (e.g. from file input).
 */
export async function mirrorUploadedFile(file: File): Promise<void> {
  await mirrorToLocalDrive(file.name, file);
}

/**
 * Convenience: mirrors an ArrayBuffer produced by libraries like jsPDF / docx / xlsx.
 */
export async function mirrorArrayBuffer(
  filename: string,
  buffer: ArrayBuffer,
  mimeType?: string,
): Promise<void> {
  await mirrorToLocalDrive(filename, new Blob([buffer], { type: mimeType || "application/octet-stream" }));
}

/**
 * Convenience: mirrors a CSV string (accounting export, etc.).
 */
export async function mirrorCsvString(filename: string, csvText: string): Promise<void> {
  await mirrorToLocalDrive(
    filename,
    new Blob([csvText], { type: "text/csv;charset=utf-8;" }),
  );
}

/**
 * Convenience: mirrors an arbitrary Blob (e.g. ZIP archive).
 */
export async function mirrorBlob(filename: string, blob: Blob): Promise<void> {
  await mirrorToLocalDrive(filename, blob);
}
