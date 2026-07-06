import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Convert HEIC/HEIF bytes to JPEG via ImageMagick.
 *
 * OpenAI's vision endpoint only accepts png/jpeg/gif/webp — HEIC data URIs are
 * rejected outright, so any receipt/document photo picked from an iOS photo
 * library (HEIC by default) must be transcoded before it reaches the model.
 */
export async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  const { mkdtemp, writeFile, readFile, rm } = await import("fs/promises");
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  const tmpDir = await mkdtemp(join(tmpdir(), "heic-convert-"));
  const inPath = join(tmpDir, "input.heic");
  const outPath = join(tmpDir, "output.jpg");
  try {
    await writeFile(inPath, buffer);
    await execFileAsync("convert", [inPath, outPath]);
    return await readFile(outPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export function isHeic(mimeType: string): boolean {
  return mimeType === "image/heic" || mimeType === "image/heif";
}
