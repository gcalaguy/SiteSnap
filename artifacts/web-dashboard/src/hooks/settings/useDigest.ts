import { useState } from "react";
import { customFetch, ApiError } from "@workspace/api-client-react";

export interface SendResult {
  sent: number;
  recipients: string[];
}

export interface SandboxInfo {
  allowedEmail: string;
  intendedRecipients: string[];
}

interface DigestSandboxErrorBody {
  code?: string;
  allowedEmail?: string;
  intendedRecipients?: string[];
  error?: string;
}

export type DigestStatus = "idle" | "sending" | "sent" | "error" | "sandbox";

export function useDigest() {
  const [status, setStatus] = useState<DigestStatus>("idle");
  const [detail, setDetail] = useState("");
  const [sandboxInfo, setSandboxInfo] = useState<SandboxInfo | null>(null);

  async function handleSend() {
    setStatus("sending");
    setDetail("");
    setSandboxInfo(null);
    try {
      const data = await customFetch<SendResult>("/api/digest/send-now", { method: "POST" });
      setDetail(`Sent to ${data.sent} recipient${data.sent !== 1 ? "s" : ""}: ${data.recipients.join(", ")}`);
      setStatus("sent");
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.data as DigestSandboxErrorBody | null;
        if (body?.code === "resend_sandbox") {
          setSandboxInfo({
            allowedEmail: body.allowedEmail ?? "",
            intendedRecipients: body.intendedRecipients ?? [],
          });
          setStatus("sandbox");
          return;
        }
        setDetail(body?.error ?? err.message ?? "Failed to send digest");
      } else {
        setDetail(err instanceof Error ? err.message : "Failed to send digest");
      }
      setStatus("error");
    }
  }

  return { status, detail, sandboxInfo, handleSend };
}
