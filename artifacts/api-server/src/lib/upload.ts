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
import { unlink } from "fs/promises";
import { randomUUID } from "crypto";
import type { Request } from "express";

// B3 fix: block dangerous MIME types regardless of client-supplied Content-Type.
// This is a deny-list of types that should never appear in user-uploaded content.
// It does not replace server-side processing checks, but it stops the most
// obvious attacks (e.g. uploading an .exe or .sh renamed as image.jpg).
const BLOCKED_MIME_PREFIXES = [
  "application/x-msdownload",   // .exe, .dll
  "application/x-executable",
  "application/x-sh",           // shell scripts
  "application/x-bat",
  "application/x-msdos-program",
  "text/x-shellscript",
  "application/java-archive",   // .jar
  "application/x-java-applet",
  "application/javascript",
  "text/javascript",
  "application/x-httpd-php",    // PHP
  "application/x-python-code",
];

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".sh", ".ps1", ".msi",
  ".jar", ".php", ".py", ".rb", ".pl", ".cgi",
]);

function isSafeMimeType(mimetype: string, originalname: string): boolean {
  const lower = mimetype.toLowerCase();
  if (BLOCKED_MIME_PREFIXES.some((p) => lower.startsWith(p))) return false;
  const ext = "." + (originalname.split(".").pop() ?? "").toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) return false;
  return true;
}

export const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpdir()),
    filename: (_req, _file, cb) => cb(null, `sitesnap-upload-${randomUUID()}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB hard cap
  // B3 fix: reject blocked MIME types and extensions before writing to disk
  fileFilter: (_req: Request, file, cb) => {
    if (!isSafeMimeType(file.mimetype, file.originalname)) {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
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
