import { Router } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  db,
  projectsTable,
  timesheetsTable,
  usersTable,
  projectDocumentsTable,
} from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requirePermission } from "../lib/permissionGate";
import { ObjectStorageService } from "../lib/objectStorage";
import JSZip from "jszip";

const router = Router();
const objectStorageService = new ObjectStorageService();

function formatDate(d: Date | string | null) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("en-CA");
}

function escapeCsv(val: string | number | null | undefined) {
  let str = String(val ?? "");
  // Neutralize CSV/formula injection (CWE-1236): a value starting with one of
  // these characters is interpreted as a formula by Excel/Sheets on open,
  // which can exfiltrate data or run macros via a crafted vendor name / AI
  // summary embedded in an uploaded receipt (both OCR'd, attacker-controlled).
  // Prefixing with a single quote forces the cell to be read as plain text.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}


function toCsvRow(values: (string | number | null | undefined)[]) {
  return values.map(escapeCsv).join(",") + "\r\n";
}

// GET /companies/:companyId/accounting/export-data
router.get(
  "/companies/:companyId/accounting/export-data",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requirePermission("viewFinancials"),
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    if (isNaN(companyId) || companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const zip = new JSZip();
    const timestamp = new Date().toISOString().slice(0, 10);

    // ── CSV 1: Expenses & OCR Data ───────────────────────────────────────────
    const expenseHeaders = [
      "Date",
      "Document Type",
      "Filename",
      "Vendor",
      "Amount",
      "Currency",
      "Items Count",
      "Project Name",
      "Storage Reference",
      "AI Summary",
    ];
    let expenseCsv = toCsvRow(expenseHeaders);

    const ocrDocs = await db
      .select({
        id: projectDocumentsTable.id,
        filename: projectDocumentsTable.filename,
        fileType: projectDocumentsTable.fileType,
        objectPath: projectDocumentsTable.objectPath,
        extractedData: projectDocumentsTable.extractedData,
        aiSummary: projectDocumentsTable.aiSummary,
        createdAt: projectDocumentsTable.createdAt,
        projectId: projectDocumentsTable.projectId,
        projectName: projectsTable.name,
      })
      .from(projectDocumentsTable)
      .innerJoin(projectsTable, eq(projectsTable.id, projectDocumentsTable.projectId))
      .where(
        and(
          eq(projectsTable.companyId, companyId),
          eq(projectDocumentsTable.status, "ready"),
        ),
      )
      .orderBy(desc(projectDocumentsTable.createdAt));

    const attachmentEntries: { path: string; filename: string; buffer: Buffer }[] = [];

    for (const doc of ocrDocs) {
      const extracted = (doc.extractedData ?? {}) as Record<string, unknown>;
      const vendor = String(extracted.vendor ?? "");
      const amount = typeof extracted.amount === "number" ? extracted.amount.toFixed(2) : "";
      const currency = String(extracted.currency ?? "CAD");
      const items = Array.isArray(extracted.items) ? extracted.items : [];
      const docType = typeof extracted.documentType === "string" ? extracted.documentType : "Document";

      expenseCsv += toCsvRow([
        formatDate(doc.createdAt),
        docType,
        doc.filename,
        vendor,
        amount,
        currency,
        items.length,
        doc.projectName ?? "",
        doc.objectPath,
        doc.aiSummary ?? "",
      ]);

      // Download attachment for the /attachments/ folder
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
        const [buffer] = await objectFile.download();
        const safeName = doc.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        attachmentEntries.push({
          path: `attachments/${safeName}`,
          filename: safeName,
          buffer: buffer as Buffer,
        });
      } catch {
        // Skip files that can't be fetched; the CSV still references them
      }
    }

    zip.file("expenses_and_ocr.csv", expenseCsv);

    // ── CSV 2: Approved Timesheets ───────────────────────────────────────────
    const timesheetHeaders = [
      "Worker Name",
      "Project Name",
      "Week Start",
      "Total Hours",
      "Billable Rate",
      "Total Cost",
      "Description",
      "Approver Name",
      "Approved At",
      "Timesheet ID",
    ];
    let timesheetCsv = toCsvRow(timesheetHeaders);

    const approvedTimesheets = await db
      .select({
        id: timesheetsTable.id,
        weekStart: timesheetsTable.weekStart,
        totalHours: timesheetsTable.totalHours,
        hourlyRate: timesheetsTable.hourlyRate,
        description: timesheetsTable.description,
        projectId: timesheetsTable.projectId,
        projectName: projectsTable.name,
        userId: timesheetsTable.userId,
        workerFirstName: usersTable.firstName,
        workerLastName: usersTable.lastName,
        reviewedByUserId: timesheetsTable.reviewedByUserId,
        reviewedAt: timesheetsTable.reviewedAt,
      })
      .from(timesheetsTable)
      .leftJoin(projectsTable, eq(projectsTable.id, timesheetsTable.projectId))
      .leftJoin(usersTable, eq(usersTable.id, timesheetsTable.userId))
      .where(
        and(
          eq(timesheetsTable.companyId, companyId),
          eq(timesheetsTable.status, "approved"),
        ),
      )
      .orderBy(desc(timesheetsTable.weekStart));

    // Fetch approver names in a single batched query
    const approverIds = Array.from(
      new Set(approvedTimesheets.map((t) => t.reviewedByUserId).filter(Boolean) as number[]),
    );
    const approverMap = new Map<number, string>();
    if (approverIds.length > 0) {
      const approvers = await db
        .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
        .from(usersTable)
        .where(inArray(usersTable.id, approverIds));
      for (const a of approvers) {
        approverMap.set(a.id, `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim());
      }
    }

    for (const ts of approvedTimesheets) {
      const hours = parseFloat(ts.totalHours ?? "0");
      const rate = ts.hourlyRate ? parseFloat(ts.hourlyRate) : 0;
      const totalCost = rate > 0 ? (hours * rate).toFixed(2) : "";
      const workerName = `${ts.workerFirstName ?? ""} ${ts.workerLastName ?? ""}`.trim();
      const approverName = ts.reviewedByUserId ? (approverMap.get(ts.reviewedByUserId) ?? "") : "";

      timesheetCsv += toCsvRow([
        workerName,
        ts.projectName ?? "",
        ts.weekStart ?? "",
        hours.toFixed(2),
        rate > 0 ? rate.toFixed(2) : "",
        totalCost,
        ts.description ?? "",
        approverName,
        formatDate(ts.reviewedAt),
        String(ts.id),
      ]);
    }

    zip.file("approved_timesheets.csv", timesheetCsv);

    // ── Attachments subfolder ────────────────────────────────────────────────
    for (const entry of attachmentEntries) {
      zip.file(entry.path, entry.buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="accountant_export_${timestamp}.zip"`,
    );
    res.setHeader("Content-Length", String(zipBuffer.length));
    res.send(zipBuffer);
  }),
);

export default router;
