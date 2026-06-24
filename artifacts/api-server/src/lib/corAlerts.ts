import { escapeHtml } from "./mailer.js";

export function buildCredentialExpiryHtml(opts: {
  workerName: string;
  credentialType: string;
  credentialLabel: string;
  expiryDate: string;
  daysRemaining: number;
  appUrl: string | null;
}): string {
  const { workerName, credentialLabel, expiryDate, daysRemaining, appUrl } = opts;

  const urgencyColor = daysRemaining <= 30 ? "#ef4444" : "#f59e0b";
  const urgencyLabel = daysRemaining <= 30 ? "ACTION REQUIRED — 30-Day Notice" : "Advance Notice — 60-Day Warning";

  const actionLink = appUrl
    ? `<p style="margin:24px 0 0;text-align:center;">
        <a href="${escapeHtml(appUrl)}/cor" style="display:inline-block;background:#C9A84C;color:#111111;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;">
          View Training Matrix
        </a>
      </p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Certification Expiry Alert</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111111;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#C9A84C;padding:20px 28px;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#111111;">
              Site Snap — COR Safety Compliance
            </p>
            <h1 style="margin:6px 0 0;font-size:20px;font-weight:800;color:#111111;">
              Certification Expiry Alert
            </h1>
          </td>
        </tr>

        <!-- Urgency banner -->
        <tr>
          <td style="background:${urgencyColor}1a;border-left:4px solid ${urgencyColor};padding:12px 28px;">
            <p style="margin:0;font-size:13px;font-weight:700;color:${urgencyColor};">${escapeHtml(urgencyLabel)}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:24px 28px;">
            <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">
              Hi <strong style="color:#ffffff;">${escapeHtml(workerName)}</strong>,
            </p>
            <p style="margin:0 0 20px;font-size:15px;color:#a1a1aa;line-height:1.6;">
              Your <strong style="color:#ffffff;">${escapeHtml(credentialLabel)}</strong> certification
              is expiring in <strong style="color:${urgencyColor};">${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}</strong>.
              Please take action to renew before it lapses to maintain your eligibility for site work.
            </p>

            <!-- Detail card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a;">
              <tr>
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#71717a;width:50%;">Certification</td>
                      <td style="padding:6px 0;font-size:13px;font-weight:600;color:#e5e5e5;text-align:right;">${escapeHtml(credentialLabel)}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#71717a;">Expiry Date</td>
                      <td style="padding:6px 0;font-size:13px;font-weight:600;color:#e5e5e5;text-align:right;">${escapeHtml(expiryDate)}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#71717a;">Days Remaining</td>
                      <td style="padding:6px 0;font-size:14px;font-weight:800;color:${urgencyColor};text-align:right;">${daysRemaining}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            ${actionLink}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #1f1f1f;">
            <p style="margin:0;font-size:11px;color:#52525b;text-align:center;">
              This alert was sent automatically by the Site Snap COR Compliance module.<br>
              Safety managers and the worker are both notified at 60-day and 30-day intervals.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
