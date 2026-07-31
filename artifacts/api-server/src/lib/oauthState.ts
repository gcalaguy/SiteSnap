import { createHmac, timingSafeEqual } from "crypto";
import type { Request } from "express";

/**
 * Shared HMAC state-signing + redirect-URI helpers for third-party OAuth
 * connect flows (QuickBooks, and now Outlook/Gmail for the Project
 * Communications Hub). Factored out once a third provider needed the exact
 * same signing logic quickbooks.ts had inlined, to avoid a fourth copy-paste.
 */

export function signOAuthState(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyOAuthState(payload: string, sig: string, secret: string): boolean {
  const expected = signOAuthState(payload, secret);
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/** Encodes {companyId, ts} into the base64url `state` param sent to the provider. */
export function buildOAuthState(companyId: number, secret: string): string {
  const payload = JSON.stringify({ companyId, ts: Date.now() });
  const sig = signOAuthState(payload, secret);
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

/** Decodes and verifies a `state` param built by buildOAuthState. Throws on any tamper/malformed input. */
export function parseOAuthState(state: string, secret: string): { companyId: number } {
  const outer = JSON.parse(Buffer.from(state, "base64url").toString());
  if (!outer.payload || !outer.sig) throw new Error("malformed_state");
  if (!verifyOAuthState(outer.payload, outer.sig, secret)) throw new Error("invalid_signature");
  const decoded = JSON.parse(outer.payload);
  if (!decoded.companyId) throw new Error("missing_company");
  return { companyId: decoded.companyId };
}

/**
 * Resolves the app's own base URL for building OAuth redirect_uri /
 * post-connect redirect targets. Same precedence as quickbooks.ts:
 * APP_BASE_URL (Railway/custom domain) → first REPLIT_DOMAINS entry → request Host header.
 */
export function getAppBaseUrl(req?: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}`;
  if (req) return `https://${req.headers.host}`;
  return "";
}

export function getOAuthRedirectUri(req: Request, callbackPath: string): string {
  return `${getAppBaseUrl(req)}${callbackPath}`;
}
