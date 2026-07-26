/**
 * Branded AI Safety Scanner PDF report builder (PDFKit).
 * Generated instantly on scan submission — header/GPS/compliance summary,
 * PPE checklist, hazard findings with photos, corrective action log, and an
 * inspector/foreman e-signature block. Structured to satisfy OHS/COR audit
 * documentation requirements.
 */
import PDFDocument from "pdfkit";
import type { SafetyScanWithHazards } from "../repositories/safetyScan";

const DARK: [number, number, number] = [18, 18, 18];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY: [number, number, number] = [120, 120, 120];
const RED: [number, number, number] = [220, 38, 38];
const AMBER: [number, number, number] = [217, 119, 6];
const YELLOW: [number, number, number] = [202, 138, 4];
const GREEN: [number, number, number] = [22, 163, 74];
const BLUE: [number, number, number] = [37, 99, 235];

const RISK_COLOR: Record<string, [number, number, number]> = {
  critical: RED,
  high: AMBER,
  medium: YELLOW,
  low: GREEN,
};

export interface SafetyScanPdfCapaRow {
  title: string;
  assignedToName: string | null;
  priority: string;
  dueDate: string | null;
  status: string;
}

export interface SafetyScanPdfInput {
  companyName: string;
  companyLogoBuffer?: Buffer | null;
  projectName: string;
  inspectorName: string;
  scan: SafetyScanWithHazards;
  photoBuffers: Buffer[]; // aligned with scan.photoObjectPaths
  capaRows: SafetyScanPdfCapaRow[];
  foremanName?: string | null;
}

function fmtDateTime(d: Date | string): string {
  try {
    return new Date(d).toLocaleString("en-CA", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(d);
  }
}

export function buildSafetyScanPdfBuffer(input: SafetyScanPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { scan } = input;
    const riskColor = RISK_COLOR[scan.riskLevel ?? "low"] ?? GRAY;

    let pageNum = 0;
    function addPage() {
      if (pageNum > 0) doc.addPage();
      pageNum++;
    }

    function footer() {
      const bottom = doc.page.height - 30;
      doc.fillColor(GRAY).fontSize(8).font("Helvetica");
      doc.text(
        `${input.companyName} · AI Safety Scan Report · ${input.projectName} · Page ${pageNum}`,
        50, bottom, { width: doc.page.width - 100, align: "center" },
      );
    }

    function header() {
      doc.rect(0, 0, doc.page.width, 80).fill(DARK);
      if (input.companyLogoBuffer) {
        try {
          doc.image(input.companyLogoBuffer, 50, 16, { height: 40, fit: [120, 40] });
        } catch {
          // Corrupt/unsupported logo format — fall back to text-only header.
        }
      }
      doc.fillColor(WHITE).fontSize(16).font("Helvetica-Bold");
      doc.text(input.companyName, input.companyLogoBuffer ? 185 : 50, 24);
      doc.fillColor(GRAY).fontSize(9).font("Helvetica");
      doc.text("AI Safety Scanner — Site Inspection Report", input.companyLogoBuffer ? 185 : 50, 46);

      const right = doc.page.width - 50;
      doc.fillColor(GRAY).fontSize(8).font("Helvetica");
      doc.text(`Project: ${input.projectName}`, 0, 16, { width: right, align: "right" });
      doc.text(`Location: ${scan.siteAddress ?? "—"}`, 0, 28, { width: right, align: "right" });
      doc.text(`Inspector: ${input.inspectorName}`, 0, 40, { width: right, align: "right" });
      doc.text(`Date: ${fmtDateTime(scan.gpsCapturedAt)}`, 0, 52, { width: right, align: "right" });
      doc.text(
        scan.gpsLat != null && scan.gpsLng != null ? `GPS: ${scan.gpsLat}, ${scan.gpsLng}` : "GPS: Not available",
        0,
        64,
        { width: right, align: "right" },
      );
      doc.y = 96;
    }

    // ── Page 1: Summary ──────────────────────────────────────────
    addPage();
    header();

    // Compliance score badge + risk level pill
    const scoreBoxY = doc.y;
    doc.roundedRect(50, scoreBoxY, 160, 70, 6).fillAndStroke([245, 245, 245], [220, 220, 220]);
    doc.fillColor(GRAY).fontSize(9).font("Helvetica-Bold").text("COMPLIANCE SCORE", 65, scoreBoxY + 12);
    doc.fillColor(DARK).fontSize(28).font("Helvetica-Bold").text(`${scan.complianceScore ?? 0}%`, 65, scoreBoxY + 28);

    doc.roundedRect(225, scoreBoxY, 160, 70, 6).fillAndStroke(riskColor.map((c) => Math.min(255, c + 200 - c * 0.6)) as any, riskColor);
    doc.fillColor(riskColor).fontSize(9).font("Helvetica-Bold").text("RISK LEVEL", 240, scoreBoxY + 12);
    doc.fillColor(riskColor).fontSize(20).font("Helvetica-Bold").text((scan.riskLevel ?? "low").toUpperCase(), 240, scoreBoxY + 32);

    doc.y = scoreBoxY + 90;
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("AI SUMMARY", 50, doc.y);
    doc.moveDown(0.3);
    doc.fillColor([60, 60, 60]).fontSize(10).font("Helvetica").text(scan.summary ?? "No summary available.", 50, doc.y, { width: doc.page.width - 100 });
    doc.moveDown(1);

    // PPE compliance grid
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("PPE COMPLIANCE", 50, doc.y);
    doc.moveDown(0.4);
    const ppeItems = (Array.isArray(scan.ppeDetected) ? scan.ppeDetected : []) as Array<{ item: string; present: boolean }>;
    const colWidth = (doc.page.width - 100) / 2;
    ppeItems.forEach((p, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 50 + col * colWidth;
      const y = doc.y + row * 18;
      const color = p.present ? GREEN : RED;
      doc.circle(x + 5, y + 6, 4).fill(color);
      doc.fillColor(DARK).fontSize(9).font("Helvetica").text(`${p.item} — ${p.present ? "Present" : "Missing"}`, x + 16, y);
    });
    doc.y += Math.ceil(ppeItems.length / 2) * 18 + 12;

    footer();

    // ── Detailed findings ─────────────────────────────────────────
    addPage();
    header();
    doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text("DETAILED FINDINGS", 50, doc.y);
    doc.moveDown(0.5);

    if (scan.hazards.length === 0) {
      doc.fillColor(GRAY).fontSize(10).font("Helvetica").text("No hazards identified in this scan.", 50, doc.y);
    } else {
      for (const hazard of scan.hazards) {
        if (doc.y > doc.page.height - 160) {
          addPage();
          header();
        }
        const hColor = RISK_COLOR[hazard.severity] ?? GRAY;
        const photoIdx = input.scan.photoObjectPaths
          ? (input.scan.photoObjectPaths as string[]).indexOf(hazard.sourcePhotoObjectPath ?? "")
          : -1;
        const photoBuf = photoIdx >= 0 ? input.photoBuffers[photoIdx] : undefined;

        const startY = doc.y;
        if (photoBuf) {
          try {
            doc.image(photoBuf, 50, startY, { width: 110, height: 82, fit: [110, 82] });
            if (hazard.boundingArea) {
              doc.lineWidth(2).rect(50, startY, 110, 82).stroke(hColor);
            }
          } catch {
            // Unsupported/corrupt image — skip inline thumbnail, findings text still renders.
          }
        }

        const textX = photoBuf ? 172 : 50;
        const textWidth = photoBuf ? doc.page.width - 222 : doc.page.width - 100;

        doc.rect(textX - 8, startY, 4, 82).fill(hColor);
        doc.fillColor(hColor).fontSize(9).font("Helvetica-Bold").text(hazard.severity.toUpperCase(), textX, startY);
        doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text(hazard.title, textX, startY + 14, { width: textWidth });
        doc.fillColor([60, 60, 60]).fontSize(9).font("Helvetica").text(hazard.description, textX, doc.y + 2, { width: textWidth });
        if (hazard.remediation) {
          doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("Remediation: ", textX, doc.y + 4, { continued: true, width: textWidth });
          doc.fillColor([60, 60, 60]).font("Helvetica").text(hazard.remediation, { width: textWidth });
        }

        doc.y = Math.max(doc.y, startY + 82) + 14;
        doc.rect(50, doc.y, doc.page.width - 100, 0.5).fill([230, 230, 230]);
        doc.y += 10;
      }
    }
    footer();

    // ── Corrective action log ───────────────────────────────────────
    addPage();
    header();
    doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text("CORRECTIVE ACTION LOG", 50, doc.y);
    doc.moveDown(0.5);

    if (input.capaRows.length === 0) {
      doc.fillColor(GRAY).fontSize(10).font("Helvetica").text("No corrective actions have been created for this scan yet.", 50, doc.y);
    } else {
      const colX = { title: 50, assignee: 260, priority: 360, due: 420, status: 480 };
      doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold");
      doc.text("ACTION", colX.title, doc.y);
      doc.text("ASSIGNEE", colX.assignee, doc.y);
      doc.text("PRIORITY", colX.priority, doc.y);
      doc.text("DUE", colX.due, doc.y);
      doc.text("STATUS", colX.status, doc.y);
      doc.moveDown(0.6);
      doc.rect(50, doc.y, doc.page.width - 100, 0.5).fill([200, 200, 200]);
      doc.moveDown(0.4);

      for (const row of input.capaRows) {
        if (doc.y > doc.page.height - 100) {
          addPage();
          header();
        }
        const y = doc.y;
        doc.fillColor(DARK).fontSize(8).font("Helvetica").text(row.title, colX.title, y, { width: 200 });
        doc.text(row.assignedToName ?? "Unassigned", colX.assignee, y, { width: 90 });
        doc.text(row.priority, colX.priority, y, { width: 50 });
        doc.text(row.dueDate ?? "—", colX.due, y, { width: 55 });
        doc.text(row.status, colX.status, y, { width: 70 });
        doc.moveDown(1);
      }
    }
    footer();

    // ── Sign-off ───────────────────────────────────────────────────
    addPage();
    header();
    doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text("SIGN-OFF", 50, doc.y);
    doc.moveDown(0.5);
    doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(
      "This report satisfies OHS/COR audit documentation criteria. Digital signatures below confirm review and acknowledgment of the findings in this report.",
      50, doc.y, { width: doc.page.width - 100 },
    );
    doc.moveDown(1.5);

    function signatureBlock(label: string, name: string | null, sigData: string | null | undefined, signedAt: Date | string | null | undefined, x: number) {
      const boxWidth = (doc.page.width - 130) / 2;
      doc.fillColor(GRAY).fontSize(9).font("Helvetica-Bold").text(label, x, doc.y);
      const boxY = doc.y + 16;
      doc.rect(x, boxY, boxWidth, 70).stroke([200, 200, 200]);
      if (sigData) {
        try {
          const base64 = sigData.includes(",") ? sigData.split(",")[1]! : sigData;
          doc.image(Buffer.from(base64, "base64"), x + 8, boxY + 8, { fit: [boxWidth - 16, 54] });
        } catch {
          doc.fillColor(GRAY).fontSize(8).font("Helvetica-Oblique").text("(signature on file)", x + 8, boxY + 28);
        }
      } else {
        doc.fillColor([180, 180, 180]).fontSize(8).font("Helvetica-Oblique").text("Not yet signed", x + 8, boxY + 28);
      }
      doc.fillColor(DARK).fontSize(8).font("Helvetica").text(
        name ? `${name}${signedAt ? ` · ${fmtDateTime(signedAt)}` : ""}` : "—",
        x, boxY + 76,
      );
    }

    const blockY = doc.y;
    signatureBlock("INSPECTOR SIGN-OFF", input.inspectorName, scan.inspectorSignatureData, scan.inspectorSignedAt, 50);
    doc.y = blockY;
    signatureBlock("FOREMAN ACKNOWLEDGMENT", input.foremanName ?? null, scan.foremanSignatureData, scan.foremanSignedAt, 50 + (doc.page.width - 130) / 2 + 30);

    footer();
    doc.end();
  });
}
