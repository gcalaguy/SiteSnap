import PDFDocument from "pdfkit";

interface LineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface InvoicePdfInput {
  invoiceNumber: string;
  title: string;
  clientName: string;
  clientEmail?: string | null;
  status: string;
  lineItems: LineItem[];
  subtotal: string | number;
  taxRate: string | number;
  taxAmount: string | number;
  total: string | number;
  notes?: string | null;
  dueDate?: string | null;
  createdAt: string;
  companyName: string;
  companyAddress?: string | null;
  companyPhone?: string | null;
  signerName?: string | null;
  signedAt?: Date | string | null;
  defaultNotes?: string | null;
}

const fmtCAD = (v: string | number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));

export function buildInvoicePdfBuffer(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PRIMARY: [number, number, number] = [212, 175, 55];
    const DARK: [number, number, number] = [18, 18, 18];
    const GRAY: [number, number, number] = [100, 100, 100];
    const LIGHT_GRAY: [number, number, number] = [245, 245, 245];
    const WHITE: [number, number, number] = [255, 255, 255];
    const ACCENT_BROWN: [number, number, number] = [40, 30, 10];
    const FOOTER_GRAY: [number, number, number] = [180, 180, 180];

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill(PRIMARY);
    doc.fillColor(WHITE).fontSize(22).font("Helvetica-Bold");
    doc.text(input.companyName, 50, 28);
    doc.fontSize(10).font("Helvetica").fillColor(ACCENT_BROWN);
    doc.text("INVOICE", doc.page.width - 50, 28, { align: "right" });
    doc.fontSize(14).font("Helvetica-Bold").fillColor(WHITE);
    doc.text(input.invoiceNumber, doc.page.width - 50, 48, { align: "right" });

    let y = 100;

    // Bill To
    doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold");
    doc.text("BILL TO", 50, y);
    doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold");
    doc.text(input.clientName, 50, y + 14);
    if (input.clientEmail) {
      doc.fontSize(9).font("Helvetica").fillColor(GRAY);
      doc.text(input.clientEmail, 50, y + 28);
    }

    // Dates (right side)
    const rightX = doc.page.width - 50;
    doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold");
    doc.text("ISSUE DATE", rightX - 120, y, { align: "right" });
    doc.text("DUE DATE", rightX, y, { align: "right" });
    doc.fillColor(DARK).fontSize(10).font("Helvetica");
    const issueDate = input.createdAt
      ? new Date(input.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })
      : "\u2014";
    const dueDate = input.dueDate
      ? new Date(input.dueDate).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })
      : "\u2014";
    doc.text(issueDate, rightX - 120, y + 14, { align: "right" });
    doc.text(dueDate, rightX, y + 14, { align: "right" });

    y += 70;

    // Title
    doc.fillColor(DARK).fontSize(14).font("Helvetica-Bold");
    doc.text(input.title, 50, y);
    y += 24;

    // Line items table
    const colX = [50, 220, 280, 360, 440];
    const colW = [170, 60, 80, 80, 80];

    // Table header
    doc.fillColor(DARK).rect(50, y, doc.page.width - 100, 22).fill(DARK);
    doc.fillColor(WHITE).fontSize(8).font("Helvetica-Bold");
    doc.text("Description", colX[0] + 4, y + 7);
    doc.text("Qty", colX[1] + 4, y + 7, { align: "center", width: colW[1] - 8 });
    doc.text("Unit", colX[2] + 4, y + 7, { align: "center", width: colW[2] - 8 });
    doc.text("Unit Price", colX[3] + 4, y + 7, { align: "right", width: colW[3] - 8 });
    doc.text("Total", colX[4] + 4, y + 7, { align: "right", width: colW[4] - 8 });
    y += 22;

    // Table rows
    input.lineItems.forEach((item, i) => {
      const rowColor: [number, number, number] = i % 2 === 0 ? LIGHT_GRAY : WHITE;
      doc.fillColor(rowColor).rect(50, y, doc.page.width - 100, 18).fill(rowColor);
      doc.fillColor(DARK).fontSize(9).font("Helvetica");
      doc.text(item.description, colX[0] + 4, y + 5, { width: colW[0] - 8, ellipsis: true });
      doc.text(String(item.quantity), colX[1] + 4, y + 5, { align: "center", width: colW[1] - 8 });
      doc.text(item.unit, colX[2] + 4, y + 5, { align: "center", width: colW[2] - 8 });
      doc.text(fmtCAD(item.unitPrice), colX[3] + 4, y + 5, { align: "right", width: colW[3] - 8 });
      doc.text(fmtCAD(item.total), colX[4] + 4, y + 5, { align: "right", width: colW[4] - 8 });
      y += 18;
    });

    y += 12;

    // Totals
    const totalsX = doc.page.width - 50;
    const labelX = totalsX - 120;

    doc.fillColor(GRAY).fontSize(10).font("Helvetica");
    doc.text("Subtotal", labelX, y, { align: "right" });
    doc.fillColor(DARK).font("Helvetica-Bold");
    doc.text(fmtCAD(input.subtotal), totalsX, y, { align: "right" });
    y += 16;

    const hstPct = (parseFloat(String(input.taxRate)) * 100).toFixed(0);
    doc.font("Helvetica").fillColor(GRAY);
    doc.text(`HST (${hstPct}%)`, labelX, y, { align: "right" });
    doc.fillColor(DARK).font("Helvetica-Bold");
    doc.text(fmtCAD(input.taxAmount), totalsX, y, { align: "right" });
    y += 14;

    // Total highlight bar
    doc.fillColor(PRIMARY).rect(labelX - 10, y, totalsX - labelX + 20, 24).fill(PRIMARY);
    doc.fillColor(WHITE).fontSize(12).font("Helvetica-Bold");
    doc.text("TOTAL", labelX, y + 7, { align: "right" });
    doc.text(fmtCAD(input.total), totalsX, y + 7, { align: "right" });
    y += 36;

    // Notes
    if (input.notes) {
      doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold");
      doc.text("NOTES", 50, y);
      y += 14;
      doc.fillColor(DARK).fontSize(10).font("Helvetica");
      doc.text(input.notes, 50, y, { width: doc.page.width - 100 });
      y += doc.heightOfString(input.notes, { width: doc.page.width - 100 }) + 10;
    }

    // Default notes
    if (input.defaultNotes) {
      doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold");
      doc.text("TERMS & CONDITIONS", 50, y);
      y += 14;
      doc.fillColor(DARK).fontSize(10).font("Helvetica");
      doc.text(input.defaultNotes, 50, y, { width: doc.page.width - 100 });
      y += doc.heightOfString(input.defaultNotes, { width: doc.page.width - 100 }) + 10;
    }

    // Signature block
    if (input.signedAt && input.signerName) {
      y += 10;
      doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold");
      doc.text("CLIENT SIGNATURE", 50, y);
      y += 14;
      doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold");
      doc.text(input.signerName, 50, y);
      y += 14;
      doc.fillColor(GRAY).fontSize(9).font("Helvetica");
      const signedDate = input.signedAt instanceof Date
        ? input.signedAt.toLocaleString("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : new Date(input.signedAt).toLocaleString("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      doc.text(`Signed on ${signedDate}`, 50, y);
    }

    // Footer
    const pageH = doc.page.height;
    doc.fillColor(DARK).rect(0, pageH - 30, doc.page.width, 30).fill(DARK);
    doc.fillColor(FOOTER_GRAY).fontSize(8).font("Helvetica");
    doc.text(`Generated by Site Snap \u00b7 ${input.invoiceNumber}`, 50, pageH - 14);
    doc.text(new Date().toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }), doc.page.width - 50, pageH - 14, { align: "right" });

    doc.end();
  });
}
