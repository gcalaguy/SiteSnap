import { useParams, useLocation } from "wouter";
import { useGetInvoice, useMarkInvoiceSent, useMarkInvoicePaid, useGetMe, useSendInvoiceEmail, useSendInvoiceReminder } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, SendHorizonal, CheckCircle2, Receipt, Download, Mail, Loader2, Bell } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getGetInvoiceQueryKey, getListAllInvoicesQueryKey } from "@workspace/api-client-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
}

// Shared PDF builder — returns a jsPDF instance without saving
function buildPdfDoc(invoice: Invoice, lineItems: LineItem[], companyName: string): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  const PRIMARY = [255, 102, 0] as [number, number, number];
  const DARK = [23, 32, 52] as [number, number, number];
  const GRAY = [100, 100, 100] as [number, number, number];
  const LIGHT_GRAY = [245, 245, 245] as [number, number, number];
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageW, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(companyName, margin, 13);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 220, 180);
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

  let y = 38;

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
  doc.text(`Generated by BuildCore · ${invoice.invoiceNumber}`, margin, pageH - 4.5);
  doc.text(format(new Date(), "MMM d, yyyy"), pageW - margin, pageH - 4.5, { align: "right" });

  return doc;
}

function downloadInvoicePDF(invoice: Invoice, lineItems: LineItem[], companyName: string) {
  buildPdfDoc(invoice, lineItems, companyName).save(`${invoice.invoiceNumber}.pdf`);
}

function buildPdfBase64(invoice: Invoice, lineItems: LineItem[], companyName: string): string {
  // output("datauristring") returns "data:application/pdf;base64,<b64>" — strip the prefix
  const dataUri = buildPdfDoc(invoice, lineItems, companyName).output("datauristring");
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

  function getCompanyName() {
    return (me as (typeof me & { company?: { name?: string } }) | undefined)?.company?.name ?? "BuildCore";
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId) });
    queryClient.invalidateQueries({ queryKey: getListAllInvoicesQueryKey({}) });
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

  function handleDownloadPDF() {
    if (!invoice) return;
    downloadInvoicePDF(invoice as Invoice, (invoice.lineItems ?? []) as LineItem[], getCompanyName());
    toast({ title: "PDF downloaded" });
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

  function handleSendEmail() {
    if (!invoice) return;
    if (!invoice.clientEmail) {
      toast({ title: "No client email on this invoice", variant: "destructive" });
      return;
    }
    const pdfBase64 = buildPdfBase64(
      invoice as Invoice,
      (invoice.lineItems ?? []) as LineItem[],
      getCompanyName()
    );
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

  const lineItems = (invoice.lineItems ?? []) as LineItem[];
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
            <h1 className="text-2xl font-bold text-foreground">{invoice.title}</h1>
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
            Download PDF
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

          {/* Send Reminder — only for unpaid sent/overdue invoices */}
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

          {invoice.status === "draft" && (
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
          {(invoice.status === "sent" || invoice.status === "overdue") && (
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
          {invoice.status === "paid" && (
            <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
              <CheckCircle2 className="h-5 w-5" />
              Paid {invoice.paidAt ? format(new Date(invoice.paidAt), "MMM d, yyyy") : ""}
            </div>
          )}
        </div>
      </div>

      {/* Invoice card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <CardTitle className="text-lg">Invoice Details</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Issued {format(new Date(invoice.createdAt), "MMMM d, yyyy")}
              </p>
              {invoice.dueDate && (
                <p className="text-sm text-muted-foreground">
                  Due {format(new Date(invoice.dueDate), "MMMM d, yyyy")}
                </p>
              )}
            </div>
            <div className="text-right">
              {invoice.sentAt && (
                <p className="text-xs text-muted-foreground">
                  Sent {format(new Date(invoice.sentAt), "MMM d, yyyy")}
                </p>
              )}
              {invoice.paidAt && (
                <p className="text-xs text-green-600 font-medium">
                  Paid {format(new Date(invoice.paidAt), "MMM d, yyyy")}
                </p>
              )}
              {(invoice as Invoice).reminderSentAt && (
                <p className="text-xs text-orange-500">
                  Reminder sent {format(new Date((invoice as Invoice).reminderSentAt!), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="text-left pb-3 font-medium">Description</th>
                  <th className="text-right pb-3 font-medium">Qty</th>
                  <th className="text-right pb-3 font-medium">Unit</th>
                  <th className="text-right pb-3 font-medium">Unit Price</th>
                  <th className="text-right pb-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-3 pr-4">{item.description}</td>
                    <td className="py-3 text-right">{item.quantity}</td>
                    <td className="py-3 text-right text-muted-foreground">{item.unit}</td>
                    <td className="py-3 text-right">{fmtCAD(item.unitPrice)}</td>
                    <td className="py-3 text-right font-medium">{fmtCAD(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Separator className="my-4" />

          <div className="flex flex-col items-end gap-1.5 text-sm">
            <div className="flex w-52 justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{fmtCAD(invoice.subtotal)}</span>
            </div>
            <div className="flex w-52 justify-between">
              <span className="text-muted-foreground">HST ({(parseFloat(invoice.taxRate) * 100).toFixed(0)}%)</span>
              <span>{fmtCAD(invoice.taxAmount)}</span>
            </div>
            <Separator className="w-52 my-1" />
            <div className="flex w-52 justify-between font-bold text-base">
              <span>Total</span>
              <span>{fmtCAD(invoice.total)}</span>
            </div>
          </div>

          {invoice.notes && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground mb-1">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
