import fs from "fs";
import { logger } from "./logger";

interface ScanResult {
  clean: boolean;
  reason?: string;
}

/**
 * Send a file to the virus-scan endpoint and return whether it's clean.
 *
 * Set VIRUS_SCAN_ENDPOINT to enable (e.g. http://clamav:8080/scan).
 * The endpoint must accept a raw POST body with the file bytes and respond with
 * JSON: { infected: boolean, viruses?: string[] }.
 *
 * When the env var is not set this is a no-op and returns { clean: true }.
 */
export async function scanFile(filePath: string, mimeType: string): Promise<ScanResult> {
  const endpoint = process.env.VIRUS_SCAN_ENDPOINT;
  if (!endpoint) return { clean: true };

  try {
    const bytes = fs.readFileSync(filePath);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status, endpoint }, "Virus scan service returned non-2xx — treating as clean");
      return { clean: true };
    }

    const data = (await resp.json()) as { infected?: boolean; viruses?: string[] };
    if (data.infected) {
      const reason = data.viruses?.join(", ") ?? "unknown";
      logger.warn({ filePath, viruses: data.viruses }, "Virus scan detected malware");
      return { clean: false, reason };
    }

    return { clean: true };
  } catch (err) {
    logger.warn({ err, endpoint }, "Virus scan failed — treating file as clean to avoid false positives");
    return { clean: true };
  }
}
