/**
 * Ministry-grade safety audit PDF builder.
 * Generates a chronological, print-ready audit packet using PDFKit.
 * Pattern follows invoicePdf.ts.
 */
import PDFDocument from "pdfkit";

const PRIMARY: [number, number, number] = [212, 175, 55];
const DARK: [number, number, number] = [18, 18, 18];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY: [number, number, number] = [120, 120, 120];
const LIGHT: [number, number, number] = [245, 245, 245];
const RED: [number, number, number] = [220, 38, 38];
const AMBER: [number, number, number] = [217, 119, 6];
const GREEN: [number, number, number] = [22, 163, 74];

export interface AuditSubmission {
  id: number;
  templateName: string;
  category: string;
  submittedBy: string;
  status: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  aiSummary?: string | null;
  createdAt: string;
  data: Record<string, unknown>;
}

export interface AuditCertification {
  workerName: string;
  documentType: string;
  status: string;
  expirationDate?: string | null;
  fileUrl?: string | null;
  uploadedAt: string;
}

export interface AuditDirective {
  targetFormId: string;
  urgency: string;
  workerDirective: string;
  status: string;
  confidenceScore: number;
  createdAt: string;
}

export interface SafetyAuditInput {
  companyName: string;
  projectName: string;
  projectLocation?: string | null;
  exportedAt: string;
  exportedBy: string;
  submissions: AuditSubmission[];
  certifications: AuditCertification[];
  directives: AuditDirective[];
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-CA", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return iso;
  }
}

function statusColor(s: string): [number, number, number] {
  if (s === "approved") return GREEN;
  if (s === "submitted" || s === "reviewed") return AMBER;
  return GRAY;
}

export function buildSafetyAuditPdfBuffer(input: SafetyAuditInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let pageNum = 0;

    function addPage() {
      if (pageNum > 0) doc.addPage();
      pageNum++;
    }

    function header(title: string) {
      doc.rect(0, 0, doc.page.width, 72).fill(DARK);
      doc.fillColor(PRIMARY).fontSize(18).font("Helvetica-Bold");
      doc.text(input.companyName, 50, 20);
      doc.fillColor(WHITE).fontSize(10).font("Helvetica");
      doc.text(title, 50, 44);

      const right = doc.page.width - 50;
      doc.fillColor(GRAY).fontSize(9).font("Helvetica");
      doc.text(`Exported: ${input.exportedAt}`, 0, 22, { width: right, align: "right" });
      doc.text(`By: ${input.exportedBy}`, 0, 36, { width: right, align: "right" });
      doc.y = 90;
    }

    function sectionTitle(label: string) {
      doc.moveDown(0.5);
      doc.rect(50, doc.y, doc.page.width - 100, 22).fill(PRIMARY);
      doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold");
      doc.text(label.toUpperCase(), 58, doc.y - 16, { width: doc.page.width - 116 });
      doc.moveDown(0.8);
    }

    function footer() {
      const bottom = doc.page.height - 30;
      doc.fillColor(GRAY).fontSize(8).font("Helvetica");
      doc.text(
        `${input.companyName} · Ministry Audit Export · ${input.projectName} · Page ${pageNum}`,
        50, bottom, { width: doc.page.width - 100, align: "center" },
      );
    }

    // ── Cover page ──────────────────────────────────────────────────────────────
    addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(DARK);
    doc.rect(0, 0, doc.page.width, 8).fill(PRIMARY);

    doc.fillColor(PRIMARY).fontSize(32).font("Helvetica-Bold");
    doc.text("MINISTRY AUDIT", 50, 140, { align: "center" });
    doc.text("EXPORT PACKET", 50, 178, { align: "center" });

    doc.fillColor(WHITE).fontSize(14).font("Helvetica");
    doc.text(input.projectName, 50, 240, { align: "center" });

    if (input.projectLocation) {
      doc.fillColor(GRAY).fontSize(11).font("Helvetica");
      doc.text(input.projectLocation, 50, 262, { align: "center" });
    }

    doc.fillColor(GRAY).fontSize(10).font("Helvetica");
    doc.text(`Compiled: ${input.exportedAt}`, 50, 310, { align: "center" });
    doc.text(`Prepared by: ${input.exportedBy}`, 50, 326, { align: "center" });
    doc.text(input.companyName, 50, 342, { align: "center" });

    doc.rect(50, 390, doc.page.width - 100, 1).fill(AMBER);
    doc.fillColor(AMBER).fontSize(9).font("Helvetica-Bold");
    doc.text("CONFIDENTIAL — FOR REGULATORY PURPOSES ONLY", 50, 400, { align: "center" });

    // Summary box
    const boxY = 450;
    doc.rect(100, boxY, doc.page.width - 200, 120).fillAndStroke([40, 35, 20], [212, 175, 55]);
    doc.fillColor(PRIMARY).fontSize(10).font("Helvetica-Bold");
    doc.text("DOCUMENT SUMMARY", 0, boxY + 14, { align: "center" });
    doc.fillColor(WHITE).fontSize(10).font("Helvetica");
    doc.text(`Safety Form Submissions: ${input.submissions.length}`, 120, boxY + 34);
    doc.text(`Worker Certifications:   ${input.certifications.length}`, 120, boxY + 50);
    doc.text(`Compliance Directives:   ${input.directives.length}`, 120, boxY + 66);

    footer();

    // ── Section 1: Safety Form Submissions ─────────────────────────────────────
    addPage();
    header("Ministry Audit Export — Safety Form Submissions");
    sectionTitle(`Section 1 — Safety Form Submissions (${input.submissions.length})`);

    if (input.submissions.length === 0) {
      doc.fillColor(GRAY).fontSize(10).font("Helvetica").text("No safety form submissions recorded.", 50, doc.y);
    } else {
      for (const sub of input.submissions) {
        if (doc.y > doc.page.height - 160) {
          addPage();
          header("Ministry Audit Export — Safety Form Submissions (cont.)");
        }

        const startY = doc.y;
        const sc = statusColor(sub.status);

        doc.rect(50, startY, doc.page.width - 100, 14).fill([30, 30, 30]);
        doc.fillColor(PRIMARY).fontSize(9).font("Helvetica-Bold");
        doc.text(`${sub.templateName}  ·  ${sub.category.toUpperCase()}  ·  ${fmtDate(sub.createdAt)}`, 56, startY + 3);

        const scLabel = sub.status.charAt(0).toUpperCase() + sub.status.slice(1);
        doc.fillColor(sc).text(scLabel, 0, startY + 3, { width: doc.page.width - 56, align: "right" });

        doc.y = startY + 18;

        doc.fillColor(GRAY).fontSize(8).font("Helvetica");
        doc.text(`Submitted by: ${sub.submittedBy}`, 56, doc.y);

        if (sub.reviewedBy) {
          doc.y += 10;
          doc.fillColor(GREEN).text(`Reviewed by: ${sub.reviewedBy}  ·  ${sub.reviewedAt ? fmtDate(sub.reviewedAt) : ""}`, 56, doc.y);
          if (sub.reviewNotes) {
            doc.y += 10;
            doc.fillColor(GRAY).text(`Review Notes: ${sub.reviewNotes}`, 56, doc.y, { width: doc.page.width - 112 });
          }
        }

        if (sub.aiSummary) {
          doc.y += 10;
          doc.fillColor([180, 140, 40]).font("Helvetica-Bold").fontSize(8).text("AI Summary:", 56, doc.y);
          doc.y += 10;
          doc.fillColor(GRAY).font("Helvetica").fontSize(8);
          doc.text(sub.aiSummary.slice(0, 400), 56, doc.y, { width: doc.page.width - 112 });
        }

        doc.y += 14;
        doc.rect(50, doc.y, doc.page.width - 100, 0.5).fill([60, 60, 60]);
        doc.y += 8;
      }
    }

    footer();

    // ── Section 2: Worker Certifications ───────────────────────────────────────
    addPage();
    header("Ministry Audit Export — Worker Certifications");
    sectionTitle(`Section 2 — Worker Certifications (${input.certifications.length})`);

    if (input.certifications.length === 0) {
      doc.fillColor(GRAY).fontSize(10).font("Helvetica").text("No certifications on file.", 50, doc.y);
    } else {
      const cols = [50, 180, 320, 430, 520];
      const headers = ["Worker", "Certification", "Expiry", "Status", "Uploaded"];

      doc.rect(50, doc.y, doc.page.width - 100, 16).fill([30, 30, 30]);
      doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold");
      headers.forEach((h, i) => doc.text(h, cols[i] + 4, doc.y - 13, { width: (cols[i + 1] ?? 570) - cols[i] - 6 }));
      doc.y += 4;

      for (const cert of input.certifications) {
        if (doc.y > doc.page.height - 80) {
          addPage();
          header("Ministry Audit Export — Worker Certifications (cont.)");
        }
        const rowY = doc.y;
        const expired = cert.status === "expired";
        const color: [number, number, number] = expired ? RED : cert.status === "active" ? GREEN : GRAY;

        doc.fillColor(WHITE).fontSize(8).font("Helvetica");
        doc.text(cert.workerName, cols[0] + 4, rowY, { width: 120 });
        doc.text(cert.documentType, cols[1] + 4, rowY, { width: 134 });
        doc.text(cert.expirationDate ? fmtDate(cert.expirationDate) : "—", cols[2] + 4, rowY, { width: 104 });
        doc.fillColor(color).text(cert.status, cols[3] + 4, rowY, { width: 84 });
        doc.fillColor(WHITE).text(fmtDate(cert.uploadedAt), cols[4] + 4, rowY, { width: 60 });

        doc.y = rowY + 14;
        doc.rect(50, doc.y, doc.page.width - 100, 0.5).fill([40, 40, 40]);
        doc.y += 2;
      }
    }

    footer();

    // ── Section 3: AI Compliance Directive History ─────────────────────────────
    addPage();
    header("Ministry Audit Export — AI Compliance Directives");
    sectionTitle(`Section 3 — AI Compliance Directives (${input.directives.length})`);

    if (input.directives.length === 0) {
      doc.fillColor(GRAY).fontSize(10).font("Helvetica").text("No compliance directives recorded.", 50, doc.y);
    } else {
      for (const d of input.directives) {
        if (doc.y > doc.page.height - 100) {
          addPage();
          header("Ministry Audit Export — AI Compliance Directives (cont.)");
        }

        const uc = d.urgency === "HIGH" ? RED : d.urgency === "MEDIUM" ? AMBER : GREEN;
        const startY = doc.y;

        doc.rect(50, startY, 4, 30).fill(uc);
        doc.fillColor(uc).fontSize(8).font("Helvetica-Bold");
        doc.text(`${d.urgency}  ·  ${d.targetFormId.replace(/_/g, " ").toUpperCase()}  ·  ${fmtDate(d.createdAt)}`, 62, startY + 2);

        doc.fillColor(GRAY).fontSize(8).font("Helvetica");
        doc.text(d.workerDirective, 62, startY + 14, { width: doc.page.width - 114 });

        doc.fillColor([100, 100, 100]).fontSize(7);
        const sc = d.status === "COMPLETED" ? GREEN : d.status === "DISMISSED" ? GRAY : d.status === "SUPERSEDED" ? GRAY : AMBER;
        doc.fillColor(sc).text(`Status: ${d.status}  ·  Confidence: ${d.confidenceScore}%`, 62, doc.y + 2);

        doc.y += 14;
        doc.rect(50, doc.y, doc.page.width - 100, 0.5).fill([60, 60, 60]);
        doc.y += 8;
      }
    }

    footer();
    doc.end();
  });
}
