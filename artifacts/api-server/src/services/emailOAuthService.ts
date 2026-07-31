import type { EmailAccount } from "@workspace/db";
import { updateEmailAccountTokens } from "../repositories/emailIntegrations";

/**
 * Token exchange, refresh, and profile-lookup helpers for the two Project
 * Communications Hub email providers. Mirrors quickbooks.ts's
 * refreshAccessToken/getValidToken lazy-refresh pattern (5-minute expiry buffer).
 */

const MICROSOFT_TENANT = process.env.MICROSOFT_TENANT_ID || "common";
const MICROSOFT_AUTH_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/authorize`;
const MICROSOFT_TOKEN_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`;
export const MICROSOFT_SCOPES = "offline_access Mail.Read User.Read";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_SCOPES =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email";

export function getMicrosoftAuthUrl(): string {
  return MICROSOFT_AUTH_URL;
}
export function getGoogleAuthUrl(): string {
  return GOOGLE_AUTH_URL;
}

export function isOutlookConfigured(): boolean {
  return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}
export function isGmailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

interface TokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
}

export async function exchangeOutlookCode(code: string, redirectUri: string): Promise<TokenResult> {
  const resp = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      code,
      redirect_uri: redirectUri,
      scope: MICROSOFT_SCOPES,
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = (await resp.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scopes: (data.scope ?? MICROSOFT_SCOPES).split(" "),
  };
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<TokenResult> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = (await resp.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scopes: (data.scope ?? GOOGLE_SCOPES).split(" "),
  };
}

export async function fetchOutlookProfile(
  accessToken: string,
): Promise<{ email: string; displayName: string | null }> {
  const resp = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = (await resp.json()) as any;
  return { email: data.mail ?? data.userPrincipalName, displayName: data.displayName ?? null };
}

export async function fetchGoogleProfile(
  accessToken: string,
): Promise<{ email: string; displayName: string | null }> {
  const resp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = (await resp.json()) as any;
  return { email: data.email, displayName: data.name ?? null };
}

async function refreshOutlookToken(account: EmailAccount): Promise<TokenResult> {
  if (!account.refreshToken) throw new Error("no_refresh_token");
  const resp = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      refresh_token: account.refreshToken,
      scope: MICROSOFT_SCOPES,
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = (await resp.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? account.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scopes: (data.scope ?? MICROSOFT_SCOPES).split(" "),
  };
}

async function refreshGoogleToken(account: EmailAccount): Promise<TokenResult> {
  if (!account.refreshToken) throw new Error("no_refresh_token");
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: account.refreshToken,
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = (await resp.json()) as any;
  return {
    accessToken: data.access_token,
    // Google does not reissue a refresh_token on the refresh grant — keep the existing one.
    refreshToken: account.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scopes: (data.scope ?? GOOGLE_SCOPES).split(" "),
  };
}

/**
 * Returns an account with a valid (non-expired) access token, refreshing and
 * persisting it first if it's within 5 minutes of expiry. On refresh failure
 * (revoked/expired refresh token), marks the account reauth_required so the
 * settings screen can prompt reconnect, then rethrows.
 */
export async function getValidToken(account: EmailAccount): Promise<EmailAccount> {
  const bufferMs = 5 * 60 * 1000;
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
  if (expiresAt - bufferMs > Date.now()) return account;

  try {
    const refreshed =
      account.provider === "outlook"
        ? await refreshOutlookToken(account)
        : await refreshGoogleToken(account);
    await updateEmailAccountTokens(account.id, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tokenExpiresAt: refreshed.expiresAt,
    });
    return {
      ...account,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tokenExpiresAt: refreshed.expiresAt,
    };
  } catch (err) {
    await updateEmailAccountTokens(account.id, {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      tokenExpiresAt: account.tokenExpiresAt,
      status: "reauth_required",
    });
    throw err;
  }
}

export interface MailFolder {
  id: string;
  name: string;
}

export async function listOutlookFolders(accessToken: string): Promise<MailFolder[]> {
  const resp = await fetch("https://graph.microsoft.com/v1.0/me/mailFolders?$top=100", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = (await resp.json()) as any;
  return (data.value ?? []).map((f: any) => ({ id: f.id, name: f.displayName }));
}

export async function listGmailLabels(accessToken: string): Promise<MailFolder[]> {
  const resp = await fetch("https://www.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = (await resp.json()) as any;
  return (data.labels ?? [])
    .filter((l: any) => l.type === "system" || l.type === "user")
    .map((l: any) => ({ id: l.id, name: l.name }));
}
