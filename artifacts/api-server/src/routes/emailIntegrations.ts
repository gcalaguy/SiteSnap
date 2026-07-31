import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";
import { requirePermission } from "../lib/permissionGate";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { buildOAuthState, parseOAuthState, getOAuthRedirectUri, getAppBaseUrl } from "../lib/oauthState";
import {
  listEmailAccounts,
  getEmailAccount,
  createOrUpdateEmailAccount,
  updateEmailAccountSettings,
  disconnectEmailAccount,
  assignThreadToProject,
} from "../repositories/emailIntegrations";
import { recordManualAssignment } from "../repositories/projectMatching";
import {
  isOutlookConfigured,
  isGmailConfigured,
  getMicrosoftAuthUrl,
  getGoogleAuthUrl,
  MICROSOFT_SCOPES,
  GOOGLE_SCOPES,
  exchangeOutlookCode,
  exchangeGoogleCode,
  fetchOutlookProfile,
  fetchGoogleProfile,
  getValidToken,
  listOutlookFolders,
  listGmailLabels,
} from "../services/emailOAuthService";
import { syncEmailAccount } from "../services/emailSyncService";
import { logAuditEventFromRequest } from "../utils/logger";
import { assertProjectInCompany } from "../lib/projectAccess";

const router = Router();

function getStateSecret(): string {
  const secret = process.env.EMAIL_OAUTH_STATE_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("EMAIL_OAUTH_STATE_SECRET must be set for email integration OAuth");
  return secret;
}

const OUTLOOK_CALLBACK_PATH = "/api/email-integrations/outlook/callback";
const GMAIL_CALLBACK_PATH = "/api/email-integrations/gmail/callback";

// ── GET /email-integrations/status ──────────────────────────────────────────
router.get(
  "/email-integrations/status",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  asyncHandler(async (req, res) => {
    const accounts = await listEmailAccounts(req.companyId!);
    res.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        emailAddress: a.emailAddress,
        displayName: a.displayName,
        status: a.status,
        selectedFolders: a.selectedFolders,
        syncFrequency: a.syncFrequency,
        lastSyncAt: a.lastSyncAt,
        lastSyncError: a.lastSyncError,
      })),
      outlookConfigured: isOutlookConfigured(),
      gmailConfigured: isGmailConfigured(),
    });
  }),
);

// ── Auth URL endpoints ───────────────────────────────────────────────────────
router.get(
  "/email-integrations/outlook/auth-url",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("manageEmailIntegrations"),
  (req, res) => {
    if (!isOutlookConfigured()) {
      res.status(503).json({ error: "Outlook integration not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET." });
      return;
    }
    const state = buildOAuthState(req.companyId!, getStateSecret());
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      scope: MICROSOFT_SCOPES,
      redirect_uri: getOAuthRedirectUri(req, OUTLOOK_CALLBACK_PATH),
      response_type: "code",
      response_mode: "query",
      state,
    });
    res.json({ url: `${getMicrosoftAuthUrl()}?${params}` });
  },
);

router.get(
  "/email-integrations/gmail/auth-url",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("manageEmailIntegrations"),
  (req, res) => {
    if (!isGmailConfigured()) {
      res.status(503).json({ error: "Gmail integration not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
      return;
    }
    const state = buildOAuthState(req.companyId!, getStateSecret());
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      scope: GOOGLE_SCOPES,
      redirect_uri: getOAuthRedirectUri(req, GMAIL_CALLBACK_PATH),
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    res.json({ url: `${getGoogleAuthUrl()}?${params}` });
  },
);

// ── Callbacks (unauthenticated — company identity travels via signed state,
// same as quickbooks.ts: the browser's session/Clerk cookie doesn't reliably
// survive the external IdP redirect) ────────────────────────────────────────
router.get(
  "/email-integrations/outlook/callback",
  asyncHandler(async (req, res) => {
    const basePath = getAppBaseUrl(req);
    const { code, state, error } = req.query as Record<string, string>;
    if (error) {
      res.redirect(`${basePath}/settings?email=error&provider=outlook&reason=${encodeURIComponent(error)}`);
      return;
    }
    let companyId: number;
    try {
      ({ companyId } = parseOAuthState(state, getStateSecret()));
    } catch {
      res.redirect(`${basePath}/settings?email=error&provider=outlook&reason=invalid_state`);
      return;
    }
    try {
      const redirectUri = getOAuthRedirectUri(req, OUTLOOK_CALLBACK_PATH);
      const tokens = await exchangeOutlookCode(code, redirectUri);
      const profile = await fetchOutlookProfile(tokens.accessToken);
      await createOrUpdateEmailAccount({
        companyId,
        connectedByUserId: null,
        provider: "outlook",
        emailAddress: profile.email,
        displayName: profile.displayName,
        status: "active",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        deltaCursor: null,
        selectedFolders: null,
        syncFrequency: "hourly",
        lastSyncAt: null,
        lastSyncError: null,
        nextSyncDueAt: new Date(),
      });
      res.redirect(`${basePath}/settings?email=connected&provider=outlook`);
    } catch (err: any) {
      res.redirect(`${basePath}/settings?email=error&provider=outlook&reason=${encodeURIComponent(err?.message ?? "token_exchange_failed")}`);
    }
  }),
);

router.get(
  "/email-integrations/gmail/callback",
  asyncHandler(async (req, res) => {
    const basePath = getAppBaseUrl(req);
    const { code, state, error } = req.query as Record<string, string>;
    if (error) {
      res.redirect(`${basePath}/settings?email=error&provider=gmail&reason=${encodeURIComponent(error)}`);
      return;
    }
    let companyId: number;
    try {
      ({ companyId } = parseOAuthState(state, getStateSecret()));
    } catch {
      res.redirect(`${basePath}/settings?email=error&provider=gmail&reason=invalid_state`);
      return;
    }
    try {
      const redirectUri = getOAuthRedirectUri(req, GMAIL_CALLBACK_PATH);
      const tokens = await exchangeGoogleCode(code, redirectUri);
      const profile = await fetchGoogleProfile(tokens.accessToken);
      await createOrUpdateEmailAccount({
        companyId,
        connectedByUserId: null,
        provider: "gmail",
        emailAddress: profile.email,
        displayName: profile.displayName,
        status: "active",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        deltaCursor: null,
        selectedFolders: null,
        syncFrequency: "hourly",
        lastSyncAt: null,
        lastSyncError: null,
        nextSyncDueAt: new Date(),
      });
      res.redirect(`${basePath}/settings?email=connected&provider=gmail`);
    } catch (err: any) {
      res.redirect(`${basePath}/settings?email=error&provider=gmail&reason=${encodeURIComponent(err?.message ?? "token_exchange_failed")}`);
    }
  }),
);

// ── Folder / label listing (for the folder-selection picker) ────────────────
router.get(
  "/email-integrations/:accountId/folders",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("manageEmailIntegrations"),
  asyncHandler(async (req, res) => {
    const accountId = parseInt(req.params.accountId as string);
    if (isNaN(accountId)) throw new BadRequestError("Invalid account id");
    const account = await getEmailAccount(req.companyId!, accountId);
    if (!account) throw new NotFoundError("Email account not found");

    const valid = await getValidToken(account);
    const folders =
      valid.provider === "outlook" ? await listOutlookFolders(valid.accessToken!) : await listGmailLabels(valid.accessToken!);
    res.json({ folders });
  }),
);

// ── PATCH /email-integrations/:accountId ────────────────────────────────────
const UpdateAccountBody = z.object({
  selectedFolders: z.array(z.string()).optional(),
  syncFrequency: z.enum(["15min", "hourly", "daily"]).optional(),
});

router.patch(
  "/email-integrations/:accountId",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("manageEmailIntegrations"),
  asyncHandler(async (req, res) => {
    const accountId = parseInt(req.params.accountId as string);
    if (isNaN(accountId)) throw new BadRequestError("Invalid account id");
    const parsed = UpdateAccountBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.issues);

    const updated = await updateEmailAccountSettings(req.companyId!, accountId, parsed.data);
    if (!updated) throw new NotFoundError("Email account not found");

    logAuditEventFromRequest(req, "Email Integration Updated", `Updated settings for ${updated.emailAddress} (account ${accountId})`).catch(() => {});
    res.json(updated);
  }),
);

// ── DELETE /email-integrations/:accountId ───────────────────────────────────
router.delete(
  "/email-integrations/:accountId",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("manageEmailIntegrations"),
  asyncHandler(async (req, res) => {
    const accountId = parseInt(req.params.accountId as string);
    if (isNaN(accountId)) throw new BadRequestError("Invalid account id");
    const ok = await disconnectEmailAccount(req.companyId!, accountId);
    if (!ok) throw new NotFoundError("Email account not found");

    logAuditEventFromRequest(req, "Email Integration Disconnected", `Disconnected account ${accountId}`).catch(() => {});
    res.status(204).end();
  }),
);

// ── POST /email-integrations/:accountId/sync-now ────────────────────────────
router.post(
  "/email-integrations/:accountId/sync-now",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("manageEmailIntegrations"),
  asyncHandler(async (req, res) => {
    const accountId = parseInt(req.params.accountId as string);
    if (isNaN(accountId)) throw new BadRequestError("Invalid account id");
    const account = await getEmailAccount(req.companyId!, accountId);
    if (!account) throw new NotFoundError("Email account not found");
    if (account.status === "disconnected") throw new BadRequestError("Account is disconnected");

    const result = await syncEmailAccount(account);
    res.json(result);
  }),
);

// ── PATCH /email-integrations/threads/:threadId/assign-project ─────────────
// The manual "file this email" escape hatch. When assigning to a project,
// this now goes through recordManualAssignment (Phase 3) — every manual
// assignment reinforces the learned-signal table the matching engine
// consults, in addition to keeping triageStatus/matchSource consistent
// (previously this route only called assignThreadToProject, leaving those
// fields stale after a manual override). Unassigning (projectId: null)
// still uses the plain repository call — nothing to learn from a removal.
const AssignProjectBody = z.object({ projectId: z.number().int().nullable() });

router.patch(
  "/email-integrations/threads/:threadId/assign-project",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("viewProjectCommunications"),
  asyncHandler(async (req, res) => {
    const threadId = parseInt(req.params.threadId as string);
    if (isNaN(threadId)) throw new BadRequestError("Invalid thread id");
    const parsed = AssignProjectBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.issues);

    if (parsed.data.projectId == null) {
      const updated = await assignThreadToProject(req.companyId!, threadId, null);
      if (!updated) throw new NotFoundError("Thread not found");
      res.json(updated);
      return;
    }

    const project = await assertProjectInCompany(parsed.data.projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");

    const updated = await recordManualAssignment(req.companyId!, threadId, parsed.data.projectId, req.userId ?? null);
    if (!updated) throw new NotFoundError("Thread not found");
    res.json(updated);
  }),
);

export default router;
