import { databasePool } from '../lib/db'; // Double check your project's database import path
import { sendSystemAlert } from '../lib/services/notificationService';

async function runAuditCheck() {
  const today = new Date().toISOString();
  console.log('⚡ Running scheduled operational notification audit...');

  try {
    // 1. Check for High-Risk Safety Inspections (Risk Score >= 7.5)
    const highRisk = await databasePool.query(
      "SELECT * FROM inspections WHERE risk_score >= 7.5 AND created_at >= date('now', '-1 day')"
    );
    for (const insp of highRisk.rows) {
      await sendSystemAlert(
        `CRITICAL SAFETY RISK: ${insp.project_name || '123 Basement'}`,
        `<p><strong>Project:</strong> ${insp.project_name}</p><p><strong>Risk Rating:</strong> ${insp.risk_score}/10</p>`
      );
    }

    // 2. Check for Overdue Invoices
    const overdueInvoices = await databasePool.query(
      "SELECT * FROM invoices WHERE status = 'unpaid' AND due_date < ?", [today]
    );
    if (overdueInvoices.rows.length > 0) {
      let invoiceLines = overdueInvoices.rows.map(inv => `<li>Invoice <strong>#${inv.invoice_number}</strong>: $${inv.total_amount}</li>`).join('');
      await sendSystemAlert(`FINANCIAL ALERT: Overdue Balances Outstanding`, `<ul>${invoiceLines}</ul>`);
    }
  } catch (error) {
    console.error('CRON Audit Error:', error);
  }
}

runAuditCheck();