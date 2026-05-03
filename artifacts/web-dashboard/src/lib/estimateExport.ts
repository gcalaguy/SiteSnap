import { format } from "date-fns";

type MaterialLine = { item: string; quantity: number; unit: string; unitCost: number; total: number };
type LaborLine = { trade: string; hours: number; hourlyRate: number; total: number };
type EquipmentLine = { item: string; days: number; dayRate: number; total: number };

type EstimateResult = {
  title?: string;
  summary?: string;
  materials?: MaterialLine[];
  labor?: LaborLine[];
  equipment?: EquipmentLine[];
  subtotal?: number;
  contingencyPct?: number;
  contingency?: number;
  totalLow?: number;
  totalHigh?: number;
  assumptions?: string[];
  notes?: string;
};

type Estimate = {
  id: number;
  title: string;
  scopeText: string | null;
  sourceType: string;
  sourceFilename: string | null;
  result: EstimateResult | null;
  status: string;
  createdAt: string;
};

export type CompanyInfo = {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  website?: string;
  hstNumber?: string;
};

function cad(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function sumLines(lines: { total: number }[] | undefined) {
  return (lines ?? []).reduce((s, l) => s + (l.total ?? 0), 0);
}

// ── PDF Export ────────────────────────────────────────────────────────────────

export async function downloadEstimatePDF(estimate: Estimate, open = false, logoDataUrl?: string, companyInfo?: CompanyInfo) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const r = estimate.result ?? {};
  const materialsTotal = sumLines(r.materials);
  const laborTotal = sumLines(r.labor);
  const equipmentTotal = sumLines(r.equipment);
  const subtotal = r.subtotal ?? (materialsTotal + laborTotal + equipmentTotal);
  const contingency = r.contingency ?? Math.round(subtotal * ((r.contingencyPct ?? 10) / 100));
  const totalLow = r.totalLow ?? subtotal;
  const totalHigh = r.totalHigh ?? (subtotal + contingency);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(23, 32, 52); // #172034
  doc.rect(0, 0, pageW, 28, "F");

  let logoRendered = false;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, margin, 3, 44, 22);
      logoRendered = true;
    } catch {
      logoRendered = false;
    }
  }

  if (!logoRendered) {
    doc.setTextColor(255, 102, 0);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("SITE SNAP", margin, 12);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("AI Estimating Engine", margin, 18);
  }

  // Company name right-aligned in header
  if (companyInfo?.name) {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(companyInfo.name, pageW - margin, 10, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(180, 200, 220);
    doc.text(format(new Date(estimate.createdAt), "MMMM d, yyyy"), pageW - margin, 18, { align: "right" });
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(format(new Date(estimate.createdAt), "MMMM d, yyyy"), pageW - margin, 18, { align: "right" });
  }

  // ── Company info bar ─────────────────────────────────────────────────────────
  let y = 28;
  const hasCompanyInfo = companyInfo && (companyInfo.address || companyInfo.phone || companyInfo.website || companyInfo.hstNumber || companyInfo.city);
  if (hasCompanyInfo) {
    doc.setFillColor(240, 242, 246);
    doc.rect(0, y, pageW, 9, "F");
    const parts: string[] = [];
    if (companyInfo.address) parts.push(companyInfo.address);
    const cityProv = [companyInfo.city, companyInfo.province].filter(Boolean).join(", ");
    if (cityProv) parts.push(cityProv);
    if (companyInfo.phone) parts.push(companyInfo.phone);
    if (companyInfo.website) parts.push(companyInfo.website);
    if (companyInfo.hstNumber) parts.push(`HST# ${companyInfo.hstNumber}`);
    doc.setTextColor(80, 90, 110);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(parts.join("   ·   "), margin, y + 6);
    y = 42;
  } else {
    y = 38;
  }

  // ── Title ───────────────────────────────────────────────────────────────────
  doc.setTextColor(23, 32, 52);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(estimate.title, contentW);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7 + 2;

  if (estimate.sourceFilename) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120, 120, 120);
    doc.text(`Source: ${estimate.sourceFilename}`, margin, y);
    y += 6;
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (r.summary) {
    y += 2;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const summaryLines = doc.splitTextToSize(r.summary, contentW);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 5 + 6;
  }

  // ── Cost Summary Banner ──────────────────────────────────────────────────────
  doc.setFillColor(23, 32, 52);
  doc.roundedRect(margin, y, contentW, 22, 3, 3, "F");
  doc.setTextColor(255, 102, 0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("ESTIMATED TOTAL (CAD)", margin + 6, y + 8);
  doc.setFontSize(16);
  doc.text(`${cad(totalLow)} – ${cad(totalHigh)}`, margin + 6, y + 17);
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Subtotal: ${cad(subtotal)}   Contingency (${r.contingencyPct ?? 10}%): ${cad(contingency)}   excl. HST/GST`, pageW - margin - 2, y + 12, { align: "right" });
  y += 28;

  // ── Materials Table ──────────────────────────────────────────────────────────
  if ((r.materials ?? []).length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(23, 32, 52);
    doc.text("Materials", margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Item", "Qty", "Unit", "Unit Cost", "Total"]],
      body: r.materials!.map((m) => [m.item, m.quantity, m.unit, cad(m.unitCost), cad(m.total)]),
      foot: [["", "", "", "Subtotal", cad(materialsTotal)]],
      headStyles: { fillColor: [255, 102, 0], textColor: 255, fontStyle: "bold", fontSize: 8 },
      footStyles: { fillColor: [245, 245, 245], textColor: [23, 32, 52], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
      columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      tableLineColor: [220, 220, 220],
      tableLineWidth: 0.2,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Labour Table ─────────────────────────────────────────────────────────────
  if ((r.labor ?? []).length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(23, 32, 52);
    doc.text("Labour", margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Trade / Role", "Hours", "Rate/hr", "Total"]],
      body: r.labor!.map((l) => [l.trade, l.hours, cad(l.hourlyRate), cad(l.total)]),
      foot: [["", "", "Subtotal", cad(laborTotal)]],
      headStyles: { fillColor: [30, 80, 160], textColor: 255, fontStyle: "bold", fontSize: 8 },
      footStyles: { fillColor: [245, 245, 245], textColor: [23, 32, 52], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
      columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      tableLineColor: [220, 220, 220],
      tableLineWidth: 0.2,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Equipment Table ──────────────────────────────────────────────────────────
  if ((r.equipment ?? []).length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(23, 32, 52);
    doc.text("Equipment", margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Equipment", "Days", "Day Rate", "Total"]],
      body: r.equipment!.map((e) => [e.item, e.days, cad(e.dayRate), cad(e.total)]),
      foot: [["", "", "Subtotal", cad(equipmentTotal)]],
      headStyles: { fillColor: [180, 100, 0], textColor: 255, fontStyle: "bold", fontSize: 8 },
      footStyles: { fillColor: [245, 245, 245], textColor: [23, 32, 52], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
      columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      tableLineColor: [220, 220, 220],
      tableLineWidth: 0.2,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Assumptions & Notes ──────────────────────────────────────────────────────
  const hasAssumptions = (r.assumptions ?? []).length > 0;
  const hasNotes = !!r.notes;

  if (hasAssumptions || hasNotes) {
    // Check if we need a new page
    if (y > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = 20;
    }

    doc.setFillColor(248, 248, 248);
    const boxH = (hasAssumptions ? 6 + (r.assumptions!.length * 5) : 0) + (hasNotes ? 12 : 0) + 8;
    doc.roundedRect(margin, y, contentW, boxH, 2, 2, "F");
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(margin, y, contentW, boxH, 2, 2, "S");

    y += 6;
    if (hasAssumptions) {
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text("ASSUMPTIONS", margin + 4, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      for (const a of r.assumptions!) {
        const lines = doc.splitTextToSize(`• ${a}`, contentW - 8);
        doc.text(lines, margin + 4, y);
        y += lines.length * 4.5;
      }
    }
    if (hasNotes) {
      y += 2;
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text("NOTES", margin + 4, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      const notesLines = doc.splitTextToSize(r.notes!, contentW - 8);
      doc.text(notesLines, margin + 4, y);
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(23, 32, 52);
  doc.rect(0, pageH - 12, pageW, 12, "F");
  doc.setTextColor(160, 160, 160);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("Generated by Site Snap AI Estimating Engine · All amounts in CAD · Estimate excludes HST/GST", pageW / 2, pageH - 5, { align: "center" });

  const filename = `${estimate.title.replace(/[^a-z0-9]/gi, "_").slice(0, 50)}_estimate.pdf`;

  if (open) {
    window.open(URL.createObjectURL(doc.output("blob")), "_blank");
  } else {
    doc.save(filename);
  }
}

// ── Word Export ───────────────────────────────────────────────────────────────

export async function downloadEstimateDocx(estimate: Estimate, logoDataUrl?: string, companyInfo?: CompanyInfo) {
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell,
    TextRun, HeadingLevel, AlignmentType, WidthType, ShadingType,
    BorderStyle, TableLayoutType, ImageRun,
  } = await import("docx");

  const r = estimate.result ?? {};
  const materialsTotal = sumLines(r.materials);
  const laborTotal = sumLines(r.labor);
  const equipmentTotal = sumLines(r.equipment);
  const subtotal = r.subtotal ?? (materialsTotal + laborTotal + equipmentTotal);
  const contingency = r.contingency ?? Math.round(subtotal * ((r.contingencyPct ?? 10) / 100));
  const totalLow = r.totalLow ?? subtotal;
  const totalHigh = r.totalHigh ?? (subtotal + contingency);

  const ORANGE = "FF6600";
  const DARK = "172034";
  const GREY = "F5F5F5";

  function headerRow(cols: string[], bgColor = ORANGE) {
    return new TableRow({
      tableHeader: true,
      children: cols.map((c) =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: bgColor },
          children: [new Paragraph({
            children: [new TextRun({ text: c, bold: true, color: "FFFFFF", size: 18 })],
          })],
          width: { size: 100 / cols.length, type: WidthType.PERCENTAGE },
        })
      ),
    });
  }

  function dataRow(cells: string[], shade = false) {
    return new TableRow({
      children: cells.map((c) =>
        new TableCell({
          shading: shade ? { type: ShadingType.SOLID, color: GREY } : undefined,
          children: [new Paragraph({
            children: [new TextRun({ text: c, size: 18 })],
          })],
        })
      ),
    });
  }

  function footRow(cells: string[]) {
    return new TableRow({
      children: cells.map((c, i) =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: GREY },
          children: [new Paragraph({
            alignment: i === cells.length - 1 ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: c, bold: true, size: 18 })],
          })],
        })
      ),
    });
  }

  function sectionHeading(text: string) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 120 },
      children: [new TextRun({ text, bold: true, color: DARK, size: 26 })],
    });
  }

  const sections: any[] = [];

  if (logoDataUrl) {
    try {
      const base64 = logoDataUrl.split(",")[1] ?? "";
      const mime = logoDataUrl.split(";")[0].replace("data:", "");
      const type = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
      sections.push(new Paragraph({
        spacing: { after: 120 },
        children: [new ImageRun({ data: base64, transformation: { width: 160, height: 54 }, type } as any)],
      }));
    } catch { }
  }

  // Company info block
  if (companyInfo) {
    const infoRuns: any[] = [];
    if (companyInfo.name) {
      infoRuns.push(new TextRun({ text: companyInfo.name, bold: true, size: 20, color: DARK }));
      infoRuns.push(new TextRun({ text: "\n", size: 20 }));
    }
    const cityProv = [companyInfo.address, companyInfo.city, companyInfo.province].filter(Boolean).join(", ");
    if (cityProv) {
      infoRuns.push(new TextRun({ text: cityProv, size: 18, color: "555555" }));
      infoRuns.push(new TextRun({ text: "\n", size: 18 }));
    }
    const contactParts = [companyInfo.phone, companyInfo.website].filter(Boolean).join("   ·   ");
    if (contactParts) {
      infoRuns.push(new TextRun({ text: contactParts, size: 18, color: "555555" }));
      infoRuns.push(new TextRun({ text: "\n", size: 18 }));
    }
    if (companyInfo.hstNumber) {
      infoRuns.push(new TextRun({ text: `HST# ${companyInfo.hstNumber}`, size: 18, color: "555555" }));
    }
    if (infoRuns.length > 0) {
      sections.push(new Paragraph({ spacing: { after: 160 }, children: infoRuns }));
    }
  }

  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 0, after: 160 },
      children: [new TextRun({ text: estimate.title, bold: true, color: DARK, size: 36 })],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Generated by Site Snap AI Estimating Engine   ·   ", color: "888888", size: 18 }),
        new TextRun({ text: format(new Date(estimate.createdAt), "MMMM d, yyyy"), color: "888888", size: 18 }),
      ],
    }),
  );

  if (estimate.sourceFilename) {
    sections.push(new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: `Source file: ${estimate.sourceFilename}`, italics: true, color: "888888", size: 18 })],
    }));
  }

  // Summary
  if (r.summary) {
    sections.push(new Paragraph({
      spacing: { before: 120, after: 240 },
      children: [new TextRun({ text: r.summary, size: 20, color: "444444" })],
    }));
  }

  // Cost range box
  sections.push(new Paragraph({
    spacing: { before: 80, after: 80 },
    shading: { type: ShadingType.SOLID, color: DARK },
    children: [
      new TextRun({ text: "ESTIMATED TOTAL (CAD):  ", bold: true, color: ORANGE, size: 24 }),
      new TextRun({ text: `${cad(totalLow)} – ${cad(totalHigh)}`, bold: true, color: "FFFFFF", size: 28 }),
      new TextRun({ text: `     (Subtotal ${cad(subtotal)}, Contingency ${cad(contingency)}, excl. HST/GST)`, color: "AAAAAA", size: 18 }),
    ],
  }));

  // Materials
  if ((r.materials ?? []).length > 0) {
    sections.push(sectionHeading("Materials"));
    sections.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        headerRow(["Item", "Qty", "Unit", "Unit Cost", "Total"]),
        ...r.materials!.map((m, i) => dataRow([m.item, String(m.quantity), m.unit, cad(m.unitCost), cad(m.total)], i % 2 === 1)),
        footRow(["", "", "", "Subtotal", cad(materialsTotal)]),
      ],
    }));
  }

  // Labour
  if ((r.labor ?? []).length > 0) {
    sections.push(sectionHeading("Labour"));
    sections.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        headerRow(["Trade / Role", "Hours", "Rate/hr", "Total"], "1E50A0"),
        ...r.labor!.map((l, i) => dataRow([l.trade, String(l.hours), cad(l.hourlyRate), cad(l.total)], i % 2 === 1)),
        footRow(["", "", "Subtotal", cad(laborTotal)]),
      ],
    }));
  }

  // Equipment
  if ((r.equipment ?? []).length > 0) {
    sections.push(sectionHeading("Equipment"));
    sections.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        headerRow(["Equipment", "Days", "Day Rate", "Total"], "B46400"),
        ...r.equipment!.map((e, i) => dataRow([e.item, String(e.days), cad(e.dayRate), cad(e.total)], i % 2 === 1)),
        footRow(["", "", "Subtotal", cad(equipmentTotal)]),
      ],
    }));
  }

  // Assumptions
  if ((r.assumptions ?? []).length > 0) {
    sections.push(sectionHeading("Assumptions"));
    for (const a of r.assumptions!) {
      sections.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: [new TextRun({ text: a, size: 19, color: "444444" })],
      }));
    }
  }

  // Notes
  if (r.notes) {
    sections.push(sectionHeading("Notes"));
    sections.push(new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: r.notes, size: 19, color: "444444" })],
    }));
  }

  // Footer note
  sections.push(new Paragraph({
    spacing: { before: 400 },
    children: [new TextRun({ text: "Generated by Site Snap AI Estimating Engine · All amounts in CAD", color: "AAAAAA", size: 16, italics: true })],
  }));

  const doc = new Document({
    sections: [{
      children: sections,
      properties: {},
    }],
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 20 },
        },
      },
    },
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${estimate.title.replace(/[^a-z0-9]/gi, "_").slice(0, 50)}_estimate.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Print ─────────────────────────────────────────────────────────────────────

export async function printEstimate(estimate: Estimate, logoDataUrl?: string, companyInfo?: CompanyInfo) {
  await downloadEstimatePDF(estimate, true, logoDataUrl, companyInfo);
}
