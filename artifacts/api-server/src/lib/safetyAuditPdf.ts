/**
 * Ministry-grade safety audit PDF builder.
 * Generates a single chronological, print-ready audit packet using PDFKit.
 * All records (forms, signoffs, logs, certifications, directives) are merged
 * into one timeline, sorted by date, then paginated with a continuous header.
 */
import PDFDocument from "pdfkit";

const PRIMARY: [number, number, number] = [212, 175, 55];
const DARK: [number, number, number] = [18, 18, 18];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY: [number, number, number] = [120, 120, 120];
const RED: [number, number, number] = [220, 38, 38];
const AMBER: [number, number, number] = [217, 119, 6];
const GREEN: [number, number, number] = [22, 163, 74];

/** A single item on the chronological audit timeline. */
export interface AuditTimelineItem {
  date: string;
  type: "form" | "signoff" | "log" | "certification" | "directive";
  title: string;
  description?: string;
  status?: string;
  urgency?: string;
  by?: string;
  color?: [number, number, number];
  extra?: string;
}

export interface SafetyAuditInput {
  companyName: string;
  projectName: string;
  projectLocation?: string | null;
  exportedAt: string;
  exportedBy: string;
  items: AuditTimelineItem[];
  summaryCounts: {
    forms: number;
    signoffs: number;
    logs: number;
    certifications: number;
    directives: number;
  };
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

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-CA", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const TYPE_LABEL: Record<string, string> = {
  form: "Safety Form",
  signoff: "Toolbox Signoff",
  log: "Daily Log",
  certification: "Certification",
  directive: "AI Directive",
};

const TYPE_BAR: Record<string, [number, number, number]> = {
  form: GREEN,
  signoff: PRIMARY,
  log: AMBER,
  certification: [100, 160, 200],
  directive: RED,
};

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

    function footer() {
      const bottom = doc.page.height - 30;
      doc.fillColor(GRAY).fontSize(8).font("Helvetica");
      doc.text(
        `${input.companyName} \u00b7 Ministry Audit Export \u00b7 ${input.projectName} \u00b7 Page ${pageNum}`,
        50, bottom, { width: doc.page.width - 100, align: "center" },
      );
    }

    // ── Cover page ─────────────────────────────────────────────
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
    doc.text("CONFIDENTIAL \u2014 FOR REGULATORY PURPOSES ONLY", 50, 400, { align: "center" });

    // Summary box
    const boxY = 450;
    const s = input.summaryCounts;
    doc.rect(100, boxY, doc.page.width - 200, 140).fillAndStroke([40, 35, 20], [212, 175, 55]);
    doc.fillColor(PRIMARY).fontSize(10).font("Helvetica-Bold");
    doc.text("DOCUMENT SUMMARY", 0, boxY + 14, { align: "center" });
    doc.fillColor(WHITE).fontSize(10).font("Helvetica");
    doc.text(`Safety Forms:       ${s.forms}`, 120, boxY + 34);
    doc.text(`Toolbox Signoffs:     ${s.signoffs}`, 120, boxY + 50);
    doc.text(`Daily Logs:           ${s.logs}`, 120, boxY + 66);
    doc.text(`Worker Certifications: ${s.certifications}`, 120, boxY + 82);
    doc.text(`AI Compliance Directives: ${s.directives}`, 120, boxY + 98);
    doc.text(`Total Records:        ${input.items.length}`, 120, boxY + 114);

    footer();

    // ── Chronological Timeline ──────────────────────────────────────
    addPage();
    header("Ministry Audit Export \u2014 Chronological Timeline");

    doc.fillColor(PRIMARY).fontSize(12).font("Helvetica-Bold");
    doc.text("CHRONOLOGICAL AUDIT TIMELINE", 50, doc.y);
    doc.moveDown(0.5);
    doc.fillColor(GRAY).fontSize(9).font("Helvetica");
    doc.text(`All records sorted by date (${input.items.length} total)`, 50, doc.y);
    doc.moveDown(0.8);

    if (input.items.length === 0) {
      doc.fillColor(GRAY).fontSize(10).font("Helvetica");
      doc.text("No audit records found for this project.", 50, doc.y);
    } else {
      let lastDate = "";
      for (const item of input.items) {
        if (doc.y > doc.page.height - 120) {
          addPage();
          header("Ministry Audit Export \u2014 Chronological Timeline (cont.)");
        }

        const barColor = item.color ?? TYPE_BAR[item.type] ?? GRAY;
        const itemDate = fmtDate(item.date);
        const itemTime = fmtDateTime(item.date);

        // Date divider
        if (itemDate !== lastDate) {
          doc.moveDown(0.4);
          doc.fillColor(PRIMARY).fontSize(9).font("Helvetica-Bold");
          doc.text(itemDate, 50, doc.y);
          doc.rect(50, doc.y + 2, doc.page.width - 100, 0.5).fill(PRIMARY);
          doc.moveDown(0.6);
          lastDate = itemDate;
        }

        const startY = doc.y;
        const rowHeight = 28;

        // Type bar
        doc.rect(50, startY, 4, rowHeight).fill(barColor);

        // Type label
        doc.fillColor(barColor).fontSize(8).font("Helvetica-Bold");
        doc.text(TYPE_LABEL[item.type] ?? item.type.toUpperCase(), 62, startY + 2);

        // Time + status
        doc.fillColor(GRAY).fontSize(8).font("Helvetica");
        const statusText = item.status ? ` \u00b7 ${item.status}` : "";
        const urgencyText = item.urgency ? ` \u00b7 ${item.urgency}` : "";
        doc.text(`${itemTime}${statusText}${urgencyText}`, 62, startY + 14);

        // Title
        doc.fillColor(WHITE).fontSize(9).font("Helvetica-Bold");
        const titleWidth = item.by
          ? doc.page.width - 230
          : doc.page.width - 180;
        doc.text(item.title, 180, startY + 2, { width: titleWidth });

        // Description
        if (item.description) {
          doc.fillColor(GRAY).fontSize(8).font("Helvetica");
          doc.text(item.description, 180, doc.y + 4, { width: doc.page.width - 230 });
        }

        // By
        if (item.by) {
          doc.fillColor(GRAY).fontSize(8).font("Helvetica");
          doc.text(`By: ${item.by}`, doc.page.width - 140, startY + 2, { width: 90, align: "right" });
        }

        // Extra
        if (item.extra) {
          doc.fillColor([100, 100, 100]).fontSize(7).font("Helvetica");
          doc.text(item.extra, 62, doc.y + 2, { width: doc.page.width - 114 });
        }

        doc.y = Math.max(doc.y, startY + rowHeight + 4);
        doc.rect(50, doc.y, doc.page.width - 100, 0.5).fill([50, 50, 50]);
        doc.y += 6;
      }
    }

    footer();
    doc.end();
  });
}
