import { logger } from "../../lib/logger.js";

// ── PDF / Word Text Extraction ────────────────────────────────────────────────
export async function extractPDFText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer, verbosity: 0 } as any);
    const result = await parser.getText();
    return (result as any).text ?? "";
  } catch (err) {
    logger.error({ err }, "PDF parse failed");
    return "";
  }
}

export async function extractWordText(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  } catch (err) {
    logger.error({ err }, "Word extract failed");
    return "";
  }
}
