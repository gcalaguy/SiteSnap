import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListQuotes,
  useCreateQuote,
  useSubmitQuoteForApproval,
  useApproveQuote,
  useRejectQuote,
  useConvertQuoteToInvoice,
  useGenerateQuoteAI,
  getListQuotesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Mic,
  MicOff,
  Sparkles,
  Plus,
  Loader2,
  FileText,
  ChevronRight,
  CheckCircle2,
  Send,
  Receipt,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  converted: "Invoiced",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  pending_approval: "bg-yellow-50 text-yellow-700 border-yellow-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  converted: "bg-blue-50 text-blue-700 border-blue-200",
};

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; total: number };

function fmtCAD(v: number | string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

export default function QuotesTab({ projectId }: { projectId: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quotes, isLoading, refetch } = useListQuotes(projectId);

  const createQuote = useCreateQuote();
  const submitQuote = useSubmitQuoteForApproval();
  const approveQuote = useApproveQuote();
  const rejectQuote = useRejectQuote();
  const convertQuote = useConvertQuoteToInvoice();
  const generateAI = useGenerateQuoteAI();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"input" | "preview" | "done">("input");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [aiResult, setAiResult] = useState<{ title?: string; lineItems?: LineItem[]; notes?: string } | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey(projectId) });
    refetch();
  }

  function openDialog() {
    setOpen(true);
    setStep("input");
    setClientName("");
    setDescription("");
    setAiResult(null);
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
            if (data.text) setDescription((prev) => (prev ? `${prev} ${data.text}` : data.text));
            toast({ title: "Voice transcribed", description: "Review and tap Generate." });
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

  async function handleGenerate() {
    if (!description.trim()) {
      toast({ title: "Describe the job first — type or record your voice", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    try {
      const result = await generateAI.mutateAsync({
        data: { voiceInput: description, clientName: clientName || undefined },
      });
      setAiResult(result as { title?: string; lineItems?: LineItem[]; notes?: string });
      setStep("preview");
    } catch {
      toast({ title: "AI generation failed", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  async function handleCreate() {
    if (!aiResult) return;
    setCreating(true);
    try {
      const items = (aiResult.lineItems ?? []) as LineItem[];
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const taxAmount = Math.round(subtotal * 0.13 * 100) / 100;
      const total = subtotal + taxAmount;
      const created = await createQuote.mutateAsync({
        projectId,
        data: {
          title: aiResult.title ?? "New Quote",
          clientName: clientName || "Client",
          lineItems: items,
          subtotal,
          taxRate: 0.13,
          taxAmount,
          total,
          voiceInput: description || undefined,
        },
      });
      invalidate();
      setOpen(false);
      toast({ title: "Quote created!", description: `${created.quoteNumber} saved as draft.` });
    } catch {
      toast({ title: "Failed to create quote", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleSubmit(q: { id: number }) {
    setActionLoading((p) => ({ ...p, [q.id]: "submit" }));
    try {
      await submitQuote.mutateAsync({ projectId, quoteId: q.id });
      invalidate();
      toast({ title: "Submitted for approval" });
    } catch {
      toast({ title: "Failed to submit", variant: "destructive" });
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[q.id]; return n; });
    }
  }

  async function handleApprove(q: { id: number }) {
    setActionLoading((p) => ({ ...p, [q.id]: "approve" }));
    try {
      await approveQuote.mutateAsync({ projectId, quoteId: q.id });
      invalidate();
      toast({ title: "Quote approved!" });
    } catch {
      toast({ title: "Failed to approve", variant: "destructive" });
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[q.id]; return n; });
    }
  }

  async function handleReject(q: { id: number }) {
    setActionLoading((p) => ({ ...p, [q.id]: "reject" }));
    try {
      await rejectQuote.mutateAsync({ projectId, quoteId: q.id, data: {} });
      invalidate();
      toast({ title: "Quote rejected" });
    } catch {
      toast({ title: "Failed to reject", variant: "destructive" });
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[q.id]; return n; });
    }
  }

  async function handleConvert(q: { id: number }) {
    setActionLoading((p) => ({ ...p, [q.id]: "convert" }));
    try {
      const inv = await convertQuote.mutateAsync({ projectId, quoteId: q.id, data: {} });
      invalidate();
      toast({ title: "Invoice created!", description: `Redirecting to invoice…` });
      setTimeout(() => setLocation(`/invoices/${inv.id}`), 600);
    } catch {
      toast({ title: "Failed to convert", variant: "destructive" });
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[q.id]; return n; });
    }
  }

  const lineItems = (aiResult?.lineItems ?? []) as LineItem[];
  const subtotal = lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * 0.13 * 100) / 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Quotes</h2>
          <p className="text-sm text-muted-foreground">Create quotes on-site using your voice</p>
        </div>
        <Button onClick={openDialog} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
          <Mic className="h-4 w-4" />
          New Voice Quote
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : !quotes?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Mic className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-semibold text-foreground">No quotes yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-xs">
              Describe the job by voice on-site — AI fills in materials, quantities, and pricing automatically.
            </p>
            <Button onClick={openDialog} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
              <Mic className="h-4 w-4" />
              Create First Quote by Voice
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map((q) => {
            const busy = actionLoading[q.id];
            return (
              <Card key={q.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-semibold text-foreground truncate">{q.title}</span>
                        <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLORS[q.status]}`}>
                          {STATUS_LABELS[q.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{q.quoteNumber} · {q.clientName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(q.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-foreground text-sm">{fmtCAD(q.total)}</p>
                      <p className="text-xs text-muted-foreground">incl. HST</p>
                    </div>
                  </div>

                  {/* Approval workflow action bar */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
                    {/* Always: View full detail */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1 text-muted-foreground h-7"
                      onClick={() => setLocation(`/quotes/${q.id}`)}
                    >
                      Edit / View <ChevronRight className="h-3 w-3" />
                    </Button>

                    <div className="flex-1" />

                    {/* Draft: submit for approval */}
                    {q.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 h-7 border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                        disabled={!!busy}
                        onClick={() => handleSubmit(q)}
                      >
                        {busy === "submit" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Submit for Approval
                      </Button>
                    )}

                    {/* Pending: approve or reject */}
                    {q.status === "pending_approval" && (
                      <>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-xs gap-1 h-7 border-red-200 text-red-600 hover:bg-red-50" disabled={!!busy}>
                              <XCircle className="h-3 w-3" />
                              Reject
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reject this quote?</AlertDialogTitle>
                              <AlertDialogDescription>The quote will be sent back to draft for revisions.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleReject(q)} className="bg-red-600 hover:bg-red-700">Reject</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <Button
                          size="sm"
                          className="text-xs gap-1 h-7 bg-green-600 hover:bg-green-700 text-white"
                          disabled={!!busy}
                          onClick={() => handleApprove(q)}
                        >
                          {busy === "approve" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Approve
                        </Button>
                      </>
                    )}

                    {/* Rejected: re-submit after edits */}
                    {q.status === "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 h-7 border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                        disabled={!!busy}
                        onClick={() => handleSubmit(q)}
                      >
                        {busy === "submit" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Re-submit
                      </Button>
                    )}

                    {/* Approved: one-click convert to invoice */}
                    {q.status === "approved" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            className="text-xs gap-1 h-7 bg-primary hover:bg-primary/90 text-primary-foreground"
                            disabled={!!busy}
                          >
                            {busy === "convert" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Receipt className="h-3 w-3" />}
                            Convert to Invoice
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Convert to Invoice?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will create an invoice from the approved quote. The quote will be marked as invoiced.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleConvert(q)} className="bg-primary hover:bg-primary/90">
                              Create Invoice
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {/* Converted: link to invoice */}
                    {q.status === "converted" && (
                      <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                        <Receipt className="h-3 w-3" /> Invoice created
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Voice Quote Creation Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              {step === "input" ? "New Voice Quote" : "AI-Generated Quote Preview"}
            </DialogTitle>
          </DialogHeader>

          {step === "input" ? (
            <div className="space-y-4 py-2">
              {/* Progress indicator */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">1</span>
                <span className="text-foreground font-medium">Describe the job</span>
                <ArrowRight className="h-3 w-3" />
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">2</span>
                <span>AI fills materials & pricing</span>
                <ArrowRight className="h-3 w-3" />
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">3</span>
                <span>Create quote</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client">Client Name</Label>
                <Input
                  id="client"
                  placeholder="e.g. Smith Residence"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Job Description</Label>
                <div className="relative">
                  <textarea
                    className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="e.g. Install 200 sq ft of hardwood flooring in master bedroom, supply and install baseboards, patch and paint two walls…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Type above or record your voice on-site</p>
              </div>

              {/* Voice record button */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex flex-col items-center gap-2 px-6 py-4 rounded-xl border-2 transition-all ${
                    isRecording
                      ? "border-red-500 bg-red-50 text-red-600"
                      : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                  }`}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${isRecording ? "bg-red-500 animate-pulse" : "bg-primary"}`}>
                    {isRecording ? <MicOff className="h-6 w-6 text-white" /> : <Mic className="h-6 w-6 text-white" />}
                  </div>
                  <span className="text-sm font-medium">
                    {isRecording ? "Tap to stop recording…" : "Tap to record voice"}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Progress indicator */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-[10px]">✓</span>
                <span>Job described</span>
                <ArrowRight className="h-3 w-3" />
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">2</span>
                <span className="text-foreground font-medium">AI preview</span>
                <ArrowRight className="h-3 w-3" />
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">3</span>
                <span>Create quote</span>
              </div>

              {aiResult && (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Quote Title</p>
                    <p className="font-semibold text-foreground">{aiResult.title}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Line Items (AI-generated)</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground w-16">Qty</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Unit Price</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {lineItems.map((item, i) => (
                            <tr key={i} className="hover:bg-muted/30">
                              <td className="px-3 py-2">{item.description}</td>
                              <td className="px-3 py-2 text-right">{item.quantity} {item.unit}</td>
                              <td className="px-3 py-2 text-right">{fmtCAD(item.unitPrice)}</td>
                              <td className="px-3 py-2 text-right font-medium">{fmtCAD(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-muted/30 border-t border-border">
                          <tr>
                            <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground text-xs">Subtotal</td>
                            <td className="px-3 py-2 text-right font-medium">{fmtCAD(subtotal)}</td>
                          </tr>
                          <tr>
                            <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground text-xs">HST (13%)</td>
                            <td className="px-3 py-2 text-right font-medium">{fmtCAD(taxAmount)}</td>
                          </tr>
                          <tr>
                            <td colSpan={3} className="px-3 py-2 text-right font-semibold text-foreground">Total CAD</td>
                            <td className="px-3 py-2 text-right font-bold text-primary">{fmtCAD(subtotal + taxAmount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-primary" />
                      AI-suggested pricing — you can edit line items after creating the quote
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {step === "input" ? (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleGenerate}
                  disabled={aiLoading || !description.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {aiLoading ? "AI generating…" : "Generate with AI"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep("input")}>Back</Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {creating ? "Creating…" : "Create Quote"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
