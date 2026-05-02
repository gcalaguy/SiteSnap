import { logger } from "./logger.js";

interface EmailAttachment {
  filename: string;
  content: string; // base64
}

interface EmailPayload {
  to: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
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
  const apiKey = process.env["RESEND_API_KEY"];
  const from =
    process.env["DIGEST_FROM_EMAIL"] ?? "BuildCore <onboarding@resend.dev>";

  if (!apiKey) {
    logger.warn("RESEND_API_KEY not set — skipping email send");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
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
