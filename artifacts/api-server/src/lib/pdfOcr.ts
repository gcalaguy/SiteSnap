import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_PAGES = 3;
const DEFAULT_DPI = 200;

export interface PDFPageImage {
  base64: string;
  mimeType: string;
}

/**
 * Convert the first N pages of a PDF buffer to high-res PNG images
 * using pdftoppm (Poppler) with ImageMagick convert as fallback.
 * Images are returned as base64 data URIs suitable for GPT-4o Vision.
 */
export async function convertPDFPagesToImages(
  pdfBuffer: Buffer,
  maxPages = DEFAULT_MAX_PAGES,
  dpi = DEFAULT_DPI,
): Promise<PDFPageImage[]> {
  const { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } = await import("fs");
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  const tmpDir = mkdtempSync(join(tmpdir(), "pdf-ocr-"));
  const pdfPath = join(tmpDir, "input.pdf");
  writeFileSync(pdfPath, pdfBuffer);

  try {
    const outBase = join(tmpDir, "page");
    await execFileAsync("pdftoppm", [
      "-png", "-singlefile",
      "-r", String(dpi),
      "-f", "1",
      "-l", String(maxPages),
      pdfPath, outBase,
    ]);

    const files = readdirSync(tmpDir)
      .filter(f => f.endsWith(".png"))
      .sort();

    const images: PDFPageImage[] = [];
    for (const f of files.slice(0, maxPages)) {
      images.push({ base64: readFileSync(join(tmpDir, f)).toString("base64"), mimeType: "image/png" });
    }
    return images;
  } catch (err) {
    logger.warn({ err }, "pdftoppm failed; trying ImageMagick fallback");
    try {
      await execFileAsync("convert", [
        "-density", String(dpi),
        `${pdfPath}[0-${maxPages - 1}]`,
        join(tmpDir, "page-%d.png"),
      ]);
      const files = readdirSync(tmpDir)
        .filter(f => f.endsWith(".png"))
        .sort();
      const images: PDFPageImage[] = [];
      for (const f of files.slice(0, maxPages)) {
        images.push({ base64: readFileSync(join(tmpDir, f)).toString("base64"), mimeType: "image/png" });
      }
      return images;
    } catch (err2) {
      logger.error({ err: err2 }, "ImageMagick fallback also failed");
      return [];
    }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
