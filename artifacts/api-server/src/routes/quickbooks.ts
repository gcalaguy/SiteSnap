import { Router } from "express";
import { db, quickbooksConnectionsTable, invoicesTable, costAnalysesTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwner } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_SCOPES = "com.intuit.quickbooks.accounting";

function getClientId() {
  return process.env.QB_CLIENT_ID ?? "";
}
function getClientSecret() {
  return process.env.QB_CLIENT_SECRET ?? "";
}
function getRedirectUri(req: any) {
  if (process.env.APP_BASE_URL) {
    return `${process.env.APP_BASE_URL}/api/quickbooks/callback`;
  }
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",");
  const domain = domains[0]?.trim() || req.headers.host;
  return `https://${domain}/api/quickbooks/callback`;
}
function getQbBaseUrl(environment: string) {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com/v3/company"
    : "https://sandbox-quickbooks.api.intuit.com/v3/company";
}

async function refreshAccessToken(conn: typeof quickbooksConnectionsTable.$inferSelect) {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const resp = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refreshToken,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await resp.json() as any;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await db.update(quickbooksConnectionsTable)
    .set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? conn.refreshToken,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(quickbooksConnectionsTable.id, conn.id));

  return { ...conn, accessToken: data.access_token, tokenExpiresAt: expiresAt };
}

async function getValidToken(companyId: number) {
  const [conn] = await db
    .select()
    .from(quickbooksConnectionsTable)
    .where(eq(quickbooksConnectionsTable.companyId, companyId))
    .limit(1);

  if (!conn) throw new Error("QuickBooks not connected");

  const bufferMs = 5 * 60 * 1000;
  if (new Date(conn.tokenExpiresAt).getTime() - bufferMs < Date.now()) {
    return refreshAccessToken(conn);
  }
  return conn;
}

async function qbRequest(conn: Awaited<ReturnType<typeof getValidToken>>, method: string, path: string, body?: unknown) {
  const base = getQbBaseUrl(conn.environment);
  const url = `${base}/${conn.realmId}${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!resp.ok) throw new Error(json?.Fault?.Error?.[0]?.Message ?? `QB API error ${resp.status}`);
  return json;
}

function escapeQbString(str: string): string {
  // QuickBooks IQL escaping: double single quotes; cap length to avoid query abuse
  return str.replace(/'/g, "''").slice(0, 200);
}

async function findOrCreateCustomer(conn: Awaited<ReturnType<typeof getValidToken>>, displayName: string, email?: string | null) {
  const safeName = escapeQbString(displayName);
  const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${safeName}' MAXRESULTS 1`);
  const result = await qbRequest(conn, "GET", `/query?query=${query}`);
  const existing = result?.QueryResponse?.Customer?.[0];
  if (existing) return existing.Id as string;

  const customer: any = { DisplayName: displayName };
  if (email) customer.PrimaryEmailAddr = { Address: email };

  const created = await qbRequest(conn, "POST", "/customer", { Customer: customer });
  return created?.Customer?.Id as string;
}

// ── GET /api/quickbooks/status ────────────────────────────────────────────────
router.get("/quickbooks/status", requireAuth, asyncHandler(async (req, res) => {
  let conn = null;
  if (req.companyId) {
    const [row] = await db
      .select({
        realmId: quickbooksConnectionsTable.realmId,
        environment: quickbooksConnectionsTable.environment,
        lastInvoiceSyncAt: quickbooksConnectionsTable.lastInvoiceSyncAt,
        lastCostSyncAt: quickbooksConnectionsTable.lastCostSyncAt,
        syncedInvoiceCount: quickbooksConnectionsTable.syncedInvoiceCount,
        syncedCostCount: quickbooksConnectionsTable.syncedCostCount,
        connectedAt: quickbooksConnectionsTable.connectedAt,
      })
      .from(quickbooksConnectionsTable)
      .where(eq(quickbooksConnectionsTable.companyId, req.companyId))
      .limit(1);
    conn = row ?? null;
  }

  res.json({ connected: !!conn, connection: conn, configured: !!(getClientId() && getClientSecret()) });
}))

// ── GET /api/quickbooks/auth-url ─────────────────────────────────────────────
router.get("/quickbooks/auth-url", requireAuth, requireCompany, requireOwner, (req, res) => {
  const clientId = getClientId();
  if (!clientId) {
    res.status(503).json({ error: "QuickBooks integration not configured. Set QB_CLIENT_ID and QB_CLIENT_SECRET." });
    return;
  }

  const state = Buffer.from(JSON.stringify({ companyId: req.companyId, ts: Date.now() })).toString("base64url");
  const redirectUri = getRedirectUri(req);

  const params = new URLSearchParams({
    client_id: clientId,
    scope: QB_SCOPES,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    state,
  });

  res.json({ url: `${QB_AUTH_URL}?${params}` });
});

// ── GET /api/quickbooks/callback ─────────────────────────────────────────────
router.get("/quickbooks/callback", asyncHandler(async (req, res) => {
  const { code, realmId, state, error } = req.query as Record<string, string>;

  const basePath =
    process.env.APP_BASE_URL ??
    ((process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim()
      ? `https://${(process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim()}`
      : "");

  if (error) {
    res.redirect(`${basePath}/settings?qb=error&reason=${encodeURIComponent(error)}`);
    return;
  }

  let companyId: number;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    companyId = decoded.companyId;
    if (!companyId) throw new Error("missing");
  } catch {
    res.redirect(`${basePath}/settings?qb=error&reason=invalid_state`);
    return;
  }

  try {
    const clientId = getClientId();
    const clientSecret = getClientSecret();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const redirectUri = getRedirectUri(req);

    const tokenResp = await fetch(QB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      throw new Error(err);
    }

    const tokens = await tokenResp.json() as any;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const environment = req.query.environment as string ?? "sandbox";

    await db.insert(quickbooksConnectionsTable).values({
      companyId,
      realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: expiresAt,
      environment,
    }).onConflictDoUpdate({
      target: quickbooksConnectionsTable.companyId,
      set: {
        realmId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: expiresAt,
        environment,
        updatedAt: new Date(),
      },
    });

    res.redirect(`${basePath}/settings?qb=connected`);
  } catch (err: any) {
    res.redirect(`${basePath}/settings?qb=error&reason=${encodeURIComponent(err?.message ?? "token_exchange_failed")}`);
  }
}))

// ── DELETE /api/quickbooks/disconnect ─────────────────────────────────────────
router.delete("/quickbooks/disconnect", requireAuth, requireCompany, requireOwner, asyncHandler(async (req, res) => {
  await db.delete(quickbooksConnectionsTable)
    .where(eq(quickbooksConnectionsTable.companyId, req.companyId!));
  res.json({ ok: true });
}))

// ── POST /api/quickbooks/sync/invoices ────────────────────────────────────────
router.post("/quickbooks/sync/invoices", requireAuth, requireCompany, requireOwner, asyncHandler(async (req, res) => {
  try {
    const conn = await getValidToken(req.companyId!);

    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.companyId, req.companyId!));

    let synced = 0;
    const errors: string[] = [];

    for (const inv of invoices) {
      try {
        const customerId = await findOrCreateCustomer(conn, inv.clientName, inv.clientEmail);
        const lineItems = (inv.lineItems as any[]).map((li, idx) => ({
          Id: String(idx + 1),
          LineNum: idx + 1,
          Amount: Number(li.total),
          DetailType: "SalesItemLineDetail",
          Description: li.description,
          SalesItemLineDetail: {
            ItemRef: { value: "1", name: "Services" },
            Qty: Number(li.quantity),
            UnitPrice: Number(li.unitPrice),
          },
        }));

        const qbInvoice: any = {
          Line: lineItems,
          CustomerRef: { value: customerId },
          DocNumber: inv.invoiceNumber,
          TxnDate: inv.createdAt.toISOString().split("T")[0],
          DueDate: inv.dueDate ?? undefined,
          CustomerMemo: { value: inv.notes ?? "" },
          TxnTaxDetail: {
            TotalTax: Number(inv.taxAmount),
          },
        };

        if (inv.status === "paid" && inv.paidAt) {
          qbInvoice.Balance = 0;
        }

        await qbRequest(conn, "POST", "/invoice", { Invoice: qbInvoice });
        synced++;
      } catch (err: any) {
        errors.push(`Invoice ${inv.invoiceNumber}: ${err?.message}`);
      }
    }

    await db.update(quickbooksConnectionsTable)
      .set({ lastInvoiceSyncAt: new Date(), syncedInvoiceCount: synced, updatedAt: new Date() })
      .where(eq(quickbooksConnectionsTable.companyId, req.companyId!));

    res.json({ synced, total: invoices.length, errors });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Sync failed" });
  }
}))

// ── POST /api/quickbooks/sync/costs ──────────────────────────────────────────
router.post("/quickbooks/sync/costs", requireAuth, requireCompany, requireOwner, asyncHandler(async (req, res) => {
  try {
    const conn = await getValidToken(req.companyId!);

    const costs = await db
      .select({
        id: costAnalysesTable.id,
        projectId: costAnalysesTable.projectId,
        periodLabel: costAnalysesTable.periodLabel,
        labourCost: costAnalysesTable.labourCost,
        materialsCost: costAnalysesTable.materialsCost,
        equipmentCost: costAnalysesTable.equipmentCost,
        otherCost: costAnalysesTable.otherCost,
        totalCost: costAnalysesTable.totalCost,
        createdAt: costAnalysesTable.createdAt,
        projectName: projectsTable.name,
      })
      .from(costAnalysesTable)
      .leftJoin(projectsTable, eq(costAnalysesTable.projectId, projectsTable.id))
      .where(eq(projectsTable.companyId, req.companyId!));

    let synced = 0;
    const errors: string[] = [];

    for (const cost of costs) {
      try {
        const memo = `${cost.projectName ?? "Project"} — ${cost.periodLabel}`;
        const txnDate = cost.createdAt.toISOString().split("T")[0];

        const journalLines: any[] = [];
        const entries = [
          { desc: "Labour", amount: Number(cost.labourCost) },
          { desc: "Materials", amount: Number(cost.materialsCost) },
          { desc: "Equipment", amount: Number(cost.equipmentCost) },
          { desc: "Other", amount: Number(cost.otherCost) },
        ].filter((e) => e.amount > 0);

        for (const entry of entries) {
          journalLines.push({
            Amount: entry.amount,
            DetailType: "JournalEntryLineDetail",
            Description: `${memo} — ${entry.desc}`,
            JournalEntryLineDetail: {
              PostingType: "Debit",
              AccountRef: { name: "Construction Costs" },
            },
          });
          journalLines.push({
            Amount: entry.amount,
            DetailType: "JournalEntryLineDetail",
            Description: `${memo} — ${entry.desc}`,
            JournalEntryLineDetail: {
              PostingType: "Credit",
              AccountRef: { name: "Accounts Payable (A/P)" },
            },
          });
        }

        if (journalLines.length > 0) {
          await qbRequest(conn, "POST", "/journalentry", {
            JournalEntry: { TxnDate: txnDate, PrivateNote: memo, Line: journalLines },
          });
          synced++;
        }
      } catch (err: any) {
        errors.push(`Cost ${cost.id}: ${err?.message}`);
      }
    }

    await db.update(quickbooksConnectionsTable)
      .set({ lastCostSyncAt: new Date(), syncedCostCount: synced, updatedAt: new Date() })
      .where(eq(quickbooksConnectionsTable.companyId, req.companyId!));

    res.json({ synced, total: costs.length, errors });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Sync failed" });
  }
}))

export default router;
