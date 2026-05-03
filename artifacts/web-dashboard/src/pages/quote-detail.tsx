import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useUpdateQuote,
  useSubmitQuoteForApproval,
  useApproveQuote,
  useRejectQuote,
  useConvertQuoteToInvoice,
  useGenerateQuoteAI,
  getListAllQuotesQueryKey,
  customFetch,
  type Quote,
} from "@workspace/api-client-react";
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
import {
  ArrowLeft,
  Sparkles,
  Mic,
  MicOff,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Receipt,
  Save,
  Loader2,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  converted: "Converted to Invoice",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  pending_approval: "bg-yellow-50 text-yellow-700 border-yellow-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  converted: "bg-blue-50 text-blue-700 border-blue-200",
};

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; total: number };

function calcTotals(items: LineItem[], taxRate = 0.13) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

type QuoteForExport = { quoteNumber: string; title: string; clientName: string; clientEmail?: string | null; status: string; createdAt: string; validUntil?: string | null; lineItems?: unknown; taxRate: string; subtotal: string; taxAmount: string; total: string };

function downloadQuoteXLSX(quote: QuoteForExport) {
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
  XLSX.writeFile(wb, `${quote.quoteNumber}.xlsx`);
}

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const quoteId = parseInt(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use a direct fetch so the query always fires regardless of projectId.
  // The backend GET /projects/0/quotes/:id resolves by companyId when projectId=0.
  const { data: quote, isLoading } = useQuery<Quote>({
    queryKey: [`/api/projects/0/quotes/${quoteId}`],
    queryFn: () => customFetch<Quote>(`/api/projects/0/quotes/${quoteId}`),
    enabled: !!quoteId,
  });
  // Use the real projectId from the loaded quote for all mutations
  const realProjectId = quote?.projectId ?? 0;
  const updateQuote = useUpdateQuote();
  const submitQuote = useSubmitQuoteForApproval();
  const approveQuote = useApproveQuote();
  const rejectQuote = useRejectQuote();
  const convertQuote = useConvertQuoteToInvoice();
  const generateAI = useGenerateQuoteAI();

  const [voiceText, setVoiceText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const fmtCAD = (v: number) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(v);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: [`/api/projects/0/quotes/${quoteId}`] });
    queryClient.invalidateQueries({ queryKey: getListAllQuotesQueryKey({}) });
  }

  const effectiveItems: LineItem[] = lineItems ?? ((quote?.lineItems ?? []) as LineItem[]);
  const effectiveTitle = title ?? quote?.title ?? "";
  const effectiveNotes = notes ?? quote?.notes ?? "";
  const taxRate = parseFloat(quote?.taxRate ?? "0.13");
  const { subtotal, taxAmount, total } = calcTotals(effectiveItems, taxRate);

  const isEditable = quote?.status === "draft" || quote?.status === "rejected";

  async function handleAIFill() {
    if (!voiceText.trim()) { toast({ title: "Enter a job description first", variant: "destructive" }); return; }
    setAiLoading(true);
    try {
      const result = await generateAI.mutateAsync({
        data: { voiceInput: voiceText, projectName: undefined, clientName: quote?.clientName ?? undefined },
      });
      if (result.lineItems) setLineItems(result.lineItems as LineItem[]);
      if (result.title && !title) setTitle(result.title);
      if (result.notes) setNotes(result.notes);
      toast({ title: "AI quote generated", description: "Review and adjust the line items below." });
    } catch {
      toast({ title: "AI generation failed", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            const resp = await fetch(`${import.meta.env.BASE_URL}api/ai/transcribe`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: base64 }),
            });
            const data = await resp.json();
            if (data.text) setVoiceText(data.text);
          } catch {
            toast({ title: "Transcription failed", variant: "destructive" });
          }
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      setIsRecording(true);
    } catch {
      toast({ title: "Microphone access denied", variant: "destructive" });
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setIsRecording(false);
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
      onSuccess: () => { toast({ title: "Quote submitted for approval" }); invalidate(); },
      onError: () => toast({ title: "Submission failed", variant: "destructive" }),
    });
  }

  function handleApprove() {
    approveQuote.mutate({ projectId: realProjectId, quoteId }, {
      onSuccess: () => { toast({ title: "Quote approved!" }); invalidate(); },
      onError: () => toast({ title: "Approval failed", variant: "destructive" }),
    });
  }

  function handleReject() {
    rejectQuote.mutate({ projectId: realProjectId, quoteId, data: {} }, {
      onSuccess: () => { toast({ title: "Quote rejected" }); invalidate(); },
      onError: () => toast({ title: "Rejection failed", variant: "destructive" }),
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
        <Button variant="ghost" className="mt-4" onClick={() => setLocation("/quotes")}>
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
            onClick={() => setLocation("/quotes")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Quotes
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
          <Button variant="outline" onClick={() => {
            if (!quote) return;
            import("jspdf").then(({ default: jsPDF }) =>
              import("jspdf-autotable").then(({ default: autoTable }) => {
                const items = (quote.lineItems ?? []) as { description: string; quantity: number; unit: string; unitPrice: number; total: number }[];
                const fmtC = (v: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(v);
                const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
                const PRIMARY: [number, number, number] = [255, 102, 0];
                const DARK: [number, number, number] = [23, 32, 52];
                const pageW = doc.internal.pageSize.getWidth();
                const margin = 18;
                doc.setFillColor(...PRIMARY); doc.rect(0, 0, pageW, 28, "F");
                doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(255, 255, 255);
                doc.text("Site Snap", margin, 13);
                doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(255, 220, 180);
                doc.text("QUOTE", pageW - margin, 10, { align: "right" });
                doc.setFontSize(14); doc.setFont("helvetica", "bold");
                doc.text(quote.quoteNumber, pageW - margin, 19, { align: "right" });
                let y = 38;
                doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...DARK);
                doc.text(quote.title, margin, y); y += 10;
                doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
                doc.text(`Client: ${quote.clientName}`, margin, y); y += 6;
                autoTable(doc, {
                  startY: y, margin: { left: margin, right: margin },
                  head: [["Description", "Qty", "Unit", "Unit Price", "Total"]],
                  body: items.map((i) => [i.description, i.quantity, i.unit, fmtC(i.unitPrice), fmtC(i.total)]),
                  headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold", cellPadding: 4 },
                  bodyStyles: { fontSize: 9, cellPadding: 3.5, textColor: DARK },
                  alternateRowStyles: { fillColor: [245, 245, 245] as [number, number, number] },
                  columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "right", cellWidth: 16 }, 2: { halign: "right", cellWidth: 18 }, 3: { halign: "right", cellWidth: 30 }, 4: { halign: "right", cellWidth: 30 } },
                });
                const taxRate = parseFloat(quote.taxRate ?? "0.13");
                const sub = items.reduce((s, i) => s + i.total, 0);
                const tax = Math.round(sub * taxRate * 100) / 100;
                const tot = sub + tax;
                y = (doc as any).lastAutoTable.finalY + 6;
                const tx = pageW - margin;
                doc.setFontSize(9); doc.setTextColor(100, 100, 100);
                doc.text("Subtotal", tx - 40, y, { align: "right" }); doc.setTextColor(...DARK); doc.text(fmtC(sub), tx, y, { align: "right" }); y += 6;
                doc.setTextColor(100, 100, 100); doc.text(`HST (${(taxRate * 100).toFixed(0)}%)`, tx - 40, y, { align: "right" }); doc.setTextColor(...DARK); doc.text(fmtC(tax), tx, y, { align: "right" }); y += 4;
                doc.setFillColor(...PRIMARY); doc.roundedRect(tx - 64, y, 65, 10, 1.5, 1.5, "F");
                doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
                doc.text("TOTAL", tx - 41, y + 6.5, { align: "right" }); doc.text(fmtC(tot), tx - 1, y + 6.5, { align: "right" });
                doc.save(`${quote.quoteNumber}.pdf`);
              })
            );
            toast({ title: "PDF downloaded" });
          }}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>

          {/* Download Excel */}
          <Button variant="outline" onClick={() => {
            if (quote) { downloadQuoteXLSX(quote as QuoteForExport); toast({ title: "Excel downloaded" }); }
          }}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>

          {isEditable && hasUnsavedChanges && (
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          )}
          {isEditable && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={submitQuote.isPending}>
                  <Send className="h-4 w-4 mr-2" />
                  Submit for Approval
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit quote for approval?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will move the quote to pending approval status. Make sure all line items and totals are correct.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSubmit}>Submit</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {quote.status === "pending_approval" && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={rejectQuote.isPending}>
                    <XCircle className="h-4 w-4 mr-2" /> Reject
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject this quote?</AlertDialogTitle>
                    <AlertDialogDescription>The quote will be returned to draft status for revision.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleReject}>Reject</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={approveQuote.isPending}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve this quote?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The quote will be approved and ready to convert to an invoice.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-green-600 hover:bg-green-700" onClick={handleApprove}>Approve</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
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
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              rows={3}
              className="resize-none bg-background"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={isRecording ? stopRecording : startRecording}
                className={isRecording ? "border-red-300 text-red-600 hover:bg-red-50" : ""}
              >
                {isRecording ? (
                  <><MicOff className="h-4 w-4 mr-2" /> Stop Recording</>
                ) : (
                  <><Mic className="h-4 w-4 mr-2" /> Voice Input</>
                )}
              </Button>
              <Button
                size="sm"
                onClick={handleAIFill}
                disabled={aiLoading || !voiceText.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {aiLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Fill with AI</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quote body */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Title + notes */}
          {isEditable && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quote Title</Label>
                <Input
                  value={effectiveTitle}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Foundation Concrete Work"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Line Items</p>
              {isEditable && (
                <Button variant="ghost" size="sm" onClick={addItem} className="h-7 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b">
                    <th className="text-left pb-3 font-medium min-w-[200px]">Description</th>
                    <th className="text-right pb-3 font-medium w-20">Qty</th>
                    <th className="text-right pb-3 font-medium w-20">Unit</th>
                    <th className="text-right pb-3 font-medium w-28">Unit Price</th>
                    <th className="text-right pb-3 font-medium w-28">Total</th>
                    {isEditable && <th className="w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {effectiveItems.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {isEditable ? (
                        <>
                          <td className="py-2 pr-2">
                            <Input
                              value={item.description}
                              onChange={(e) => updateItem(i, "description", e.target.value)}
                              className="h-8 text-sm"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(i, "quantity", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm text-right w-20"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <Input
                              value={item.unit}
                              onChange={(e) => updateItem(i, "unit", e.target.value)}
                              className="h-8 text-sm text-right w-20"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <Input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm text-right w-28"
                            />
                          </td>
                          <td className="py-2 pl-2 text-right font-medium w-28">{fmtCAD(item.total)}</td>
                          <td className="py-2 pl-2">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => removeItem(i)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 pr-4">{item.description}</td>
                          <td className="py-3 text-right">{item.quantity}</td>
                          <td className="py-3 text-right text-muted-foreground">{item.unit}</td>
                          <td className="py-3 text-right">{fmtCAD(item.unitPrice)}</td>
                          <td className="py-3 text-right font-medium">{fmtCAD(item.total)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {effectiveItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                        No line items yet. Use AI fill or add items manually.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          {/* Totals */}
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
          {isEditable ? (
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes / Exclusions</Label>
              <Textarea
                value={effectiveNotes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Scope clarifications, assumptions, or exclusions..."
                rows={3}
                className="resize-none mt-1"
              />
            </div>
          ) : quote.notes ? (
            <div>
              <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{quote.notes}</p>
            </div>
          ) : null}

          {/* Valid until */}
          {quote.validUntil && (
            <p className="text-sm text-muted-foreground">
              Valid until {format(new Date(quote.validUntil), "MMMM d, yyyy")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Approval history */}
      {(quote.approvedAt || quote.convertedAt) && (
        <Card>
          <CardContent className="pt-4 pb-4 text-sm space-y-1 text-muted-foreground">
            {quote.approvedAt && (
              <p>Approved on {format(new Date(quote.approvedAt), "MMMM d, yyyy 'at' h:mm a")}</p>
            )}
            {quote.convertedAt && (
              <p>Converted to invoice on {format(new Date(quote.convertedAt), "MMMM d, yyyy")}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
