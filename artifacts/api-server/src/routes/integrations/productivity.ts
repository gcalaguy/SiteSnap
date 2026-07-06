/**
 * Productivity Integrations Router
 *
 * Routes:
 *  - POST /api/integrations/export-sheets
 *      Export financials (invoices, payments, change orders) to Google Sheets.
 *      Body: { spreadsheetId: string, range?: string }
 *  - POST /api/integrations/create-google-calendar-event
 *      Create a Google Calendar event from the user's linked Google account.
 *      Body: CalendarEventInput
 *  - POST /api/integrations/create-outlook-event
 *      Create an Outlook Calendar event via Microsoft Graph.
 *      Body: CalendarEventInput
 *
 *  All routes are authenticated and company-scoped.
 */

import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  invoicesTable,
  paymentsTable,
  changeOrdersTable,
  providerTokensTable,
} from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../../lib/auth";
import { requirePermission } from "../../lib/permissionGate";
import { z } from "zod";
import {
  appendToGoogleSheet,
  createGoogleCalendarEvent,
  createOutlookEvent,
} from "../../services/externalSyncService";

const router = Router();

// ── POST /integrations/export-sheets ───────────────────────────────────────

const ExportSheetsBody = z.object({
  spreadsheetId: z.string().min(1),
  range: z.string().optional(),
});

router.post(
  "/integrations/export-sheets",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requirePermission("viewFinancials"),
  async (req, res) => {
    const companyId = req.companyId!;
    const userId = req.userId!;

    const parsed = ExportSheetsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    // Look up the user's stored Google access token
    const [tokenRow] = await db
      .select()
      .from(providerTokensTable)
      .where(
        and(
          eq(providerTokensTable.userId, userId),
          eq(providerTokensTable.companyId, companyId),
          eq(providerTokensTable.provider, "google"),
        ),
      );

    if (!tokenRow || !tokenRow.accessToken) {
      res.status(400).json({
        error:
          "Google account not linked. Connect your Google account in Settings first.",
        code: "GOOGLE_NOT_LINKED",
      });
      return;
    }

    // Pull financials
    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.companyId, companyId))
      .orderBy(desc(invoicesTable.createdAt));

    const payments = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.companyId, companyId))
      .orderBy(desc(paymentsTable.paidAt));

    const changeOrders = await db
      .select()
      .from(changeOrdersTable)
      .where(eq(changeOrdersTable.companyId, companyId))
      .orderBy(desc(changeOrdersTable.createdAt));

    // Build rows
    const rows: Array<Array<string>> = [];
    rows.push(["Invoice #", "Client", "Status", "Total", "Date"]);
    for (const inv of invoices) {
      rows.push([
        inv.invoiceNumber,
        inv.clientName,
        inv.status,
        String(inv.total ?? "0"),
        inv.createdAt ? new Date(inv.createdAt).toISOString().slice(0, 10) : "",
      ]);
    }

    rows.push([]); // blank row
    rows.push(["Payment ID", "Invoice ID", "Method", "Amount", "Paid At"]);
    for (const p of payments) {
      rows.push([
        String(p.id),
        String(p.invoiceId),
        p.method,
        String(p.amount ?? "0"),
        p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : "",
      ]);
    }

    rows.push([]); // blank row
    rows.push(["Change Order #", "Project", "Status", "Amount", "Date"]);
    for (const co of changeOrders) {
      rows.push([
        String(co.id),
        String(co.projectId ?? ""),
        co.status,
        String(co.amount ?? "0"),
        co.createdAt ? new Date(co.createdAt).toISOString().slice(0, 10) : "",
      ]);
    }

    try {
      const result = await appendToGoogleSheet(tokenRow.accessToken, {
        spreadsheetId: parsed.data.spreadsheetId,
        range: parsed.data.range ?? "Sheet1!A1",
        values: rows,
      });

      res.json({
        success: true,
        rowsAppended: rows.length,
        spreadsheetId: parsed.data.spreadsheetId,
        updates: result.updates,
      });
    } catch (err: any) {
      req.log?.error?.({ err }, "Google Sheets append failed");
      res.status(502).json({
        error: "Failed to write to Google Sheets. Check permissions and sheet ID.",
        code: "SHEETS_WRITE_FAILED",
      });
    }
  },
);

// ── Shared calendar event body schema ──────────────────────────────────────

const CalendarEventBody = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  start: z.object({
    dateTime: z.string().min(1),
    timeZone: z.string().optional(),
  }),
  end: z.object({
    dateTime: z.string().min(1),
    timeZone: z.string().optional(),
  }),
  location: z.string().optional(),
  attendees: z.array(z.object({ email: z.string().email() })).optional(),
});

// ── POST /integrations/create-google-calendar-event ────────────────────────

router.post(
  "/integrations/create-google-calendar-event",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  async (req, res) => {
    const userId = req.userId!;
    const companyId = req.companyId!;

    const parsed = CalendarEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const [tokenRow] = await db
      .select()
      .from(providerTokensTable)
      .where(
        and(
          eq(providerTokensTable.userId, userId),
          eq(providerTokensTable.companyId, companyId),
          eq(providerTokensTable.provider, "google"),
        ),
      );

    if (!tokenRow?.accessToken) {
      res.status(400).json({
        error:
          "Google account not linked. Connect your Google account in Settings first.",
        code: "GOOGLE_NOT_LINKED",
      });
      return;
    }

    try {
      const result = await createGoogleCalendarEvent(
        tokenRow.accessToken,
        parsed.data,
      );
      res.json({ success: true, ...result });
    } catch (err: any) {
      req.log?.error?.({ err }, "Google Calendar event creation failed");
      res.status(502).json({
        error:
          "Failed to create Google Calendar event. Check permissions and try again.",
        code: "GOOGLE_CALENDAR_FAILED",
      });
    }
  },
);

// ── POST /integrations/create-outlook-event ────────────────────────────────

router.post(
  "/integrations/create-outlook-event",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  async (req, res) => {
    const userId = req.userId!;
    const companyId = req.companyId!;

    const parsed = CalendarEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const [tokenRow] = await db
      .select()
      .from(providerTokensTable)
      .where(
        and(
          eq(providerTokensTable.userId, userId),
          eq(providerTokensTable.companyId, companyId),
          eq(providerTokensTable.provider, "outlook"),
        ),
      );

    if (!tokenRow?.accessToken) {
      res.status(400).json({
        error:
          "Outlook account not linked. Connect your Microsoft account in Settings first.",
        code: "OUTLOOK_NOT_LINKED",
      });
      return;
    }

    try {
      const result = await createOutlookEvent(tokenRow.accessToken, parsed.data);
      res.json({ success: true, ...result });
    } catch (err: any) {
      req.log?.error?.({ err }, "Outlook Calendar event creation failed");
      res.status(502).json({
        error:
          "Failed to create Outlook Calendar event. Check permissions and try again.",
        code: "OUTLOOK_CALENDAR_FAILED",
      });
    }
  },
);

export default router;
