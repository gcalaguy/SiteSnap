import { Router } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  db,
  projectsTable,
  timesheetsTable,
  usersTable,
  projectDocumentsTable,
  expensesTable,
  invoicesTable,
  paymentsTable,
  changeOrdersTable,
  costAnalysesTable,
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

    // ── CSV 3: Expense Ledger (canonical) ────────────────────────────────────
    // Sourced from expensesTable — the money ledger the Financials > Expenses
    // page reads. This includes manually-entered expenses, auto-synced Documents
    // receipts, and any historical receipts pulled in by the backfill script
    // (backfillReceiptExpenses). Complements expenses_and_ocr.csv above, which
    // lists the raw uploaded/OCR'd documents rather than booked expense amounts.
    const expenseLedgerHeaders = [
      "Date",
      "Vendor",
      "Description",
      "Amount",
      "Tax (HST)",
      "Status",
      "Project Name",
      "Submitted By",
      "Receipt Reference",
      "Expense ID",
    ];
    let expenseLedgerCsv = toCsvRow(expenseLedgerHeaders);

    const expenseRows = await db
      .select({
        id: expensesTable.id,
        expenseDate: expensesTable.expenseDate,
        createdAt: expensesTable.createdAt,
        vendorName: expensesTable.vendorName,
        description: expensesTable.description,
        amount: expensesTable.amount,
        taxAmount: expensesTable.taxAmount,
        status: expensesTable.status,
        receiptObjectPath: expensesTable.receiptObjectPath,
        projectName: projectsTable.name,
        submitterFirstName: usersTable.firstName,
        submitterLastName: usersTable.lastName,
      })
      .from(expensesTable)
      .leftJoin(projectsTable, eq(projectsTable.id, expensesTable.projectId))
      .leftJoin(usersTable, eq(usersTable.id, expensesTable.submittedByUserId))
      .where(eq(expensesTable.companyId, companyId))
      .orderBy(desc(expensesTable.createdAt));

    for (const exp of expenseRows) {
      const submitter = `${exp.submitterFirstName ?? ""} ${exp.submitterLastName ?? ""}`.trim();
      expenseLedgerCsv += toCsvRow([
        exp.expenseDate ?? formatDate(exp.createdAt),
        exp.vendorName ?? "",
        exp.description ?? "",
        exp.amount ?? "",
        exp.taxAmount ?? "",
        exp.status ?? "",
        exp.projectName ?? "",
        submitter,
        exp.receiptObjectPath ?? "",
        String(exp.id),
      ]);
    }

    zip.file("expenses_ledger.csv", expenseLedgerCsv);

    // ── CSV 4: Invoices ──────────────────────────────────────────────────────
    const invoiceHeaders = [
      "Invoice Number",
      "Date Created",
      "Status",
      "Client",
      "Client Email",
      "Project Name",
      "Subtotal",
      "Tax Rate",
      "Tax Amount",
      "Total",
      "Due Date",
      "Sent At",
      "Paid At",
      "Notes",
      "Invoice ID",
    ];
    let invoiceCsv = toCsvRow(invoiceHeaders);

    const invoiceRows = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        createdAt: invoicesTable.createdAt,
        status: invoicesTable.status,
        clientName: invoicesTable.clientName,
        clientEmail: invoicesTable.clientEmail,
        subtotal: invoicesTable.subtotal,
        taxRate: invoicesTable.taxRate,
        taxAmount: invoicesTable.taxAmount,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        sentAt: invoicesTable.sentAt,
        paidAt: invoicesTable.paidAt,
        notes: invoicesTable.notes,
        projectName: projectsTable.name,
      })
      .from(invoicesTable)
      .leftJoin(projectsTable, eq(projectsTable.id, invoicesTable.projectId))
      .where(eq(invoicesTable.companyId, companyId))
      .orderBy(desc(invoicesTable.createdAt));

    for (const inv of invoiceRows) {
      invoiceCsv += toCsvRow([
        inv.invoiceNumber,
        formatDate(inv.createdAt),
        inv.status,
        inv.clientName ?? "",
        inv.clientEmail ?? "",
        inv.projectName ?? "",
        inv.subtotal ?? "",
        inv.taxRate ?? "",
        inv.taxAmount ?? "",
        inv.total ?? "",
        inv.dueDate ?? "",
        formatDate(inv.sentAt),
        formatDate(inv.paidAt),
        inv.notes ?? "",
        String(inv.id),
      ]);
    }

    zip.file("invoices.csv", invoiceCsv);

    // ── CSV 5: Paid-Invoice Transaction Journal ──────────────────────────────
    // One row per recorded payment against an invoice — the flat cash-receipts
    // journal accountants reconcile against bank deposits.
    const journalHeaders = [
      "Payment Date",
      "Invoice Number",
      "Client",
      "Project Name",
      "Payment Amount",
      "Method",
      "Invoice Total",
      "Invoice Status",
      "Notes",
      "Payment ID",
      "Invoice ID",
    ];
    let journalCsv = toCsvRow(journalHeaders);

    const paymentRows = await db
      .select({
        paymentId: paymentsTable.id,
        paidAt: paymentsTable.paidAt,
        amount: paymentsTable.amount,
        method: paymentsTable.method,
        notes: paymentsTable.notes,
        invoiceId: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        invoiceTotal: invoicesTable.total,
        invoiceStatus: invoicesTable.status,
        clientName: invoicesTable.clientName,
        projectName: projectsTable.name,
      })
      .from(paymentsTable)
      .innerJoin(invoicesTable, eq(invoicesTable.id, paymentsTable.invoiceId))
      .leftJoin(projectsTable, eq(projectsTable.id, invoicesTable.projectId))
      .where(eq(paymentsTable.companyId, companyId))
      .orderBy(desc(paymentsTable.paidAt));

    for (const pay of paymentRows) {
      journalCsv += toCsvRow([
        formatDate(pay.paidAt),
        pay.invoiceNumber,
        pay.clientName ?? "",
        pay.projectName ?? "",
        pay.amount ?? "",
        pay.method ?? "",
        pay.invoiceTotal ?? "",
        pay.invoiceStatus,
        pay.notes ?? "",
        String(pay.paymentId),
        String(pay.invoiceId),
      ]);
    }

    zip.file("paid_invoices_journal.csv", journalCsv);

    // ── CSV 6: Approved Change Orders ────────────────────────────────────────
    const changeOrderHeaders = [
      "Approved Date",
      "Title",
      "Description",
      "Amount",
      "Project Name",
      "Approved By",
      "Signed At",
      "Notes",
      "Change Order ID",
    ];
    let changeOrderCsv = toCsvRow(changeOrderHeaders);

    const changeOrderRows = await db
      .select({
        id: changeOrdersTable.id,
        title: changeOrdersTable.title,
        description: changeOrdersTable.description,
        amount: changeOrdersTable.amount,
        approvedAt: changeOrdersTable.approvedAt,
        signedAt: changeOrdersTable.signedAt,
        notes: changeOrdersTable.notes,
        projectName: projectsTable.name,
        approverFirstName: usersTable.firstName,
        approverLastName: usersTable.lastName,
      })
      .from(changeOrdersTable)
      .leftJoin(projectsTable, eq(projectsTable.id, changeOrdersTable.projectId))
      .leftJoin(usersTable, eq(usersTable.id, changeOrdersTable.approvedByUserId))
      .where(
        and(
          eq(changeOrdersTable.companyId, companyId),
          eq(changeOrdersTable.status, "approved"),
        ),
      )
      .orderBy(desc(changeOrdersTable.approvedAt));

    for (const co of changeOrderRows) {
      const approver = `${co.approverFirstName ?? ""} ${co.approverLastName ?? ""}`.trim();
      changeOrderCsv += toCsvRow([
        formatDate(co.approvedAt),
        co.title ?? "",
        co.description ?? "",
        co.amount ?? "",
        co.projectName ?? "",
        approver,
        formatDate(co.signedAt),
        co.notes ?? "",
        String(co.id),
      ]);
    }

    zip.file("approved_change_orders.csv", changeOrderCsv);

    // ── CSV 7: Project Costs ─────────────────────────────────────────────────
    // Period cost breakdowns (labour / materials / equipment / other) per
    // project from costAnalysesTable — scoped to the company via its projects.
    const projectCostHeaders = [
      "Period",
      "Project Name",
      "Labour",
      "Materials",
      "Equipment",
      "Other",
      "Total",
      "Notes",
      "Recorded At",
      "Cost Entry ID",
    ];
    let projectCostCsv = toCsvRow(projectCostHeaders);

    const projectCostRows = await db
      .select({
        id: costAnalysesTable.id,
        periodLabel: costAnalysesTable.periodLabel,
        labourCost: costAnalysesTable.labourCost,
        materialsCost: costAnalysesTable.materialsCost,
        equipmentCost: costAnalysesTable.equipmentCost,
        otherCost: costAnalysesTable.otherCost,
        totalCost: costAnalysesTable.totalCost,
        notes: costAnalysesTable.notes,
        createdAt: costAnalysesTable.createdAt,
        projectName: projectsTable.name,
      })
      .from(costAnalysesTable)
      .innerJoin(projectsTable, eq(projectsTable.id, costAnalysesTable.projectId))
      .where(eq(projectsTable.companyId, companyId))
      .orderBy(desc(costAnalysesTable.createdAt));

    for (const cost of projectCostRows) {
      projectCostCsv += toCsvRow([
        cost.periodLabel ?? "",
        cost.projectName ?? "",
        cost.labourCost ?? "",
        cost.materialsCost ?? "",
        cost.equipmentCost ?? "",
        cost.otherCost ?? "",
        cost.totalCost ?? "",
        cost.notes ?? "",
        formatDate(cost.createdAt),
        String(cost.id),
      ]);
    }

    zip.file("project_costs.csv", projectCostCsv);

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
