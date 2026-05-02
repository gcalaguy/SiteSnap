import type { DigestPayload, ProjectDigest } from "./digest.js";

const PRIMARY = "#FF6600";
const SIDEBAR = "#172034";
const MUTED = "#6B7280";

function statusLabel(status: string): string {
  return { open: "Open", in_review: "In Review", resolved: "Resolved", closed: "Closed" }[status] ?? status;
}

function statusColor(status: string): string {
  return { open: "#F59E0B", in_review: "#3B82F6", resolved: "#22C55E", closed: "#6B7280" }[status] ?? MUTED;
}

function priorityColor(priority: string): string {
  return { high: "#EF4444", medium: "#F59E0B", low: "#6B7280" }[priority] ?? MUTED;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statBox(value: number, label: string, color: string): string {
  return `
    <td style="text-align:center;padding:16px 24px;background:#F9FAFB;border-radius:8px;border:1px solid #E5E7EB;">
      <div style="font-size:28px;font-weight:700;color:${color};line-height:1;">${value}</div>
      <div style="font-size:12px;color:${MUTED};margin-top:4px;font-weight:500;">${label}</div>
    </td>`;
}

function projectSection(project: ProjectDigest): string {
  let html = `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
    <tr>
      <td style="padding:14px 20px;background:${SIDEBAR};border-radius:8px 8px 0 0;">
        <span style="font-size:15px;font-weight:700;color:#FFFFFF;">${project.name}</span>
      </td>
    </tr>
    <tr>
      <td style="background:#FFFFFF;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;padding:16px 20px;">`;

  // New Reports
  if (project.newReports.length > 0) {
    html += `<p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin:0 0 8px 0;">
      📋 Daily Reports (${project.newReports.length})
    </p>`;
    for (const r of project.newReports) {
      html += `
      <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #F3F4F6;">
        <div style="width:60px;background:#FFF7ED;border-radius:6px;padding:6px;text-align:center;flex-shrink:0;">
          <div style="font-size:11px;font-weight:600;color:${PRIMARY};">${formatDate(r.reportDate)}</div>
        </div>
        <div style="font-size:13px;color:#374151;line-height:1.5;">${r.workPerformed}</div>
      </div>`;
    }
    html += `<div style="height:16px;"></div>`;
  }

  // Open RFIs
  if (project.openRFIs.length > 0) {
    html += `<p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin:0 0 8px 0;">
      ⚠️ Open RFIs (${project.openRFIs.length})
    </p>`;
    for (const r of project.openRFIs) {
      const sColor = statusColor(r.status);
      html += `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #F3F4F6;">
        <div style="background:#FFF7ED;border-radius:6px;padding:4px 8px;flex-shrink:0;">
          <span style="font-size:12px;font-weight:700;color:${PRIMARY};">${r.rfiNumber}</span>
        </div>
        <div style="flex:1;">
          <div style="font-size:13px;color:#374151;font-weight:500;">${r.subject}</div>
          <div style="margin-top:4px;display:flex;gap:8px;align-items:center;">
            <span style="font-size:11px;font-weight:600;color:${sColor};background:${sColor}20;padding:2px 8px;border-radius:10px;">${statusLabel(r.status)}</span>
            ${r.isOverdue ? `<span style="font-size:11px;font-weight:600;color:#EF4444;">⚡ Overdue</span>` : ""}
            ${r.dueDate ? `<span style="font-size:11px;color:${MUTED};">Due ${formatDate(r.dueDate)}</span>` : ""}
          </div>
        </div>
      </div>`;
    }
    html += `<div style="height:16px;"></div>`;
  }

  // Overdue Tasks
  if (project.overdueTasks.length > 0) {
    html += `<p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin:0 0 8px 0;">
      🔴 Overdue Tasks (${project.overdueTasks.length})
    </p>`;
    for (const t of project.overdueTasks) {
      const pColor = priorityColor(t.priority);
      html += `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #F3F4F6;">
        <div style="width:8px;height:8px;border-radius:50%;background:${pColor};flex-shrink:0;"></div>
        <div style="flex:1;font-size:13px;color:#374151;">${t.title}</div>
        <div style="font-size:11px;color:#EF4444;font-weight:500;">Due ${formatDate(t.dueDate)}</div>
      </div>`;
    }
  }

  html += `</td></tr></table>`;
  return html;
}

export function buildDigestHtml(payload: DigestPayload): string {
  const { totals, projects, companyName, date } = payload;
  const hasContent =
    totals.reports > 0 || totals.openRFIs > 0 || totals.overdueTasks > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Site Snap Daily Digest</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:${SIDEBAR};border-radius:12px 12px 0 0;padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:22px;font-weight:700;color:#FFFFFF;">🏗 Site Snap</div>
                    <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-top:2px;">Daily Summary Digest</div>
                  </td>
                  <td align="right">
                    <div style="font-size:13px;color:rgba(255,255,255,0.7);">${date}</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;">${companyName}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Summary stats -->
          <tr>
            <td style="background:#FFFFFF;padding:24px 32px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:8px;">${statBox(totals.reports, "Reports Yesterday", PRIMARY)}</td>
                  <td style="padding:0 4px;">${statBox(totals.openRFIs, "Open RFIs", "#F59E0B")}</td>
                  <td style="padding-left:8px;">${statBox(totals.overdueTasks, "Overdue Tasks", "#EF4444")}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#FFFFFF;padding:8px 32px 32px;">
              ${
                !hasContent
                  ? `<div style="text-align:center;padding:32px;color:${MUTED};">
                      <div style="font-size:40px;">✅</div>
                      <div style="font-size:15px;margin-top:8px;font-weight:600;color:#374151;">All caught up!</div>
                      <div style="font-size:13px;margin-top:4px;">No reports, open RFIs, or overdue tasks today.</div>
                    </div>`
                  : projects.map(projectSection).join("")
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F9FAFB;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
              <p style="font-size:12px;color:${MUTED};margin:0;">
                This digest is sent daily at 7:00 AM ET to owners and foremans in your Site Snap workspace.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
