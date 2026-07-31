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

export interface OAuthStateInitiator {
  userId: number;
  userName: string;
  userRole: string;
}

/**
 * Encodes {companyId, ts, sharedMailboxAddress?, initiator} into the base64url
 * `state` param sent to the provider. sharedMailboxAddress (Phase 4, Outlook
 * shared mailboxes only) must be chosen before the OAuth redirect and carried
 * through here — Microsoft's consent screen has no way to surface it, and
 * the callback needs it to know which mailbox to connect (as opposed to the
 * connecting user's own). `initiator` carries the connecting admin's identity
 * across the redirect the same way — the callback is unauthenticated (no
 * Clerk session survives the round trip to Microsoft/Google and back), so
 * this is the only way it can attribute the connected account / audit log
 * entry to the user who actually clicked "Connect" rather than leaving it
 * anonymous.
 */
export function buildOAuthState(
  companyId: number,
  secret: string,
  opts?: { sharedMailboxAddress?: string; initiator?: OAuthStateInitiator },
): string {
  const payload = JSON.stringify({
    companyId,
    ts: Date.now(),
    sharedMailboxAddress: opts?.sharedMailboxAddress ?? null,
    initiator: opts?.initiator ?? null,
  });
  const sig = signOAuthState(payload, secret);
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

/** Decodes and verifies a `state` param built by buildOAuthState. Throws on any tamper/malformed input. */
export function parseOAuthState(
  state: string,
  secret: string,
): { companyId: number; sharedMailboxAddress: string | null; initiator: OAuthStateInitiator | null } {
  const outer = JSON.parse(Buffer.from(state, "base64url").toString());
  if (!outer.payload || !outer.sig) throw new Error("malformed_state");
  if (!verifyOAuthState(outer.payload, outer.sig, secret)) throw new Error("invalid_signature");
  const decoded = JSON.parse(outer.payload);
  if (!decoded.companyId) throw new Error("missing_company");
  return {
    companyId: decoded.companyId,
    sharedMailboxAddress: decoded.sharedMailboxAddress ?? null,
    initiator: decoded.initiator ?? null,
  };
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
