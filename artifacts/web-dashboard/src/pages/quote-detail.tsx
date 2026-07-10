import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useUpdateQuote,
  useDeleteQuote,
  useSubmitQuoteForApproval,
  useApproveQuote,
  useRejectQuote,
  useUnsubmitQuote,
  useConvertQuoteToInvoice,
  useGenerateQuoteAI,
  useGetMe,
  getListAllQuotesQueryKey,
  customFetch,
  type Quote,
} from "@workspace/api-client-react";
import { generateQuoteAIBodyVoiceInputMax } from "@workspace/api-zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getAiErrorMessage } from "@/hooks/useApiError";
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Trash2,
  Send,
  Receipt,
  Save,
  Loader2,
  Download,
  FileSpreadsheet,
  CheckCircle,
  Database,
  Undo2,
} from "lucide-react";
import * as XLSX from "@e965/xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { formatCurrency as fmtCAD } from "@/lib/format";
import ImportCostModelDialog from "@/components/ImportCostModelDialog";
import jsPDF from "jspdf";
import { renderSignatureBlock } from "@/lib/signaturePdf";
import { SignatureBadge } from "@/components/SignatureBadge";
import { Share2 } from "lucide-react";
import autoTable from "jspdf-autotable";

function imgFmt(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

async function loadTemplateDataUrl(objectPath: string | null | undefined): Promise<string | undefined> {
  if (!objectPath) return undefined;
  try {
    const path = objectPath.replace(/^\//, "");
    const rest = path.startsWith("objects/")
      ? path.replace(/^objects\//, "")
      : path.startsWith("api/storage/objects/")
        ? path.replace(/^api\/storage\/objects\//, "")
        : null;
    if (!rest) return undefined;
    const { url } = (await customFetch(`/api/storage/objects/${rest}/signed-url`)) as { url: string };
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Submitted",
  approved: "Approved",
  rejected: "Needs Revision",
  converted: "Converted to Invoice",
};

function buildQuotePdfDoc(
  quote: { quoteNumber: string; title: string; clientName: string; clientEmail?: string | null; clientCompanyName?: string | null; clientAddress?: string | null; clientPhone?: string | null; status: string; createdAt: string; validUntil?: string | null; notes?: string | null; taxRate: string; signedAt?: string | null; signatureData?: string | null; signerName?: string | null; signerIp?: string | null },
  lineItems: { description: string; quantity: number; unit: string; unitPrice: number; total: number }[],
  companyName: string,
  templateDataUrl?: string,
  logoDataUrl?: string,
  companyAddress?: string,
  companyPhone?: string,
  defaultTerms?: string | null,
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const PRIMARY: [number, number, number] = [10, 10, 10];
  const DARK: [number, number, number] = [10, 10, 10];
  const GRAY: [number, number, number] = [100, 100, 100];
  const WHITE: [number, number, number] = [255, 255, 255];
  const LIGHT_TEXT: [number, number, number] = [180, 180, 180];
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const fmtC = fmtCAD;
  const taxRate = parseFloat(quote.taxRate ?? "0.13");
  const subtotal = lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = subtotal + taxAmount;
  const statusLabel = QUOTE_STATUS_LABELS[quote.status] ?? quote.status;

  let y: number;

  if (templateDataUrl) {
    // Custom template banner + dark strip for doc metadata
    const TEMPLATE_H = 50;
    const META_H = 13;
    doc.addImage(templateDataUrl, imgFmt(templateDataUrl), 0, 0, pageW, TEMPLATE_H);
    doc.setFillColor(...DARK);
    doc.rect(0, TEMPLATE_H, pageW, META_H, "F");
    // "QUOTE" label in white
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);
    doc.text("QUOTE", margin, TEMPLATE_H + 8.5);
    // Quote number in white
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...WHITE);
    doc.text(quote.quoteNumber, margin + 18, TEMPLATE_H + 8.5);
    // Status on right in light grey
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...LIGHT_TEXT);
    doc.text(`STATUS: ${statusLabel.toUpperCase()}`, pageW - margin, TEMPLATE_H + 8.5, { align: "right" });
    y = TEMPLATE_H + META_H + 8;
  } else {
    // Default branded header
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pageW, 28, "F");
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, imgFmt(logoDataUrl), margin, 3, 52, 22);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...WHITE);
      doc.text(companyName, margin, 13);
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...LIGHT_TEXT);
    doc.text("QUOTE", pageW - margin, 10, { align: "right" });
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(quote.quoteNumber, pageW - margin, 19, { align: "right" });
    y = 38;
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text(quote.title, margin, y);
  y += 10;

  // FROM / TO two-column section
  const colMid = pageW / 2;
  const sectionStartY = y;

  // FROM — company info (left column)
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("FROM", margin, y);
  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(companyName, margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  if (companyAddress) {
    doc.text(companyAddress, margin, y);
    y += 4.5;
  }
  if (companyPhone) {
    doc.text(companyPhone, margin, y);
    y += 4.5;
  }

  // TO — client info (right column)
  let ty = sectionStartY;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("TO", colMid, ty);
  ty += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(quote.clientName, colMid, ty);
  ty += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  if (quote.clientCompanyName) {
    doc.text(quote.clientCompanyName, colMid, ty);
    ty += 4.5;
  }
  if (quote.clientAddress) {
    doc.text(quote.clientAddress, colMid, ty, { maxWidth: colMid - margin - 4 });
    ty += 4.5;
  }
  if (quote.clientPhone) {
    doc.text(quote.clientPhone, colMid, ty);
    ty += 4.5;
  }
  if (quote.clientEmail) {
    doc.text(quote.clientEmail, colMid, ty);
    ty += 4.5;
  }

  y = Math.max(y, ty) + 6;

  // Valid until
  if (quote.validUntil) {
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Valid until: ${format(new Date(quote.validUntil), "MMM d, yyyy")}`, margin, y);
    y += 7;
  }

  // Line items table
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Description", "Qty", "Unit", "Unit Price", "Total"]],
    body: lineItems.map((i) => [i.description, String(i.quantity), i.unit, fmtC(i.unitPrice), fmtC(i.total)]),
    headStyles: { fillColor: DARK, textColor: [255, 255, 255] as [number, number, number], fontSize: 8, fontStyle: "bold", cellPadding: 4 },
    bodyStyles: { fontSize: 9, cellPadding: 3.5, textColor: DARK },
    alternateRowStyles: { fillColor: [245, 245, 245] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 16 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 30 },
    },
    styles: { overflow: "linebreak" },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const tx = pageW - margin;

  // Totals
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("Subtotal", tx - 40, y, { align: "right" });
  doc.setTextColor(...DARK);
  doc.text(fmtC(subtotal), tx, y, { align: "right" });
  y += 6;

  doc.setTextColor(...GRAY);
  doc.text(`HST (${(taxRate * 100).toFixed(0)}%)`, tx - 40, y, { align: "right" });
  doc.setTextColor(...DARK);
  doc.text(fmtC(taxAmount), tx, y, { align: "right" });
  y += 4;

  doc.setFillColor(...PRIMARY);
  doc.roundedRect(tx - 64, y, 65, 10, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...WHITE);
  doc.text("TOTAL", tx - 41, y + 6.5, { align: "right" });
  doc.text(fmtC(total), tx - 1, y + 6.5, { align: "right" });

  // Notes
  if (quote.notes) {
    const ny = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GRAY);
    doc.text("Notes:", margin, ny);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const noteLines = doc.splitTextToSize(quote.notes, pageW - margin * 2);
    doc.text(noteLines, margin, ny + 5);
  }

  // Default Terms & Conditions
  if (defaultTerms) {
    const ty = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + (quote.notes ? 52 : 30);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GRAY);
    doc.text("Terms & Conditions:", margin, ty);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const termLines = doc.splitTextToSize(defaultTerms, pageW - margin * 2);
    doc.text(termLines, margin, ty + 5);
  }

  // Signature block (renders above the footer strip if signed)
  if (quote.signedAt && quote.signatureData) {
    renderSignatureBlock(doc, {
      signatureData: quote.signatureData,
      signerName: quote.signerName,
      signerIp: quote.signerIp,
      signedAt: quote.signedAt,
    }, { label: "CLIENT SIGNATURE" });
  }

  // Footer strip
  doc.setFillColor(...DARK);
  doc.rect(0, pageH - 12, pageW, 12, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...LIGHT_TEXT);
  doc.text(`Generated by Site Snap · ${quote.quoteNumber}`, margin, pageH - 4.5);
  doc.text(format(new Date(), "MMM d, yyyy"), pageW - margin, pageH - 4.5, { align: "right" });

  return doc;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Submitted",
  approved: "Approved",
  rejected: "Needs Revision",
  converted: "Converted to Invoice",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  pending_approval: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-orange-50 text-orange-700 border-orange-200",
  converted: "bg-purple-50 text-purple-700 border-purple-200",
};

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; total: number };

function calcTotals(items: LineItem[], taxRate = 0.13) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

type QuoteForExport = { quoteNumber: string; title: string; clientName: string; clientEmail?: string | null; status: string; createdAt: string; validUntil?: string | null; lineItems?: unknown; taxRate: string; subtotal: string; taxAmount: string; total: string };

async function downloadQuoteXLSX(quote: QuoteForExport) {
  const items = (quote.lineItems ?? []) as { description: string; quantity: number; unit: string; unitPrice: number; total: number }[];
  const taxRate = parseFloat(quote.taxRate ?? "0.13");
  const wsData = [
    ["Quote Number", quote.quoteNumber],
    ["Title", quote.title],
    ["Client", quote.clientName],
    ["Client Email", quote.clientEmail ?? ""],
    ["Status", quote.status],
    ["Created", format(new Date(quote.createdAt), "yyyy-MM-dd")],
    ["Valid Until", quote.validUntil ? format(new Date(quote.validUntil), "yyyy-MM-dd") : ""],
    [],
    ["Description", "Qty", "Unit", "Unit Price (CAD)", "Total (CAD)"],
    ...items.map((item) => [item.description, item.quantity, item.unit, Number(item.unitPrice), Number(item.total)]),
    [],
    ["Subtotal", "", "", "", Number(quote.subtotal)],
    [`HST (${(taxRate * 100).toFixed(0)}%)`, "", "", "", Number(quote.taxAmount)],
    ["TOTAL CAD", "", "", "", Number(quote.total)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{ wch: 30 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Quote");
  const xlsxFilename = `${quote.quoteNumber}.xlsx`;
  XLSX.writeFile(wb, xlsxFilename);

  const { mirrorArrayBuffer } = await import("@/lib/driveSyncPipeline");
  const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  await mirrorArrayBuffer(xlsxFilename, xlsxBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const quoteId = parseInt(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quote, isLoading } = useQuery<Quote>({
    queryKey: [`/api/projects/0/quotes/${quoteId}`],
    queryFn: () => customFetch<Quote>(`/api/projects/0/quotes/${quoteId}`),
    enabled: !!quoteId,
  });
  const realProjectId = quote?.projectId ?? 0;
  const updateQuote = useUpdateQuote();
  const submitQuote = useSubmitQuoteForApproval();
  const approveQuote = useApproveQuote();
  const rejectQuote = useRejectQuote();
  const unsubmitQuote = useUnsubmitQuote();
  const convertQuote = useConvertQuoteToInvoice();
  const generateAI = useGenerateQuoteAI();

  const { data: me } = useGetMe();
  const deleteQuote = useDeleteQuote();

  const [jobDescription, setJobDescription] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [clientCompanyName, setClientCompanyName] = useState<string | null>(null);
  const [clientAddress, setClientAddress] = useState<string | null>(null);
  const [clientPhone, setClientPhone] = useState<string | null>(null);
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importItem, setImportItem] = useState<LineItem | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: [`/api/projects/0/quotes/${quoteId}`] });
    queryClient.invalidateQueries({ queryKey: getListAllQuotesQueryKey({}) });
  }

  const rawDbItems = ((quote?.lineItems ?? []) as unknown as Record<string, unknown>[]).map((item) => ({
    description: String(item.description || ""),
    quantity: Number(item.quantity ?? 1),
    unit: String(item.unit || "ea").trim() || "ea",
    unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
    total: Number(item.total ?? 0),
  }));
  const effectiveItems: LineItem[] = lineItems ?? rawDbItems;
  const effectiveTitle = title ?? quote?.title ?? "";
  const effectiveNotes = notes ?? quote?.notes ?? "";
  const effectiveClientName = clientName ?? quote?.clientName ?? "";
  const effectiveClientCompanyName = clientCompanyName ?? quote?.clientCompanyName ?? "";
  const effectiveClientAddress = clientAddress ?? quote?.clientAddress ?? "";
  const effectiveClientPhone = clientPhone ?? quote?.clientPhone ?? "";
  const effectiveClientEmail = clientEmail ?? quote?.clientEmail ?? "";
  const taxRate = parseFloat(quote?.taxRate ?? "0.13");
  const { subtotal, taxAmount, total } = calcTotals(effectiveItems, taxRate);

  const isEditable = quote?.status === "draft" || quote?.status === "rejected";
  const canDelete = isEditable && (me?.role !== "worker" || quote?.createdByUserId === me?.id);

  async function handleDelete() {
    try {
      await deleteQuote.mutateAsync({ projectId: realProjectId, quoteId });
      queryClient.invalidateQueries({ queryKey: getListAllQuotesQueryKey({}) });
      toast({ title: "Quote deleted" });
      setLocation("/financials?tab=quotes");
    } catch {
      toast({ title: "Failed to delete quote", variant: "destructive" });
    }
  }

  async function handleApprove() {
    try {
      await approveQuote.mutateAsync({ projectId: realProjectId, quoteId });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/0/quotes/${quoteId}`] });
      queryClient.invalidateQueries({ queryKey: getListAllQuotesQueryKey({}) });
      toast({ title: "Quote approved" });
    } catch {
      toast({ title: "Failed to approve quote", variant: "destructive" });
    }
  }

  async function handleReject() {
    try {
      await rejectQuote.mutateAsync({ projectId: realProjectId, quoteId, data: {} });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/0/quotes/${quoteId}`] });
      queryClient.invalidateQueries({ queryKey: getListAllQuotesQueryKey({}) });
      toast({ title: "Quote sent back for revision" });
    } catch {
      toast({ title: "Failed to reject quote", variant: "destructive" });
    }
  }

  async function handleRevertToDraft() {
    try {
      await unsubmitQuote.mutateAsync({ projectId: realProjectId, quoteId });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/0/quotes/${quoteId}`] });
      queryClient.invalidateQueries({ queryKey: getListAllQuotesQueryKey({}) });
      toast({ title: "Quote reverted to draft" });
    } catch {
      toast({ title: "Failed to revert quote", variant: "destructive" });
    }
  }

  async function handleAIFill() {
    if (!jobDescription.trim()) { toast({ title: "Enter a job description first", variant: "destructive" }); return; }
    setAiLoading(true);
    try {
      const result = await generateAI.mutateAsync({
        data: { voiceInput: jobDescription, projectName: undefined, clientName: quote?.clientName ?? undefined },
      });
      if (result.lineItems) {
        const normalized: LineItem[] = (result.lineItems as unknown as Record<string, unknown>[]).map((item) => {
          const rawUnit = item.unit || item.unit_type || item.uom || item.measure || "ea";
          const rawUnitPrice = item.unitPrice ?? item.unit_price ?? item.unitCost ?? item.unit_cost ?? 0;
          const qty = Number(item.quantity ?? 1);
          const price = Number(rawUnitPrice);
          return {
            description: String(item.description || ""),
            quantity: qty,
            unit: String(rawUnit).trim() || "ea",
            unitPrice: price,
            total: Number(item.total ?? (qty * price)),
          };
        });
        setLineItems(normalized);
      }
      if (result.title && !title) setTitle(result.title);
      if (result.notes) setNotes(result.notes);
      toast({ title: "AI quote generated", description: "Review and adjust the line items below." });
    } catch (err) {
      toast({ title: "AI generation failed", description: getAiErrorMessage(err), variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    const items = [...effectiveItems];
    (items[idx] as Record<string, unknown>)[field] = value;
    items[idx].total = Math.round(items[idx].quantity * items[idx].unitPrice * 100) / 100;
    setLineItems(items);
  }

  function addItem() {
    setLineItems([...effectiveItems, { description: "", quantity: 1, unit: "ea", unitPrice: 0, total: 0 }]);
  }

  function removeItem(idx: number) {
    setLineItems(effectiveItems.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { subtotal: sub, taxAmount: tax, total: tot } = calcTotals(effectiveItems, taxRate);
      await updateQuote.mutateAsync({
        projectId: realProjectId,
        quoteId,
        data: {
          title: effectiveTitle || undefined,
          notes: effectiveNotes || undefined,
          clientName: effectiveClientName || undefined,
          clientEmail: effectiveClientEmail || undefined,
          clientCompanyName: effectiveClientCompanyName || undefined,
          clientAddress: effectiveClientAddress || undefined,
          clientPhone: effectiveClientPhone || undefined,
          lineItems: effectiveItems,
          subtotal: sub,
          taxRate,
          taxAmount: tax,
          total: tot,
        },
      });
      setLineItems(null);
      setTitle(null);
      setNotes(null);
      setClientName(null);
      setClientCompanyName(null);
      setClientAddress(null);
      setClientPhone(null);
      setClientEmail(null);
      toast({ title: "Quote saved" });
      invalidate();
    } catch {
      toast({ title: "Failed to save quote", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit() {
    submitQuote.mutate({ projectId: realProjectId, quoteId }, {
      onSuccess: () => {
        toast({ title: "Quote submitted!", description: "The foreman and owner have been notified by email." });
        invalidate();
      },
      onError: () => toast({ title: "Submission failed", variant: "destructive" }),
    });
  }

  function handleConvert() {
    convertQuote.mutate({ projectId: realProjectId, quoteId, data: {} }, {
      onSuccess: (inv) => {
        toast({ title: "Invoice created!", description: `Invoice ${inv.invoiceNumber} is ready.` });
        invalidate();
        setLocation(`/invoices/${inv.id}`);
      },
      onError: () => toast({ title: "Conversion failed", variant: "destructive" }),
    });
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-20">
        <p className="text-lg font-medium">Quote not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => setLocation("/financials?tab=quotes")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Quotes
        </Button>
      </div>
    );
  }

  const hasUnsavedChanges = lineItems !== null || title !== null || notes !== null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <button
            onClick={() => history.back()}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{quote.title}</h1>
            <Badge variant="outline" className={STATUS_COLORS[quote.status]}>
              {STATUS_LABELS[quote.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {quote.quoteNumber} · {quote.clientName}
            {quote.clientEmail && ` · ${quote.clientEmail}`}
          </p>
          {quote.createdAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Created {format(new Date(quote.createdAt), "MMMM d, yyyy")}
            </p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Download PDF */}
          <Button variant="outline" onClick={async () => {
            if (!quote) return;
            const companyName = me?.company?.name ?? "Site Snap";
            const quoteTemplatePath = me?.company?.quoteTemplatePath ?? undefined;
            const logoPath = me?.company?.logoPath ?? undefined;
            const [templateDataUrl, logoDataUrl] = await Promise.all([
              loadTemplateDataUrl(quoteTemplatePath),
              loadTemplateDataUrl(logoPath),
            ]);
            const companyAddress = me?.company?.address ?? undefined;
            const companyPhone = me?.company?.phone ?? undefined;
            const pdf = buildQuotePdfDoc(
              {
                quoteNumber: quote.quoteNumber,
                title: effectiveTitle || quote.title,
                clientName: effectiveClientName || quote.clientName,
                clientEmail: effectiveClientEmail || quote.clientEmail,
                clientCompanyName: effectiveClientCompanyName || quote?.clientCompanyName,
                clientAddress: effectiveClientAddress || quote?.clientAddress,
                clientPhone: effectiveClientPhone || quote?.clientPhone,
                status: quote.status,
                createdAt: quote.createdAt,
                validUntil: quote.validUntil,
                notes: effectiveNotes || undefined,
                taxRate: quote.taxRate,
              },
              effectiveItems,
              companyName,
              templateDataUrl,
              logoDataUrl,
              companyAddress,
              companyPhone,
              me?.company?.defaultQuoteTerms,
            );
            const pdfFilename = `${quote.quoteNumber}.pdf`;
            pdf.save(pdfFilename);
            toast({ title: "PDF downloaded" });

            const { mirrorArrayBuffer } = await import("@/lib/driveSyncPipeline");
            await mirrorArrayBuffer(pdfFilename, pdf.output("arraybuffer"), "application/pdf");
          }}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>

          {/* Download Excel */}
          <Button variant="outline" onClick={() => {
            if (!quote) return;
            downloadQuoteXLSX({
              quoteNumber: quote.quoteNumber,
              title: effectiveTitle || quote.title,
              clientName: quote.clientName,
              clientEmail: quote.clientEmail,
              status: quote.status,
              createdAt: quote.createdAt,
              validUntil: quote.validUntil,
              lineItems: effectiveItems,
              taxRate: String(taxRate),
              subtotal: String(subtotal),
              taxAmount: String(taxAmount),
              total: String(total),
            });
            toast({ title: "Excel downloaded" });
          }}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>

          {/* Save (only when editable + unsaved changes) */}
          {isEditable && hasUnsavedChanges && (
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          )}

          {/* Submit (draft or needs revision) */}
          {isEditable && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={submitQuote.isPending}>
                  {submitQuote.isPending
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <Send className="h-4 w-4 mr-2" />}
                  Submit
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit this quote?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The quote will be sent to the foreman and owner for review. They'll receive an email notification. Make sure all line items and totals are correct before submitting.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSubmit}>Submit</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Submitted: owners/foremen can approve or reject */}
          {quote.status === "pending_approval" && me?.role !== "worker" && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="gap-2" style={{ background: "#16a34a", color: "#fff" }} disabled={approveQuote.isPending}>
                    <CheckCircle className="h-4 w-4" />
                    {approveQuote.isPending ? "Approving…" : "Approve"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve this quote?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The quote will be marked as approved and ready to convert to an invoice.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleApprove}>Approve</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="gap-2 border-red-200 text-red-600 hover:bg-red-50" disabled={rejectQuote.isPending}>
                    {rejectQuote.isPending ? "Sending back…" : "Request Revision"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Request revision?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The quote will be sent back to the submitter to make changes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReject}>Send Back</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {quote.status === "pending_approval" && me?.role === "worker" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium">
              <Send className="h-4 w-4" />
              Awaiting review
            </div>
          )}

          {/* Revert to Draft */}
          {(quote.status === "pending_approval" || quote.status === "approved" || quote.status === "rejected") && me?.role !== "worker" && !quote.signedAt && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={unsubmitQuote.isPending}>
                  {unsubmitQuote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                  Revert to Draft
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revert quote to draft?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The quote will be moved back to draft status so it can be edited and resubmitted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRevertToDraft}>Revert to Draft</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Share signing link (clients can view + sign) — only when actually signable */}
          {quote.publicToken && (quote.status === "pending_approval" || quote.status === "approved") && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                const url = `${window.location.origin}/q/${quote.publicToken}`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast({ title: "Sign link copied", description: url });
                } catch {
                  toast({ title: "Sign link", description: url });
                }
              }}
            >
              <Share2 className="h-4 w-4" /> Copy Sign Link
            </Button>
          )}

          {/* Signed badge */}
          {quote.signedAt && (
            <SignatureBadge meta={quote} />
          )}

          {/* Approved: convert to invoice */}
          {quote.status === "approved" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={convertQuote.isPending}>
                  <Receipt className="h-4 w-4 mr-2" />
                  {convertQuote.isPending ? "Converting..." : "Convert to Invoice"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Convert to invoice?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A new invoice will be created from this quote with the same line items and totals. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleConvert}>Convert</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Converted */}
          {quote.status === "converted" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-sm font-medium">
              <CheckCircle className="h-4 w-4" />
              Invoiced
            </div>
          )}

          {/* Delete (draft/rejected only; workers only see if they created it) */}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:border-destructive" disabled={deleteQuote.isPending}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete quote {quote.quoteNumber}. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* AI Fill section — only for editable quotes */}
      {isEditable && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Quote Fill
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Describe the job in plain language — AI will generate line items with Canadian pricing.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="e.g. We need to pour a concrete foundation 30 feet by 40 feet, 8 inches deep. Labour for 4 guys for 2 days, plus concrete pump rental..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value.slice(0, generateQuoteAIBodyVoiceInputMax))}
              rows={3}
              maxLength={generateQuoteAIBodyVoiceInputMax}
              className="resize-none bg-background"
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAIFill}
                  disabled={aiLoading || !jobDescription.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                  {aiLoading ? "Generating…" : "Generate Items"}
                </Button>
              </div>
              <p className={`text-xs shrink-0 tabular-nums ${jobDescription.length >= generateQuoteAIBodyVoiceInputMax ? "text-destructive font-medium" : jobDescription.length >= generateQuoteAIBodyVoiceInputMax * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
                {jobDescription.length.toLocaleString()}/{generateQuoteAIBodyVoiceInputMax.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quote details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quote Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            {isEditable ? (
              <Input
                value={effectiveTitle}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Quote title"
              />
            ) : (
              <p className="text-sm text-foreground">{effectiveTitle}</p>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Quote Number</Label>
            <p className="text-sm font-mono">{quote.quoteNumber}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Name</Label>
              {isEditable ? (
                <Input
                  value={effectiveClientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Primary contact"
                />
              ) : (
                <p className="text-sm">{effectiveClientName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Client Company Name</Label>
              {isEditable ? (
                <Input
                  value={effectiveClientCompanyName}
                  onChange={(e) => setClientCompanyName(e.target.value)}
                  placeholder="Company or organization"
                />
              ) : (
                <p className="text-sm">{effectiveClientCompanyName || <span className="text-muted-foreground">—</span>}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client Email</Label>
              {isEditable ? (
                <Input
                  type="email"
                  value={effectiveClientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@example.com"
                />
              ) : (
                <p className="text-sm">{effectiveClientEmail || <span className="text-muted-foreground">—</span>}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Client Phone</Label>
              {isEditable ? (
                <Input
                  type="tel"
                  value={effectiveClientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                />
              ) : (
                <p className="text-sm">{effectiveClientPhone || <span className="text-muted-foreground">—</span>}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Client Address</Label>
            {isEditable ? (
              <Input
                value={effectiveClientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="123 Main St, City, Province, Postal Code"
              />
            ) : (
              <p className="text-sm">{effectiveClientAddress || <span className="text-muted-foreground">—</span>}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Line Items</CardTitle>
          {isEditable && (
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Item
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Description</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-20">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-20">Unit</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-28">Unit Price</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-28">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {effectiveItems.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2">
                      {isEditable ? (
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          className="h-8 text-sm"
                          placeholder="Description"
                        />
                      ) : (
                        <span>{item.description}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {isEditable ? (
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm text-right w-20 ml-auto"
                          min={0}
                        />
                      ) : (
                        <span>{item.quantity}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {isEditable ? (
                        <Input
                          value={item.unit}
                          onChange={(e) => updateItem(idx, "unit", e.target.value)}
                          className="h-8 text-sm text-right w-20 ml-auto"
                          placeholder="ea"
                        />
                      ) : (
                        <span>{item.unit}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {isEditable ? (
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm text-right w-28 ml-auto"
                          min={0}
                          step={0.01}
                        />
                      ) : (
                        <span>{fmtCAD(item.unitPrice)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {fmtCAD(item.total)}
                    </td>
                    <td className="px-2 py-2">
                      {isEditable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {me?.role !== "worker" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          title="Save to Pricing Database"
                          onClick={() => setImportItem(item)}
                        >
                          <Database className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {effectiveItems.length === 0 && (
                  <tr>
                    <td colSpan={isEditable ? 6 : 6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No line items yet.{isEditable && " Click \"Add Item\" or use AI fill above."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-4 py-4 border-t border-border space-y-1.5">
            <div className="flex justify-end gap-8 text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span className="w-28 text-right">{fmtCAD(subtotal)}</span>
            </div>
            <div className="flex justify-end gap-8 text-sm text-muted-foreground">
              <span>HST ({(taxRate * 100).toFixed(0)}%)</span>
              <span className="w-28 text-right">{fmtCAD(taxAmount)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-end gap-8">
              <span className="font-bold text-foreground">Total (CAD)</span>
              <span className="w-28 text-right font-bold text-xl text-primary">{fmtCAD(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditable ? (
            <Textarea
              value={effectiveNotes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes, payment terms, or scope details…"
              rows={4}
              className="resize-none"
            />
          ) : (
            effectiveNotes
              ? <p className="text-sm text-foreground whitespace-pre-wrap">{effectiveNotes}</p>
              : <p className="text-sm text-muted-foreground">No notes.</p>
          )}
        </CardContent>
      </Card>

      {/* Bottom save / submit bar for editable quotes */}
      {isEditable && (
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          {hasUnsavedChanges && (
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={submitQuote.isPending}>
                {submitQuote.isPending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Send className="h-4 w-4 mr-2" />}
                Submit to Foreman & Owner
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Submit this quote?</AlertDialogTitle>
                <AlertDialogDescription>
                  The quote will be sent to the foreman and owner for review. They'll receive an email notification.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSubmit}>Submit</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {importItem && (
        <ImportCostModelDialog
          open
          onClose={() => setImportItem(null)}
          description={importItem.description}
          unitPrice={importItem.unitPrice}
          sourceType="quote"
          sourceId={String(quoteId)}
          sourceLabel={`Quote #${quote?.quoteNumber ?? quoteId}`}
        />
      )}
    </div>
  );
}
