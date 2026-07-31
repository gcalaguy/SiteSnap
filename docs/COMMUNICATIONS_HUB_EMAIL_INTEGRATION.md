# Project Communications Hub — Outlook & Gmail Integration Guide

This document is the step-by-step guide for connecting Microsoft Outlook
(Microsoft 365 / Exchange Online) and Google Gmail (Gmail / Google Workspace)
mailboxes to SiteSnap's **Project Communications Hub**. It covers both sides
of the setup: registering OAuth apps with Microsoft/Google, configuring the
SiteSnap server, and connecting a mailbox from the admin UI.

Scope: `artifacts/api-server/src/services/emailOAuthService.ts`,
`emailSyncService.ts`, `routes/emailIntegrations.ts`, and the
Email Integrations page (`artifacts/web-dashboard/src/pages/email-integrations.tsx`).

---

## How it works (read this first)

- Both providers connect via **OAuth 2.0** — SiteSnap never sees or stores a
  user's mailbox password, only a scoped access/refresh token pair.
- SiteSnap **polls** each connected mailbox on a per-account schedule
  (15 min / hourly / daily); there are no provider webhooks in this phase.
  The poll cadence is enforced by `email_accounts.next_sync_due_at`, checked
  by a cron job every 5 minutes.
- Tokens are encrypted at rest (AES-256-GCM, keyed by
  `EMAIL_TOKEN_ENCRYPTION_KEY`) and every mailbox row is scoped to a
  `company_id` with row-level security — one organization can never read
  another's connected accounts or synced emails.
- Managing integrations requires the `manageEmailIntegrations` permission
  (defaults to `true` for owners and foremen, `false` for workers), and
  managing filing rules requires `manageFilingRules` (same default split).
  Everyone with `viewProjectCommunications` (on by default for every role,
  including workers) can read synced communications once a thread is
  assigned to a project. Custom per-user permission overrides (set in
  member management) are respected everywhere these are checked.
- The feature is gated behind the `COMMS_HUB` feature flag, auto-enabled for
  companies on the **Enterprise** plan. Non-Enterprise companies can be
  granted it individually — see [Finding the page](#finding-the-page).

---

## Prerequisites

- Admin access to your Microsoft 365 tenant (Azure AD / Entra ID) to connect
  Outlook, and/or a Google Workspace or Google Cloud account to connect Gmail.
- Deploy-level access to set environment variables on the SiteSnap API server
  (Railway, or your `.env` in local dev).
- The company's SiteSnap plan must include the `COMMS_HUB` feature (Enterprise
  plan, or the feature key granted manually).

---

## Step 1 — Register an Azure AD app for Outlook

Only needed once per SiteSnap deployment (not per customer/tenant) — the same
app registration is used for every organization that connects an Outlook
mailbox, since the connect flow uses `MICROSOFT_TENANT_ID=common` by default.

1. Go to [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID**
   → **App registrations** → **New registration**.
2. Name it something like `SiteSnap Email Integration`.
3. **Supported account types**: choose *"Accounts in any organizational
   directory and personal Microsoft accounts"* — this matches the `common`
   tenant setting SiteSnap uses by default. Pick a narrower option only if
   you intend to set `MICROSOFT_TENANT_ID` to a specific tenant GUID and
   restrict connections to a single organization.
4. **Redirect URI**: platform = *Web*, value =
   `https://<your-app-domain>/api/email-integrations/outlook/callback`
   (use your actual `APP_BASE_URL` — see Step 3).
5. After creation, note the **Application (client) ID** — this is
   `MICROSOFT_CLIENT_ID`.
6. Go to **Certificates & secrets** → **New client secret**. Copy the secret
   **value** immediately (it's hidden after you navigate away) — this is
   `MICROSOFT_CLIENT_SECRET`.
7. Go to **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated permissions**, and add:
   - `Mail.Read` — read messages, threads, and attachments
   - `User.Read` — resolve the connecting user's profile/email address
   - `offline_access` — required to receive a refresh token so sync can run
     unattended between logins
   If your tenant requires admin consent for these scopes, click
   **Grant admin consent**.

   > **Shared mailboxes**: no extra Graph permission is required. SiteSnap
   > accesses a shared mailbox via the connecting user's own Exchange
   > delegate access (`/users/{mailbox}/...` instead of `/me/...`), so the
   > connecting user must already have "Full Access" or "Send As" delegate
   > permission on that shared mailbox in Exchange admin center.

---

## Step 2 — Register a Google Cloud OAuth client for Gmail

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create (or select) a project.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: *Internal* if every connecting org is inside one Google
     Workspace domain you control; otherwise *External* (and submit for
     verification once you're past testing — Google caps unverified apps at
     100 test users).
   - Add the scope `.../auth/gmail.readonly` and `.../auth/userinfo.email`.
4. **APIs & Services → Credentials** → **Create Credentials** → **OAuth
   client ID** → Application type **Web application**.
5. **Authorized redirect URIs**: add
   `https://<your-app-domain>/api/email-integrations/gmail/callback`.
6. Copy the **Client ID** (`GOOGLE_CLIENT_ID`) and **Client secret**
   (`GOOGLE_CLIENT_SECRET`).

---

## Step 3 — Configure the SiteSnap API server

Set these environment variables on the API server (see `.env.example` for the
canonical list):

| Variable | Required | Description |
|---|---|---|
| `MICROSOFT_CLIENT_ID` | For Outlook | Azure AD app registration client ID (Step 1.5) |
| `MICROSOFT_CLIENT_SECRET` | For Outlook | Azure AD app registration client secret (Step 1.6) |
| `MICROSOFT_TENANT_ID` | No | Defaults to `common` (any M365 org + personal Outlook.com). Set to a tenant GUID to restrict to one org. |
| `GOOGLE_CLIENT_ID` | For Gmail | Google Cloud OAuth client ID (Step 2.6) |
| `GOOGLE_CLIENT_SECRET` | For Gmail | Google Cloud OAuth client secret (Step 2.6) |
| `EMAIL_OAUTH_STATE_SECRET` | Recommended | HMAC secret signing the OAuth `state` param. Falls back to `MICROSOFT_CLIENT_SECRET`/`GOOGLE_CLIENT_SECRET` if unset — set a dedicated value in production. |
| `EMAIL_TOKEN_ENCRYPTION_KEY` | Yes, once either provider is used | AES-256 key, base64-encoded, must decode to exactly 32 bytes. Generate with `openssl rand -base64 32`. Encrypts `email_accounts.access_token`/`refresh_token` at rest. |
| `APP_BASE_URL` | Yes | Your deployed app's base URL (e.g. `https://app.sitesnap.com`) — used to build the OAuth redirect URIs above and the post-connect redirect back into the app. |

You only need to fill in the Microsoft variables if you're enabling Outlook,
and only the Google variables for Gmail — each provider is independently
optional. The Email Integrations page reflects this: `GET /email-integrations/status`
reports `outlookConfigured`/`gmailConfigured` based on whether the
corresponding client ID/secret pair is set, and the Connect button for an
unconfigured provider returns a 503 with a message telling the admin which
variables are missing.

Restart the API server after setting these so it picks up the new
environment variables.

---

## Step 4 — Connect a mailbox from SiteSnap

### Finding the page

There is no dedicated "Settings" entry for this — the Email Integrations page
is reachable from the **Communications** area of the app:

1. Sign in as a company **owner or foreman** (or a worker explicitly granted
   `manageEmailIntegrations`/`manageFilingRules`). The "Integrations" and
   "Filing Rules" buttons described below only render for users who hold the
   corresponding permission.
2. Click **Communications** in the left sidebar. If it's missing entirely,
   your company doesn't have the `COMMS_HUB` feature enabled — an internal
   admin needs to grant it via **Super Admin → (your company) →
   Manage Features**, or upgrade the company to the Enterprise plan (which
   grants it automatically).
3. This lands you on **Uncategorized Emails**. Click the **Integrations**
   button in the top-right toolbar (next to **Filing Rules** and
   **Search Builder**) to open Email Integrations.

### Connecting an account

1. Click **Connect Outlook** or **Connect Gmail**.
   - For Outlook, you'll be prompted whether to connect **your own inbox**
     or a **shared mailbox** — enter the shared mailbox's address if
     applicable (requires delegate access, see Step 1.7).
2. You're redirected to Microsoft/Google's consent screen. Approve the
   requested scopes.
3. On success you're redirected back with the account listed as
   **Connected**. On failure you'll see an inline error — see
   Troubleshooting below for what each reason code means.
4. Click into the connected account to:
   - **Select mailbox folders** to sync (defaults to Inbox only).
   - **Set sync frequency** — 15 minutes / hourly / daily.
   - **Sync now** to trigger an immediate poll instead of waiting for the
     next scheduled cron run.
   - **Disconnect** to revoke the connection (this does not revoke the
     OAuth grant on the Microsoft/Google side — also remove SiteSnap from
     the user's connected-apps list there if full revocation is required).

Every connect, disconnect, settings change, and manual sync is written to
the company's audit log with the acting admin's identity.

Once connected, synced emails are automatically triaged into projects (95%+
confidence auto-assigns, 75–94% suggests a match for confirmation, below 75%
lands in the global **Uncategorized Emails** inbox) and become visible under
each project's **Communications** tab.

---

## Verifying sync is working

- The **Email Integrations** page (see [Finding the page](#finding-the-page))
  shows each account's `status` (`active` / `reauth_required` / `error`),
  `lastSyncAt`, and `lastSyncError`.
- The sync cron runs every 5 minutes and only syncs accounts whose
  `nextSyncDueAt` has passed, so a freshly-connected account may take up to
  one cron tick before its first sync — or click **Sync now** to force it
  immediately.
- A `reauth_required` status means the refresh token was rejected (e.g. the
  user changed their password or revoked access) — disconnect and
  reconnect the account.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Connect button shows "not configured" / 503 | `MICROSOFT_CLIENT_ID`/`SECRET` or `GOOGLE_CLIENT_ID`/`SECRET` not set on the API server | Complete Step 3 for that provider, restart the API server |
| Redirected back with `reason=invalid_state` | The OAuth `state` round-trip took too long, or the browser/session changed mid-flow (e.g. a corporate proxy stripping query params) | Retry the connect flow; ensure `EMAIL_OAUTH_STATE_SECRET` is identical across all API server instances if running more than one |
| Redirected back with `reason=token_exchange_failed` | Redirect URI mismatch, invalid/expired client secret, or the user denied consent | Confirm the redirect URI registered in Azure/Google exactly matches `APP_BASE_URL` + `/api/email-integrations/{outlook,gmail}/callback` (including scheme and no trailing slash); confirm the client secret hasn't expired |
| Outlook shared mailbox connects but shows no messages | Connecting user lacks delegate access on that shared mailbox | Grant "Full Access" delegate permission in Exchange admin center, then reconnect |
| Gmail sync stops after ~1 week of inactivity, then does a full re-sync | Gmail's `history.list` API only retains ~1 week of history; this is expected and handled automatically (falls back to a bounded re-sync of the last 90 days) | No action needed |
| Account shows `reauth_required` | Refresh token was revoked or expired | Disconnect and reconnect the account from the Email Integrations page |

---

## Security notes

- Access/refresh tokens are encrypted at rest with AES-256-GCM
  (`EMAIL_TOKEN_ENCRYPTION_KEY`) — never stored or logged in plaintext.
- All synced data (accounts, threads, messages, attachments) is scoped by
  `company_id` and covered by Postgres row-level security policies — cross-
  tenant access is enforced at the database layer, not just in application
  code.
- Raw provider HTML bodies are sanitized server-side before storage/render
  (script/style stripped, safe tag allowlist) since inbound email HTML is
  untrusted input.
- Connect/disconnect/settings-change/manual-sync actions are all written to
  the company audit log.
- Only `Mail.Read` / `gmail.readonly` scopes are requested — SiteSnap cannot
  send email or modify/delete anything in the connected mailbox.
