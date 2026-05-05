import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useGetInvoice, useMarkInvoiceSent, useMarkInvoicePaid, useGetMe, useSendInvoiceEmail, useSendInvoiceReminder, useUpdateInvoice, customFetch } from "@workspace/api-client-react";
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
import { ArrowLeft, SendHorizonal, CheckCircle2, Receipt, Download, Mail, Loader2, Bell, FileSpreadsheet, Plus, Trash2, Save } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getGetInvoiceQueryKey, getListAllInvoicesQueryKey } from "@workspace/api-client-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function loadTemplateDataUrl(objectPath: string | null | undefined): Promise<string | undefined> {
  if (!objectPath) return undefined;
  try {
    const url = objectPath.replace(/^\/objects\//, "/api/storage/objects/");
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

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-400 border-gray-200",
};

function fmtCAD(v: string | number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

interface LineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  title: string;
  clientName: string;
  clientEmail?: string | null;
  status: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  notes?: string | null;
  dueDate?: string | null;
  sentAt?: string | null;
  paidAt?: string | null;
  reminderSentAt?: string | null;
  createdAt: string;
  lineItems?: unknown;
  createdByUserId?: number;
}

function calcTotals(items: LineItem[], taxRate = 0.13) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

// Shared PDF builder
function buildPdfDoc(invoice: Invoice, lineItems: LineItem[], companyName: string, templateDataUrl?: string): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  const PRIMARY = [212, 175, 55] as [number, number, number];
  const DARK = [10, 10, 10] as [number, number, number];
  const GRAY = [100, 100, 100] as [number, number, number];
  const LIGHT_GRAY = [245, 245, 245] as [number, number, number];
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;

  let y: number;

  if (templateDataUrl) {
    const TEMPLATE_H = 38;
    doc.addImage(templateDataUrl, 0, 0, pageW, TEMPLATE_H);
    doc.setFillColor(248, 248, 248);
    doc.rect(0, TEMPLATE_H, pageW, 13, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text("INVOICE", margin, TEMPLATE_H + 8.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(invoice.invoiceNumber, margin + 22, TEMPLATE_H + 8.5);
    const statusLabelT = STATUS_LABELS[invoice.status] ?? invoice.status;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Status: ${statusLabelT.toUpperCase()}`, pageW - margin, TEMPLATE_H + 8.5, { align: "right" });
    y = TEMPLATE_H + 19;
  } else {
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pageW, 28, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(companyName, margin, 13);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 30, 10);
    doc.text("INVOICE", pageW - margin, 10, { align: "right" });

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(invoice.invoiceNumber, pageW - margin, 19, { align: "right" });

    const statusLabel = STATUS_LABELS[invoice.status] ?? invoice.status;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(`Status: ${statusLabel.toUpperCase()}`, pageW - margin, 26, { align: "right" });

    y = 38;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text(invoice.title, margin, y);
  y += 8;

  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(margin, y, pageW - margin * 2, 26, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("BILL TO", margin + 4, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(invoice.clientName, margin + 4, y + 13);
  if (invoice.clientEmail) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text(invoice.clientEmail, margin + 4, y + 19);
  }

  const dateX = pageW - margin - 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("ISSUE DATE", dateX - 30, y + 6, { align: "right" });
  doc.text("DUE DATE", dateX, y + 6, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(format(new Date(invoice.createdAt), "MMM d, yyyy"), dateX - 30, y + 13, { align: "right" });
  doc.text(
    invoice.dueDate ? format(new Date(invoice.dueDate), "MMM d, yyyy") : "—",
    dateX, y + 13, { align: "right" }
  );
  y += 34;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Description", "Qty", "Unit", "Unit Price", "Total"]],
    body: lineItems.map((item) => [
      item.description,
      String(item.quantity),
      item.unit,
      fmtCAD(item.unitPrice),
      fmtCAD(item.total),
    ]),
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold", cellPadding: 4 },
    bodyStyles: { fontSize: 9, cellPadding: 3.5, textColor: DARK },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
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

  const totalsX = pageW - margin;
  const labelX = totalsX - 40;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("Subtotal", labelX, y, { align: "right" });
  doc.setTextColor(...DARK);
  doc.text(fmtCAD(invoice.subtotal), totalsX, y, { align: "right" });
  y += 6;

  const hstPct = (parseFloat(invoice.taxRate) * 100).toFixed(0);
  doc.setTextColor(...GRAY);
  doc.text(`HST (${hstPct}%)`, labelX, y, { align: "right" });
  doc.setTextColor(...DARK);
  doc.text(fmtCAD(invoice.taxAmount), totalsX, y, { align: "right" });
  y += 4;

  doc.setFillColor(...PRIMARY);
  doc.roundedRect(labelX - 24, y, 24 + totalsX - labelX + 1, 10, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL", labelX - 1, y + 6.5, { align: "right" });
  doc.text(fmtCAD(invoice.total), totalsX - 1, y + 6.5, { align: "right" });
  y += 16;

  if (invoice.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text("NOTES", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(invoice.notes, pageW - margin * 2);
    doc.text(lines, margin, y);
  }

  if (invoice.status === "paid" && invoice.paidAt) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(36);
    doc.setTextColor(34, 197, 94);
    doc.setGState(new (doc as unknown as { GState: new (opts: { opacity: number }) => object }).GState({ opacity: 0.15 }));
    doc.text("PAID", pageW / 2, 160, { align: "center", angle: 30 });
    doc.setGState(new (doc as unknown as { GState: new (opts: { opacity: number }) => object }).GState({ opacity: 1 }));
  }

  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...DARK);
  doc.rect(0, pageH - 12, pageW, 12, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(180, 180, 180);
  doc.text(`Generated by Site Snap · ${invoice.invoiceNumber}`, margin, pageH - 4.5);
  doc.text(format(new Date(), "MMM d, yyyy"), pageW - margin, pageH - 4.5, { align: "right" });

  return doc;
}

async function downloadInvoicePDF(invoice: Invoice, lineItems: LineItem[], companyName: string, templatePath?: string) {
  const templateDataUrl = await loadTemplateDataUrl(templatePath);
  buildPdfDoc(invoice, lineItems, companyName, templateDataUrl).save(`${invoice.invoiceNumber}.pdf`);
}

async function buildPdfBase64(invoice: Invoice, lineItems: LineItem[], companyName: string, templatePath?: string): Promise<string> {
  const templateDataUrl = await loadTemplateDataUrl(templatePath);
  const dataUri = buildPdfDoc(invoice, lineItems, companyName, templateDataUrl).output("datauristring");
  return dataUri.split(",")[1] ?? dataUri;
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = parseInt(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invoice, isLoading } = useGetInvoice(invoiceId);
  const { data: me } = useGetMe();
  const markSent = useMarkInvoiceSent();
  const markPaid = useMarkInvoicePaid();
  const sendEmail = useSendInvoiceEmail();
  const sendReminder = useSendInvoiceReminder();
  const updateInvoice = useUpdateInvoice();

  // Edit state
  const [editedItems, setEditedItems] = useState<LineItem[] | null>(null);
  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const [editedNotes, setEditedNotes] = useState<string | null>(null);
  const [editedDueDate, setEditedDueDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function getCompanyName() {
    return (me as (typeof me & { company?: { name?: string } }) | undefined)?.company?.name ?? "Site Snap";
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId) });
    queryClient.invalidateQueries({ queryKey: getListAllInvoicesQueryKey({}) });
  }

  // Permission logic
  const isWorker = me?.role === "worker";
  const invoiceAny = invoice as (Invoice & { createdByUserId?: number }) | undefined;
  const isCreator = invoiceAny?.createdByUserId === me?.id;
  const canEdit = invoice?.status === "draft" && (!isWorker || isCreator);
  const canDelete = invoice?.status === "draft" && (!isWorker || isCreator);

  // Effective values (edited or from server)
  const effectiveItems: LineItem[] = editedItems ?? ((invoice?.lineItems ?? []) as LineItem[]);
  const effectiveTitle = editedTitle ?? invoice?.title ?? "";
  const effectiveNotes = editedNotes ?? invoice?.notes ?? "";
  const effectiveDueDate = editedDueDate ?? invoice?.dueDate ?? "";
  const taxRate = parseFloat(invoice?.taxRate ?? "0.13");
  const { subtotal, taxAmount, total } = calcTotals(effectiveItems, taxRate);
  const hasUnsavedChanges = editedItems !== null || editedTitle !== null || editedNotes !== null || editedDueDate !== null;

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    const items = effectiveItems.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      updated.total = Math.round(updated.quantity * updated.unitPrice * 100) / 100;
      return updated;
    });
    setEditedItems(items);
  }

  function addItem() {
    setEditedItems([...effectiveItems, { description: "", quantity: 1, unit: "ea", unitPrice: 0, total: 0 }]);
  }

  function removeItem(idx: number) {
    setEditedItems(effectiveItems.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateInvoice.mutateAsync({
        invoiceId,
        data: {
          title: effectiveTitle || undefined,
          notes: effectiveNotes || undefined,
          dueDate: effectiveDueDate || undefined,
          lineItems: effectiveItems,
          subtotal,
          taxRate,
          taxAmount,
          total,
        },
      });
      setEditedItems(null);
      setEditedTitle(null);
      setEditedNotes(null);
      setEditedDueDate(null);
      toast({ title: "Invoice saved" });
      invalidate();
    } catch {
      toast({ title: "Failed to save invoice", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await customFetch(`${BASE}/api/invoices/${invoiceId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: getListAllInvoicesQueryKey({}) });
      toast({ title: "Invoice deleted" });
      setLocation("/invoices");
    } catch {
      toast({ title: "Failed to delete invoice", variant: "destructive" });
    }
  }

  function handleMarkSent() {
    markSent.mutate({ invoiceId }, {
      onSuccess: () => { toast({ title: "Invoice marked as sent" }); invalidate(); },
      onError: () => toast({ title: "Failed to update invoice", variant: "destructive" }),
    });
  }

  function handleMarkPaid() {
    markPaid.mutate({ invoiceId }, {
      onSuccess: () => { toast({ title: "Invoice marked as paid!" }); invalidate(); },
      onError: () => toast({ title: "Failed to update invoice", variant: "destructive" }),
    });
  }

  function getInvoiceTemplatePath(): string | undefined {
    return (me as any)?.company?.invoiceTemplatePath ?? undefined;
  }

  async function handleDownloadPDF() {
    if (!invoice) return;
    await downloadInvoicePDF(invoice as Invoice, effectiveItems, getCompanyName(), getInvoiceTemplatePath());
    toast({ title: "PDF downloaded" });
  }

  function handleDownloadXLSX() {
    if (!invoice) return;
    const wsData = [
      ["Invoice Number", invoice.invoiceNumber],
      ["Title", effectiveTitle || invoice.title],
      ["Client", invoice.clientName],
      ["Client Email", invoice.clientEmail ?? ""],
      ["Status", STATUS_LABELS[invoice.status] ?? invoice.status],
      ["Issue Date", format(new Date(invoice.createdAt), "yyyy-MM-dd")],
      ["Due Date", invoice.dueDate ? format(new Date(invoice.dueDate), "yyyy-MM-dd") : ""],
      [],
      ["Description", "Qty", "Unit", "Unit Price (CAD)", "Total (CAD)"],
      ...effectiveItems.map((item) => [item.description, item.quantity, item.unit, Number(item.unitPrice), Number(item.total)]),
      [],
      ["Subtotal", "", "", "", subtotal],
      [`HST (${(taxRate * 100).toFixed(0)}%)`, "", "", "", taxAmount],
      ["TOTAL CAD", "", "", "", total],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 30 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoice");
    XLSX.writeFile(wb, `${invoice.invoiceNumber}.xlsx`);
    toast({ title: "Excel downloaded" });
  }

  function handleSendReminder() {
    if (!invoice) return;
    if (!invoice.clientEmail) {
      toast({ title: "No client email on this invoice", variant: "destructive" });
      return;
    }
    sendReminder.mutate(
      { invoiceId },
      {
        onSuccess: (result) => {
          if (result.sandboxWarning) {
            toast({
              title: "Sandbox mode — reminder not delivered",
              description: "Verify a domain at resend.com/domains to send to any recipient.",
              variant: "destructive",
            });
          } else {
            toast({ title: `Payment reminder sent to ${invoice.clientEmail}` });
            invalidate();
          }
        },
        onError: () => toast({ title: "Failed to send reminder", variant: "destructive" }),
      }
    );
  }

  async function handleSendEmail() {
    if (!invoice) return;
    if (!invoice.clientEmail) {
      toast({ title: "No client email on this invoice", variant: "destructive" });
      return;
    }
    const pdfBase64 = await buildPdfBase64(invoice as Invoice, effectiveItems, getCompanyName(), getInvoiceTemplatePath());
    sendEmail.mutate(
      { invoiceId, data: { pdfBase64 } },
      {
        onSuccess: (result) => {
          if (result.sandboxWarning) {
            toast({
              title: "Sandbox mode — email not delivered",
              description: "Verify a domain at resend.com/domains to send to any recipient.",
              variant: "destructive",
            });
          } else {
            toast({ title: `Invoice emailed to ${invoice.clientEmail}` });
          }
        },
        onError: () => toast({ title: "Failed to send email", variant: "destructive" }),
      }
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-20">
        <Receipt className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
        <p className="text-lg font-medium">Invoice not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => setLocation("/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Invoices
        </Button>
      </div>
    );
  }

  const hasClientEmail = !!invoice.clientEmail;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <button
            onClick={() => setLocation("/invoices")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Invoices
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{effectiveTitle || invoice.title}</h1>
            <Badge variant="outline" className={STATUS_COLORS[invoice.status]}>
              {STATUS_LABELS[invoice.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {invoice.invoiceNumber} · {invoice.clientName}
            {invoice.clientEmail && ` · ${invoice.clientEmail}`}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {/* Download PDF */}
          <Button variant="outline" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>

          {/* Download Excel */}
          <Button variant="outline" onClick={handleDownloadXLSX}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>

          {/* Send via Email */}
          <Button
            variant="outline"
            onClick={handleSendEmail}
            disabled={sendEmail.isPending || !hasClientEmail}
            title={!hasClientEmail ? "Add a client email to enable sending" : undefined}
          >
            {sendEmail.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Mail className="h-4 w-4 mr-2" />}
            {sendEmail.isPending ? "Sending…" : "Send via Email"}
          </Button>

          {/* Send Reminder */}
          {(invoice.status === "sent" || invoice.status === "overdue" || invoice.status === "draft") && (
            <Button
              variant="outline"
              onClick={handleSendReminder}
              disabled={sendReminder.isPending || !hasClientEmail}
              title={!hasClientEmail ? "Add a client email to send a reminder" : undefined}
            >
              {sendReminder.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Bell className="h-4 w-4 mr-2" />}
              {sendReminder.isPending ? "Sending…" : "Send Reminder"}
            </Button>
          )}

          {/* Save (editable + unsaved) */}
          {canEdit && hasUnsavedChanges && (
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          )}

          {/* Mark Sent */}
          {invoice.status === "draft" && !isWorker && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={markSent.isPending}>
                  <SendHorizonal className="h-4 w-4 mr-2" />
                  Mark Sent
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark invoice as sent?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This confirms you have sent {invoice.invoiceNumber} to {invoice.clientName}. You can still mark it as paid afterward.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleMarkSent}>Mark Sent</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Mark Paid */}
          {(invoice.status === "sent" || invoice.status === "overdue") && !isWorker && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={markPaid.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark Paid
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark invoice as paid?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This confirms payment of {fmtCAD(invoice.total)} CAD has been received from {invoice.clientName}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-green-600 hover:bg-green-700" onClick={handleMarkPaid}>
                    Confirm Payment
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Paid indicator */}
          {invoice.status === "paid" && (
            <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
              <CheckCircle2 className="h-5 w-5" />
              Paid {invoice.paidAt ? format(new Date(invoice.paidAt), "MMM d, yyyy") : ""}
            </div>
          )}

          {/* Delete */}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:border-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this invoice?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete invoice {invoice.invoiceNumber}. This action cannot be undone.
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

      {/* Invoice card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div className="flex-1 space-y-3">
              <CardTitle className="text-base">Invoice Details</CardTitle>

              {/* Editable title */}
              {canEdit ? (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Title</Label>
                  <Input
                    value={effectiveTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    placeholder="Invoice title"
                    className="max-w-sm"
                  />
                </div>
              ) : null}

              {/* Editable due date */}
              {canEdit ? (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Due Date</Label>
                  <Input
                    type="date"
                    value={effectiveDueDate}
                    onChange={(e) => setEditedDueDate(e.target.value)}
                    className="max-w-xs"
                  />
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Issued {format(new Date(invoice.createdAt), "MMMM d, yyyy")}
                  </p>
                  {invoice.dueDate && (
                    <p className="text-sm text-muted-foreground">
                      Due {format(new Date(invoice.dueDate), "MMMM d, yyyy")}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-1">
              {invoice.sentAt && <p>Sent {format(new Date(invoice.sentAt), "MMM d, yyyy")}</p>}
              {invoice.paidAt && <p className="text-green-600 font-medium">Paid {format(new Date(invoice.paidAt), "MMM d, yyyy")}</p>}
              {(invoice as Invoice).reminderSentAt && (
                <p className="text-orange-500">Reminder sent {format(new Date((invoice as Invoice).reminderSentAt!), "MMM d, yyyy")}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />

          {/* Line items */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Description</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-20">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-20">Unit</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-28">Unit Price</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-28">Total</th>
                  {canEdit && <th className="w-10" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {effectiveItems.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2">
                      {canEdit ? (
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          className="h-8 text-sm"
                          placeholder="Description"
                        />
                      ) : item.description}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canEdit ? (
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm text-right w-20 ml-auto"
                          min={0}
                        />
                      ) : item.quantity}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canEdit ? (
                        <Input
                          value={item.unit}
                          onChange={(e) => updateItem(idx, "unit", e.target.value)}
                          className="h-8 text-sm text-right w-20 ml-auto"
                          placeholder="ea"
                        />
                      ) : <span className="text-muted-foreground">{item.unit}</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canEdit ? (
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm text-right w-28 ml-auto"
                          min={0}
                          step={0.01}
                        />
                      ) : fmtCAD(item.unitPrice)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{fmtCAD(item.total)}</td>
                    {canEdit && (
                      <td className="px-2 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(idx)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <div className="mt-2 px-4">
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Item
              </Button>
            </div>
          )}

          <Separator className="my-4" />

          <div className="flex flex-col items-end gap-1.5 text-sm">
            <div className="flex w-52 justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{fmtCAD(subtotal)}</span>
            </div>
            <div className="flex w-52 justify-between">
              <span className="text-muted-foreground">HST ({(taxRate * 100).toFixed(0)}%)</span>
              <span>{fmtCAD(taxAmount)}</span>
            </div>
            <Separator className="w-52 my-1" />
            <div className="flex w-52 justify-between font-bold text-base">
              <span>Total</span>
              <span>{fmtCAD(total)}</span>
            </div>
          </div>

          {/* Notes */}
          <Separator className="my-4" />
          {canEdit ? (
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Notes</Label>
              <Textarea
                value={effectiveNotes}
                onChange={(e) => setEditedNotes(e.target.value)}
                placeholder="Optional notes for this invoice…"
                rows={3}
                className="resize-none"
              />
            </div>
          ) : invoice.notes ? (
            <div>
              <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
