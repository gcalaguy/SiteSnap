import { chromium, type Browser } from "playwright-core";
import Handlebars from "handlebars";
import mammoth from "mammoth";
import { logger } from "./logger.js";

/**
 * HTML -> PDF rendering for custom document templates, via a headless
 * Chromium binary pre-provisioned by the Replit environment (no bundled
 * browser download — this app never runs `playwright install`). If this env
 * var is ever unset (e.g. a non-Replit deployment target), custom-template
 * rendering fails loudly and callers fall back to the default pdfkit theme
 * rather than silently producing a broken PDF.
 */
function getChromiumExecutablePath(): string {
  const execPath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (!execPath) {
    throw new Error(
      "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE is not set — custom document template rendering is unavailable in this environment.",
    );
  }
  return execPath;
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ executablePath: getChromiumExecutablePath(), args: ["--no-sandbox"] })
      .catch((err) => {
        browserPromise = null; // allow a retry on the next render instead of wedging forever
        throw err;
      });
  }
  return browserPromise;
}

/** Call during process shutdown so the headless Chromium process doesn't linger. */
export async function closeTemplateRendererBrowser(): Promise<void> {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  try {
    const browser = await pending;
    await browser.close();
  } catch (err) {
    logger.warn({ err }, "Error closing document-template renderer browser during shutdown");
  }
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Converts a .docx buffer to HTML (preserving basic Word formatting) so it
 * can go through the same handlebars + headless-Chromium pipeline as .html
 * templates — this is why no separate docx-native renderer (e.g.
 * docxtemplater) is needed. */
export async function docxBufferToHtml(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}

/**
 * Compiles a template's raw HTML with handlebars against the given merge
 * data, then rasterizes the result to PDF. Values that are themselves HTML
 * (e.g. a pre-rendered line-items table, a signature block) must be passed
 * as `Handlebars.SafeString` by the caller — everything else is
 * auto-escaped, which is the desired behavior for user-controlled strings
 * like client names.
 */
export async function compileAndRenderTemplate(
  templateHtml: string,
  mergeData: Record<string, unknown>,
): Promise<Buffer> {
  const compiled = Handlebars.compile(templateHtml);
  const rendered = compiled(mergeData);
  return renderHtmlToPdf(rendered);
}
