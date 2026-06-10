/**
 * Shared disk-based multer upload middleware.
 *
 * M11-M13 fix: Using diskStorage instead of memoryStorage means uploaded
 * files are written to the OS temp directory immediately, so they never
 * accumulate in Node.js heap during the upload phase.  Route handlers read
 * or stream the temp file only when they need it, then call cleanupUpload()
 * to delete it.
 */
import multer from "multer";
import { tmpdir } from "os";
import { join } from "path";
import { unlink } from "fs/promises";
import { randomUUID } from "crypto";

export const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpdir()),
    filename: (_req, _file, cb) => cb(null, `sitesnap-upload-${randomUUID()}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB hard cap
});

/** Delete the temp file written by diskStorage after the route is done with it. */
export async function cleanupUpload(filePath?: string): Promise<void> {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    // File may have already been deleted or never existed — ignore.
  }
}
