import { db, invoicesTable, companiesTable } from "@workspace/db";
import { eq, and, lte, isNull, isNotNull, or, inArray, lt } from "drizzle-orm";
import { sendEmail, ResendSandboxError } from "./mailer.js";
import { logger } from "./logger.js";
import { format, subDays } from "date-fns";

const fmtCAD = (v: string | number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));

function buildReminderHtml(invoice: {
  invoiceNumber: string;
  clientName: string;
  total: string;
  dueDate: string | null;
}, companyName: string): string {
  const daysOverdue = invoice.dueDate
    ? Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#172034;">
      <div style="background:#FF6600;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">${companyName}</h1>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px;">Payment Reminder — ${invoice.invoiceNumber}</p>
      </div>
      <div style="background:#f9f9f9;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 16px;">Hi ${invoice.clientName},</p>
        <p style="margin:0 0 16px;">This is a friendly reminder that the following invoice is outstanding and awaiting payment.</p>
        ${daysOverdue && daysOverdue > 0
          ? `<p style="margin:0 0 16px;background:#FFF3CD;border:1px solid #FBBF24;border-radius:4px;padding:10px 14px;font-size:13px;color:#92400E;">
              This invoice is <strong>${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue</strong>. Please arrange payment at your earliest convenience.
            </p>`
          : ""}
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:4px 0 0 0;color:#6b7280;font-size:13px;">Invoice Number</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-left:none;border-radius:0 4px 0 0;font-size:13px;font-weight:600;">${invoice.invoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;color:#6b7280;font-size:13px;">Amount Due</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;font-size:13px;font-weight:600;color:#FF6600;">${fmtCAD(invoice.total)} CAD</td>
          </tr>
          ${invoice.dueDate ? `<tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 0 4px;color:#6b7280;font-size:13px;">Due Date</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;border-radius:0 0 4px 0;font-size:13px;font-weight:600;">${format(new Date(invoice.dueDate), "MMMM d, yyyy")}</td>
          </tr>` : ""}
        </table>
        <p style="margin:0;font-size:13px;color:#6b7280;">If you have already made payment, please disregard this reminder. If you have any questions, please reply to this email.</p>
        <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Thank you for your business.</p>
        <p style="margin:8px 0 0;font-size:13px;font-weight:600;">${companyName}</p>
      </div>
      <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0 0;">Powered by BuildCore</p>
    </div>
  `;
}

// Send a reminder for a single invoice. Returns true on success, false on sandbox block.
export async function sendReminderForInvoice(
  invoice: {
    id: number;
    invoiceNumber: string;
    clientName: string;
    clientEmail: string | null;
    total: string;
    dueDate: string | null;
  },
  companyName: string
): Promise<{ ok: boolean; sandboxWarning?: string }> {
  if (!invoice.clientEmail) {
    throw new Error(`Invoice ${invoice.invoiceNumber} has no client email`);
  }

  const html = buildReminderHtml(invoice, companyName);
  const subject = `Payment Reminder: Invoice ${invoice.invoiceNumber} — ${fmtCAD(invoice.total)} CAD`;

  try {
    await sendEmail({ to: [invoice.clientEmail], subject, html });

    // Mark reminderSentAt
    await db
      .update(invoicesTable)
      .set({ reminderSentAt: new Date(), updatedAt: new Date() })
      .where(eq(invoicesTable.id, invoice.id));

    return { ok: true };
  } catch (err) {
    if (err instanceof ResendSandboxError) {
      // Still record that we attempted, so we don't spam on auto-cron
      await db
        .update(invoicesTable)
        .set({ reminderSentAt: new Date(), updatedAt: new Date() })
        .where(eq(invoicesTable.id, invoice.id));
      return { ok: false, sandboxWarning: err.message };
    }
    throw err;
  }
}

// Auto-reminder cron: find invoices that are overdue / past due and haven't had a reminder
// in the last 7 days, then send reminders.
export async function sendOverdueReminders(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = subDays(today, 7);

  // Find all sent/overdue invoices with a past due date and no recent reminder
  const overdueInvoices = await db
    .select({
      id: invoicesTable.id,
      companyId: invoicesTable.companyId,
      invoiceNumber: invoicesTable.invoiceNumber,
      clientName: invoicesTable.clientName,
      clientEmail: invoicesTable.clientEmail,
      total: invoicesTable.total,
      dueDate: invoicesTable.dueDate,
      reminderSentAt: invoicesTable.reminderSentAt,
    })
    .from(invoicesTable)
    .where(
      and(
        inArray(invoicesTable.status, ["sent", "overdue"]),
        isNotNull(invoicesTable.dueDate),
        lte(invoicesTable.dueDate, format(today, "yyyy-MM-dd")),
        isNotNull(invoicesTable.clientEmail),
        or(
          isNull(invoicesTable.reminderSentAt),
          lt(invoicesTable.reminderSentAt, sevenDaysAgo)
        )
      )
    );

  if (overdueInvoices.length === 0) {
    logger.info("Overdue reminder cron: no invoices to remind");
    return { sent: 0, skipped: 0, errors: 0 };
  }

  // Fetch company names in one query
  const companyIds = [...new Set(overdueInvoices.map((i) => i.companyId))];
  const companies = await db
    .select({ id: companiesTable.id, name: companiesTable.name })
    .from(companiesTable)
    .where(inArray(companiesTable.id, companyIds));
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const invoice of overdueInvoices) {
    if (!invoice.clientEmail) { skipped++; continue; }
    const companyName = companyMap.get(invoice.companyId) ?? "BuildCore";
    try {
      const result = await sendReminderForInvoice(invoice as Parameters<typeof sendReminderForInvoice>[0], companyName);
      if (result.ok) {
        logger.info({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber }, "Overdue reminder sent");
        sent++;
      } else {
        logger.warn({ invoiceId: invoice.id, sandboxWarning: result.sandboxWarning }, "Reminder sandboxed");
        skipped++;
      }
    } catch (err) {
      logger.error({ err, invoiceId: invoice.id }, "Failed to send overdue reminder");
      errors++;
    }
  }

  return { sent, skipped, errors };
}
