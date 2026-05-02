import { logger } from "./logger.js";

interface EmailPayload {
  to: string[];
  subject: string;
  html: string;
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
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }

  logger.info({ recipients: payload.to.length, subject: payload.subject }, "Email sent");
}
