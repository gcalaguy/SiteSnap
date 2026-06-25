import type { Request } from "express";
import { logger } from "./logger.js";

/** Resolves the public app base URL for building links in outbound emails. */
export function buildAppBase(req: Request): string | null {
  return (
    process.env["APP_BASE_URL"]?.replace(/\/$/, "") ??
    (process.env["REPLIT_DOMAINS"]
      ? `https://${process.env["REPLIT_DOMAINS"].split(",")[0].trim()}`
      : null) ??
    (req.headers["origin"] as string | undefined) ??
    null
  );
}

/** Escapes user-controlled text before interpolating it into an HTML email body. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface EmailAttachment {
  filename: string;
  content: string; // base64
}

interface EmailPayload {
  to: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  /** Per-company API key override (falls back to RESEND_API_KEY env var). */
  apiKey?: string | null;
  /** Per-company from address override (falls back to DIGEST_FROM_EMAIL env var). */
  from?: string | null;
}

export class ResendSandboxError extends Error {
  allowedEmail: string;
  constructor(allowedEmail: string) {
    super(
      `Resend is in sandbox mode. Emails can only be sent to the verified address (${allowedEmail}). ` +
        `Verify a domain at resend.com/domains to send to any recipient.`
    );
    this.name = "ResendSandboxError";
    this.allowedEmail = allowedEmail;
  }
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = payload.apiKey || process.env["RESEND_API_KEY"];
  const from =
    payload.from || process.env["DIGEST_FROM_EMAIL"] || "Site Snap <onboarding@resend.dev>";

  if (!apiKey) {
    logger.warn("RESEND_API_KEY not set — skipping email send");
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("Resend API request timed out after 30s")), 30_000);

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        ...(payload.attachments?.length
          ? { attachments: payload.attachments }
          : {}),
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text();

    if (res.status === 403) {
      const match = body.match(/\(([^\s)]+@[^\s)]+)\)/);
      const allowedEmail = match?.[1] ?? "your Resend account email";
      throw new ResendSandboxError(allowedEmail);
    }

    throw new Error(`Email send failed (${res.status})`);
  }

  logger.info(
    { recipients: payload.to.length, subject: payload.subject },
    "Email sent"
  );
}
