import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  invoicesTable,
  paymentsTable,
  changeOrdersTable,
  projectsTable,
  costAnalysesTable,
} from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";

const router = Router();

function formatDate(d: Date | string | null) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("en-CA");
}

function escapeCsv(val: string | number | null | undefined) {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function describeToAccountCode(description: string) {
  const d = description.toLowerCase();
  if (d.includes("labour") || d.includes("labor") || d.includes("wage")) return "5101";
  if (d.includes("material")) return "5102";
  if (d.includes("subcontract")) return "5103";
  if (d.includes("equipment") || d.includes("rental") || d.includes("machine")) return "5104";
  if (d.includes("permit")) return "6101";
  if (d.includes("inspection")) return "6102";
  if (d.includes("insurance")) return "6103";
  if (d.includes("overhead")) return "6104";
  if (d.includes("change order")) return "6201";
  return "4101"; // default revenue
}

// GET /companies/:companyId/accounting/export-data
router.get(
  "/companies/:companyId/accounting/export-data",
  requireAuth,
  requireCompany,
  requirePermission("viewFinancials"),
  async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    if (isNaN(companyId) || companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const rows: {
      date: string;
      documentNumber: string;
      projectSite: string;
      accountCode: string;
      vendorPayee: string;
      grossAmount: string;
      tax: string;
    }[] = [];

    // 1. Paid invoice line items (treat as revenue)
    const paidInvoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        createdAt: invoicesTable.createdAt,
        clientName: invoicesTable.clientName,
        taxAmount: invoicesTable.taxAmount,
        total: invoicesTable.total,
        lineItems: invoicesTable.lineItems,
        projectId: invoicesTable.projectId,
      })
      .from(invoicesTable)
      .leftJoin(paymentsTable, eq(paymentsTable.invoiceId, invoicesTable.id))
      .where(and(eq(invoicesTable.companyId, companyId), eq(invoicesTable.status, "paid")))
      .orderBy(desc(invoicesTable.createdAt));

    const projectIds = Array.from(
      new Set(paidInvoices.map((i) => i.projectId).filter(Boolean) as number[]),
    );

    const projectMap = new Map<number, string>();
    if (projectIds.length > 0) {
      const projects = await db
        .select({ id: projectsTable.id, name: projectsTable.name })
        .from(projectsTable)
        .where(eq(projectsTable.companyId, companyId));
      for (const p of projects) projectMap.set(p.id, p.name);
    }

    for (const inv of paidInvoices) {
      const items = inv.lineItems ?? [];
      const lineTax = parseFloat(inv.taxAmount ?? "0");
      const lineTotal = parseFloat(inv.total ?? "0");
      const taxable = lineTax > 0 ? lineTotal - lineTax : lineTotal;
      const perItemTax = items.length > 0 ? lineTax / items.length : 0;

      for (const item of items) {
        rows.push({
          date: formatDate(inv.createdAt),
          documentNumber: inv.invoiceNumber ?? `INV-${inv.id}`,
          projectSite: projectMap.get(inv.projectId as number) ?? "",
          accountCode: describeToAccountCode(item.description),
          vendorPayee: inv.clientName ?? "Client",
          grossAmount: (item.total ?? 0).toFixed(2),
          tax: perItemTax.toFixed(2),
        });
      }
    }

    // 2. Approved change orders (treat as change-order revenue)
    const approvedChangeOrders = await db
      .select()
      .from(changeOrdersTable)
      .where(and(eq(changeOrdersTable.companyId, companyId), eq(changeOrdersTable.status, "approved")))
      .orderBy(desc(changeOrdersTable.createdAt));

    for (const co of approvedChangeOrders) {
      rows.push({
        date: formatDate(co.approvedAt ?? co.createdAt),
        documentNumber: `CO-${co.id}`,
        projectSite: projectMap.get(co.projectId) ?? "",
        accountCode: "6201",
        vendorPayee: "",
        grossAmount: parseFloat(co.amount ?? "0").toFixed(2),
        tax: "",
      });
    }

    // 3. Cost analyses (treat as costs)
    const costs = await db
      .select()
      .from(costAnalysesTable)
      .leftJoin(projectsTable, eq(costAnalysesTable.projectId, projectsTable.id))
      .where(eq(projectsTable.companyId, companyId))
      .orderBy(desc(costAnalysesTable.createdAt));

    for (const cost of costs) {
      const c = cost.cost_analyses;
      const p = cost.projects;
      const date = formatDate(c.createdAt);
      const site = p?.name ?? "";
      const entries: { code: string; label: string; amount: string }[] = [
        { code: "5101", label: "Direct Labour", amount: c.labourCost ?? "0" },
        { code: "5102", label: "Materials", amount: c.materialsCost ?? "0" },
        { code: "5104", label: "Equipment Rental", amount: c.equipmentCost ?? "0" },
        { code: "6104", label: "Overhead & Indirect", amount: c.otherCost ?? "0" },
      ];

      for (const entry of entries) {
        const amt = parseFloat(entry.amount);
        if (amt > 0) {
          rows.push({
            date,
            documentNumber: `CA-${c.id}`,
            projectSite: site,
            accountCode: entry.code,
            vendorPayee: entry.label,
            grossAmount: amt.toFixed(2),
            tax: "",
          });
        }
      }
    }

    res.json(rows);
  },
);

export default router;
