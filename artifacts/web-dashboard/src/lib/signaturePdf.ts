import type jsPDF from "jspdf";

export interface SignaturePdfMeta {
  signerName?: string | null;
  signerIp?: string | null;
  signedAt?: string | Date | null;
  signatureData?: string | null;
}

/**
 * Renders a signature image + audit footer on the current PDF page.
 * Adds a thin "Digitally signed by ..." line in the footer area.
 */
export function renderSignatureBlock(
  doc: jsPDF,
  meta: SignaturePdfMeta,
  opts?: { yOverride?: number; label?: string },
): void {
  if (!meta.signedAt || !meta.signatureData) return;

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Place the signature block above the dark footer strip (which is 12mm tall).
  const blockH = 28;
  const blockTop = opts?.yOverride ?? pageH - 12 - blockH - 4;
  const blockW = 78;
  const blockLeft = pageW - margin - blockW;

  // Box around signature
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.rect(blockLeft, blockTop, blockW, blockH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text((opts?.label ?? "ELECTRONICALLY SIGNED").toUpperCase(), blockLeft + 2, blockTop + 4);

  // Signature image
  try {
    const imgFmt = meta.signatureData.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    doc.addImage(meta.signatureData, imgFmt, blockLeft + 2, blockTop + 5, blockW - 4, 16);
  } catch {
    // ignore — bad image
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  if (meta.signerName) {
    doc.text(meta.signerName, blockLeft + 2, blockTop + blockH - 3);
  }

  // Footer audit line (over the dark strip is hard to read — put it just above)
  const ts = typeof meta.signedAt === "string" ? new Date(meta.signedAt) : meta.signedAt;
  const audit = `Digitally signed on ${ts.toUTCString()}${meta.signerIp ? ` from IP ${meta.signerIp}` : ""}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text(audit, margin, pageH - 14);
}
