import { useState, useCallback, useRef } from "react";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAiErrorMessage } from "@/hooks/useApiError";
import { useSignedDownload } from "@/hooks/useSignedUrl";
import {
  Upload, FileText, Image, Trash2, Sparkles, Download,
  Loader2, ChevronDown, ChevronUp, AlertCircle, CheckCircle,
  Clock, UserCircle, Search, MessageSquare, X, Send, BookOpen,
  DollarSign, ArrowRight, CheckCheck, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
type DocStatus = "pending" | "processing" | "processing_ocr" | "ready" | "failed";

type ClientUpload = {
  id: number; projectId: number; portalTokenId: number;
  filename: string; fileType: string; objectPath: string;
  fileSize: number | null; createdAt: string;
};

type ProjectDoc = {
  id: number; projectId: number; filename: string; fileType: string;
  objectPath: string; fileSize: number | null; status: DocStatus;
  extractedData: Record<string, unknown> | null;
  aiSummary: string | null; extractedText: string | null; createdAt: string;
  chunkCount?: number;
};

type ExtractedFields = {
  documentType?: string; summary?: string; confidence?: string;
  ocrText?: string;
  extractedData?: {
    vendor?: string | null; amount?: number | null; currency?: string | null;
    date?: string | null; items?: { description: string; quantity: string; unitPrice: string; total: string }[];
    projectReference?: string | null; invoiceNumber?: string | null; notes?: string | null;
    version?: string | null;
  };
};

type SearchResult = ProjectDoc & { relevance: "high" | "medium" | "low"; reason: string; semantic?: boolean };
type SearchResponse = { results: SearchResult[]; answer: string; semantic?: boolean };
type QACitation = { id: number; filename: string; excerpt?: string };
type QAResponse = { answer: string; citations: QACitation[]; ragEnabled?: boolean; hasChunks?: boolean; hasAnalyzedDocsWithNoChunks?: boolean };

// ─── Constants ────────────────────────────────────────────────────────────────
const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic"];

const RELEVANCE_COLOR: Record<string, string> = {
  high: "bg-green-100 text-green-700 border-green-300",
  medium: "bg-amber-100 text-amber-700 border-amber-300",
  low: "bg-slate-100 text-slate-600 border-slate-300",
};

const CATEGORY_LABELS: Record<string, string> = {
  materials: "Materials",
  labour: "Labour",
  equipment: "Equipment",
  other: "Other",
};

// ─── Helper components ────────────────────────────────────────────────────────
function statusBadge(status: DocStatus) {
  switch (status) {
    case "pending":          return <Badge variant="outline" className="gap-1 text-xs"><Clock className="h-3 w-3" />Pending</Badge>;
    case "processing":       return <Badge variant="outline" className="gap-1 text-xs border-amber-400 text-amber-700"><Loader2 className="h-3 w-3 animate-spin" />Analyzing…</Badge>;
    case "processing_ocr":   return <Badge variant="outline" className="gap-1 text-xs border-blue-400 text-blue-700"><Loader2 className="h-3 w-3 animate-spin" />Performing OCR Analysis…</Badge>;
    case "ready":            return <Badge variant="outline" className="gap-1 text-xs border-green-500 text-green-700"><CheckCircle className="h-3 w-3" />Analyzed</Badge>;
    case "failed":           return <Badge variant="outline" className="gap-1 text-xs border-red-400 text-red-600"><AlertCircle className="h-3 w-3" />Failed</Badge>;
  }
}

function FileIcon({ fileType }: { fileType: string }) {
  if (IMAGE_TYPES.includes(fileType.toLowerCase())) return <Image className="h-5 w-5 text-blue-500 shrink-0" />;
  if (fileType === "application/pdf") return <FileText className="h-5 w-5 text-red-500 shrink-0" />;
  return <FileText className="h-5 w-5 text-muted-foreground shrink-0" />;
}

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Push to Costs Panel ──────────────────────────────────────────────────────
function PushToCostsPanel({
  doc, projectId, fields,
}: {
  doc: ProjectDoc;
  projectId: number;
  fields: NonNullable<ExtractedFields["extractedData"]>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"materials" | "labour" | "equipment" | "other">("materials");
  const [pushed, setPushed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!fields.amount || fields.amount <= 0) return null;
  const currency = fields.currency ?? "CAD";

  async function handlePush() {
    setLoading(true);
    try {
      await customFetch(`/api/projects/${projectId}/documents/${doc.id}/push-to-costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      setPushed(true);
      setOpen(false);
      toast({
        title: "Added to Cost Tracking",
        description: `${currency}$${fields.amount!.toLocaleString()} added as ${CATEGORY_LABELS[category]} cost.`,
      });
    } catch (err) {
      toast({ title: "Failed to push cost", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      {pushed ? (
        <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium py-1">
          <CheckCheck className="h-3.5 w-3.5" />
          Added to Cost Tracking
        </div>
      ) : !open ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50"
          onClick={() => setOpen(true)}
        >
          <DollarSign className="h-3 w-3" />
          Push to Costs
          <span className="font-semibold">{currency}${fields.amount!.toLocaleString()}</span>
        </Button>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Push {currency}${fields.amount!.toLocaleString()} to Cost Tracking
            </span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Cost Category</p>
            <div className="flex flex-wrap gap-1.5">
              {(["materials", "labour", "equipment", "other"] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                    category === cat
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {fields.vendor && (
            <p className="text-[10px] text-muted-foreground">
              Vendor: <span className="font-medium text-foreground">{fields.vendor}</span>
              {fields.date && <> · Date: <span className="font-medium text-foreground">{fields.date.slice(0, 10)}</span></>}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handlePush}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
              Confirm
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Extracted Data Panel ─────────────────────────────────────────────────────
function ExtractedDataPanel({ doc, projectId }: { doc: ProjectDoc; projectId: number }) {
  const [open, setOpen] = useState(false);
  if (doc.status !== "ready" || !doc.extractedData) return null;

  const data = doc.extractedData as ExtractedFields;
  const fields = data.extractedData ?? {};

  return (
    <div className="mt-2 border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-2.5 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">{data.documentType ?? "AI Analysis"}</span>
          {data.confidence && (
            <span className="text-[10px] text-muted-foreground font-normal">({data.confidence} confidence)</span>
          )}
          {fields.amount != null && fields.amount > 0 && (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
              {fields.currency ?? "CAD"}${fields.amount.toLocaleString()}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="p-3 space-y-3 text-sm bg-muted/10">
          {doc.aiSummary && (
            <p className="text-xs text-muted-foreground italic leading-relaxed">{doc.aiSummary}</p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {fields.vendor && <div><p className="text-[10px] text-muted-foreground">Vendor</p><p className="text-xs font-medium">{fields.vendor}</p></div>}
            {fields.amount != null && <div><p className="text-[10px] text-muted-foreground">Amount</p><p className="text-xs font-medium">{fields.currency ?? ""}${fields.amount.toLocaleString()}</p></div>}
            {fields.date && <div><p className="text-[10px] text-muted-foreground">Date</p><p className="text-xs font-medium">{fields.date}</p></div>}
            {fields.invoiceNumber && <div><p className="text-[10px] text-muted-foreground">Invoice #</p><p className="text-xs font-medium">{fields.invoiceNumber}</p></div>}
            {fields.projectReference && <div><p className="text-[10px] text-muted-foreground">Project Ref</p><p className="text-xs font-medium">{fields.projectReference}</p></div>}
            {fields.version && <div><p className="text-[10px] text-muted-foreground">Version</p><p className="text-xs font-medium">{fields.version}</p></div>}
          </div>
          {fields.items && fields.items.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 font-semibold uppercase tracking-wide">Line Items</p>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-1.5 text-left font-medium">Description</th>
                      <th className="p-1.5 text-right font-medium">Qty</th>
                      <th className="p-1.5 text-right font-medium">Unit</th>
                      <th className="p-1.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.items.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-1.5">{item.description}</td>
                        <td className="p-1.5 text-right">{item.quantity}</td>
                        <td className="p-1.5 text-right">{item.unitPrice}</td>
                        <td className="p-1.5 text-right font-medium">{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {data.ocrText && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 font-semibold uppercase tracking-wide">Extracted Text (OCR)</p>
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono bg-muted/30 rounded p-2 max-h-32 overflow-y-auto leading-relaxed">{data.ocrText}</pre>
            </div>
          )}
          {fields.notes && <div><p className="text-[10px] text-muted-foreground mb-1">Notes</p><p className="text-xs">{fields.notes}</p></div>}

          <PushToCostsPanel doc={doc} projectId={projectId} fields={fields} />
        </div>
      )}
    </div>
  );
}

// ─── Search Panel ─────────────────────────────────────────────────────────────
function SearchPanel({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await customFetch(`/api/projects/${projectId}/documents/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      }) as SearchResponse;
      setResult(res);
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="e.g. lumber costs, safety inspection, contract…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
        />
        <Button size="sm" onClick={search} disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
      {result && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground italic">{result.answer}</p>
          {result.semantic && (
            <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
              <Sparkles className="h-2.5 w-2.5" />Full-text match
            </Badge>
          )}
          {result.results.map((r, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-md border bg-muted/20">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{r.filename}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{r.reason}</p>
              </div>
              <Badge className={`text-[10px] border shrink-0 ${RELEVANCE_COLOR[r.relevance]}`}>{r.relevance}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Q&A Panel ────────────────────────────────────────────────────────────────
function QAPanel({ projectId, indexedCount, totalCount }: { projectId: number; indexedCount: number; totalCount: number }) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ role: "user" | "ai"; text: string; citations?: QACitation[]; ragEnabled?: boolean; hasChunks?: boolean; hasAnalyzedDocsWithNoChunks?: boolean }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function ask() {
    const q = input.trim();
    if (!q) return;
    setInput("");
    const next = [...history, { role: "user" as const, text: q }];
    setHistory(next);
    setLoading(true);
    try {
      const res = await customFetch(`/api/projects/${projectId}/documents/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: history.slice(-6).map(h => ({ role: h.role, text: h.text })) }),
      }) as QAResponse;
      setHistory([...next, { role: "ai", text: res.answer, citations: res.citations, ragEnabled: res.ragEnabled, hasChunks: res.hasChunks, hasAnalyzedDocsWithNoChunks: res.hasAnalyzedDocsWithNoChunks }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      toast({ title: "Q&A failed", description: getAiErrorMessage(err), variant: "destructive" });
      setHistory([...next, { role: "ai", text: "Sorry, I could not answer that." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {history.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground italic">Ask anything about your project documents. I'll search across all analyzed files.</p>
          {totalCount > 0 && (
            <div className={`flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 w-fit ${indexedCount > 0 ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
              {indexedCount > 0
                ? <CheckCircle className="h-3 w-3 shrink-0" />
                : <AlertCircle className="h-3 w-3 shrink-0" />}
              <span>
                {indexedCount > 0
                  ? `${indexedCount} of ${totalCount} document${totalCount !== 1 ? "s" : ""} indexed for AI search`
                  : `No documents indexed yet — click "Re-index for AI" on analyzed documents`}
              </span>
            </div>
          )}
        </div>
      )}
      {history.length > 0 && (
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {history.map((h, i) => (
            <div key={i} className={`text-xs rounded-md p-2.5 ${h.role === "user" ? "bg-primary/10 ml-4" : "bg-muted/40 mr-4"}`}>
              <p className="leading-relaxed">{h.text}</p>
              {h.ragEnabled === false && h.role === "ai" && (
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  {h.hasChunks === false && h.hasAnalyzedDocsWithNoChunks
                    ? "Semantic search is not yet active — use 'Re-index for AI Search' on your documents to enable it."
                    : "No matching sections found — answered from document summaries."}
                </p>
              )}
              {h.citations && h.citations.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {h.citations.map((c, j) => (
                    <span key={j} className="text-[10px] bg-background border rounded px-1.5 py-0.5 text-muted-foreground">
                      <BookOpen className="inline h-2.5 w-2.5 mr-0.5" />{c.filename}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="text-xs rounded-md p-2.5 bg-muted/40 mr-4">
              <Loader2 className="h-3 w-3 animate-spin inline mr-1" />Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="space-y-1">
        <div className="flex gap-2">
          <Textarea
            className="flex-1 min-h-[36px] max-h-24 text-sm resize-none"
            placeholder="Ask a question about your documents…"
            value={input}
            onChange={e => setInput(e.target.value.slice(0, 2000))}
            maxLength={2000}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
            rows={1}
          />
          <Button size="icon" onClick={ask} disabled={loading || !input.trim()} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className={`text-xs text-right tabular-nums ${input.length >= 2000 ? "text-destructive font-medium" : input.length >= 2000 * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
          {input.length.toLocaleString()}/2,000
        </p>
      </div>
    </div>
  );
}

// ─── Upload helpers ───────────────────────────────────────────────────────────
async function requestUploadUrl(name: string, size: number, contentType: string) {
  return customFetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, size, contentType }),
  }) as Promise<{ uploadURL: string; objectPath: string }>;
}

async function uploadToStorage(uploadURL: string, file: File) {
  const res = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!res.ok) throw new Error("Upload failed");
}

async function registerDoc(projectId: number, data: { filename: string; fileType: string; objectPath: string; fileSize?: number }) {
  return customFetch(`/api/projects/${projectId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }) as Promise<ProjectDoc>;
}

async function triggerAnalyze(projectId: number, docId: number) {
  return customFetch(`/api/projects/${projectId}/documents/${docId}/analyze`, { method: "POST" }) as Promise<ProjectDoc>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DocumentsTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const queryKey = ["documents", projectId];

  const [uploading, setUploading] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<number>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [showQA, setShowQA] = useState(false);

  const { data: docs = [], isLoading } = useQuery<ProjectDoc[]>({
    queryKey,
    queryFn: () => customFetch(`/api/projects/${projectId}/documents`) as Promise<ProjectDoc[]>,
  });

  const { data: clientUploads = [] } = useQuery<ClientUpload[]>({
    queryKey: ["client-uploads", projectId],
    queryFn: () => customFetch(`/api/projects/${projectId}/portal/uploads`) as Promise<ClientUpload[]>,
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => customFetch(`/api/projects/${projectId}/documents/${docId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const [reindexingIds, setReindexingIds] = useState<Set<number>>(new Set());

  async function handleReindex(doc: ProjectDoc) {
    setReindexingIds(prev => new Set(prev).add(doc.id));
    try {
      const result = await customFetch(`/api/projects/${projectId}/documents/${doc.id}/reindex`, {
        method: "POST",
      }) as { chunkCount: number; message?: string };
      queryClient.setQueryData<ProjectDoc[]>(queryKey, (old = []) =>
        old.map(d => d.id === doc.id ? { ...d, chunkCount: result.chunkCount } : d)
      );
      toast({
        title: result.chunkCount > 0 ? "Re-indexed successfully" : "Re-index complete",
        description: result.chunkCount > 0
          ? `${result.chunkCount} sections indexed for AI search.`
          : (result.message ?? "No text found. Try re-analyzing the document."),
      });
    } catch {
      toast({ title: "Re-index failed", variant: "destructive" });
    } finally {
      setReindexingIds(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
    }
  }

  async function handleAnalyze(doc: ProjectDoc) {
    setAnalyzingIds(prev => new Set(prev).add(doc.id));
    try {
      const updated = await triggerAnalyze(projectId, doc.id);
      queryClient.setQueryData<ProjectDoc[]>(queryKey, (old = []) => old.map(d => d.id === updated.id ? updated : d));
      toast({ title: "Analysis complete", description: `${doc.filename} has been analyzed.` });
    } catch {
      toast({ title: "Analysis failed", variant: "destructive" });
    } finally {
      setAnalyzingIds(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
    }
  }

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    setUploading(true);
    try {
      for (const file of files) {
        const { uploadURL, objectPath } = await requestUploadUrl(file.name, file.size, file.type);
        await uploadToStorage(uploadURL, file);
        const doc = await registerDoc(projectId, { filename: file.name, fileType: file.type, objectPath, fileSize: file.size });
        queryClient.invalidateQueries({ queryKey });

        const { mirrorUploadedFile } = await import("@/lib/driveSyncPipeline");
        await mirrorUploadedFile(file);

        // Auto-analyze images on upload
        if (IMAGE_TYPES.includes(file.type.toLowerCase())) {
          setAnalyzingIds(prev => new Set(prev).add(doc.id));
          try {
            const updated = await triggerAnalyze(projectId, doc.id);
            queryClient.setQueryData<ProjectDoc[]>(queryKey, (old = []) => old.map(d => d.id === updated.id ? updated : d));
          } catch {
            toast({ title: "Auto-analysis failed", description: `Could not analyze ${file.name}.`, variant: "destructive" });
          } finally {
            setAnalyzingIds(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
          }
        }
      }
      toast({ title: `${files.length} file${files.length > 1 ? "s" : ""} uploaded` });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [projectId, queryClient, queryKey, toast]);

  const analyzedCount = docs.filter(d => d.status === "ready").length;
  const indexedCount = docs.filter(d => (d.chunkCount ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">Documents</h3>
          {docs.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {analyzedCount}/{docs.length} analyzed · {indexedCount}/{docs.length} indexed for AI search{clientUploads.length > 0 ? ` · ${clientUploads.length} client uploads` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showSearch ? "default" : "outline"}
            size="sm"
            onClick={() => { setShowSearch(v => !v); setShowQA(false); }}
          >
            <Search className="h-4 w-4 mr-1.5" /> Search
          </Button>
          <Button
            variant={showQA ? "default" : "outline"}
            size="sm"
            onClick={() => { setShowQA(v => !v); setShowSearch(false); }}
          >
            <MessageSquare className="h-4 w-4 mr-1.5" /> Ask AI
          </Button>
          <label>
            <Button asChild disabled={uploading} size="sm">
              <span className="cursor-pointer">
                {uploading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Uploading…</> : <><Upload className="h-4 w-4 mr-1.5" />Upload</>}
              </span>
            </Button>
            <input
              type="file" multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              className="hidden" onChange={handleFileSelect} disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* Search Panel */}
      {showSearch && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Document Search</h4>
                <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary"><Sparkles className="h-2.5 w-2.5" />AI</Badge>
              </div>
              <button onClick={() => setShowSearch(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <SearchPanel projectId={projectId} />
          </CardContent>
        </Card>
      )}

      {/* Q&A Panel */}
      {showQA && (
        <Card className="border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Document Q&A</h4>
                <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary"><Sparkles className="h-2.5 w-2.5" />AI</Badge>
              </div>
              <button onClick={() => setShowQA(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <QAPanel projectId={projectId} indexedCount={indexedCount} totalCount={docs.length} />
          </CardContent>
        </Card>
      )}

      {/* Info card */}
      {!showSearch && !showQA && (
        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground flex gap-3 items-start">
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-foreground">AI-Powered Documents — </span>
            Photos & receipts are analyzed automatically on upload (OCR, amounts, vendors). PDFs and other files can be analyzed on demand.
            Use <span className="font-medium">Search</span> to find documents, or <span className="font-medium">Ask AI</span> to answer questions across all files.
            Invoices and receipts with a dollar amount can be <span className="font-medium">pushed directly to Cost Tracking</span>.
          </div>
        </div>
      )}

      {/* Document list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />Loading documents…
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center p-10 border rounded-md bg-card">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="font-medium">No documents yet</p>
          <p className="text-sm text-muted-foreground mt-1">Upload receipts, invoices, site photos, and other files.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {docs.map(doc => {
            const isAnalyzing = analyzingIds.has(doc.id);
            const displayStatus: DocStatus = isAnalyzing ? "processing" : doc.status;
            const canAnalyze = !isAnalyzing && doc.status !== "processing" && doc.status !== "processing_ocr" && doc.status !== "ready";

            return (
              <Card key={doc.id} className="overflow-hidden">
                <CardContent className="p-3.5">
                  <div className="flex items-start gap-3">
                    <FileIcon fileType={doc.fileType} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate max-w-xs">{doc.filename}</span>
                        {statusBadge(displayStatus)}
                        {doc.chunkCount != null && doc.chunkCount > 0 && (
                          <Badge variant="outline" className="text-[10px] gap-1 border-green-400/60 text-green-700 bg-green-50 px-1.5">
                            <CheckCircle className="h-2.5 w-2.5" />AI Ready
                          </Badge>
                        )}
                        {formatSize(doc.fileSize) && (
                          <span className="text-xs text-muted-foreground">{formatSize(doc.fileSize)}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(doc.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                      {doc.aiSummary && displayStatus !== "ready" && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{doc.aiSummary}</p>
                      )}
                      <ExtractedDataPanel doc={doc} projectId={projectId} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canAnalyze && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5"
                          onClick={() => handleAnalyze(doc)}
                          title="Analyze with AI"
                        >
                          <Sparkles className="h-3 w-3" />
                          Analyze
                        </Button>
                      )}
                      {isOwnerOrForeman && doc.status === "ready" && doc.chunkCount === 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 border-blue-400/60 text-blue-700 hover:bg-blue-50"
                          onClick={() => handleReindex(doc)}
                          disabled={reindexingIds.has(doc.id)}
                          title="Index document content for AI search"
                        >
                          {reindexingIds.has(doc.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          {reindexingIds.has(doc.id) ? "Indexing…" : "Re-index for AI"}
                        </Button>
                      )}
                      <DocDownloadButton objectPath={doc.objectPath} />
                      {isOwnerOrForeman && (
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Delete" onClick={() => deleteMutation.mutate(doc.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Client Uploads Section */}
      {clientUploads.length > 0 && (
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-blue-500" />
            <h4 className="font-semibold text-sm">Client Uploads</h4>
            <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">{clientUploads.length}</span>
          </div>
          {clientUploads.map(upload => (
            <Card key={upload.id} className="border-blue-200 bg-blue-50/30">
              <CardContent className="p-3.5">
                <div className="flex items-start gap-3">
                  <FileIcon fileType={upload.fileType} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate max-w-xs">{upload.filename}</span>
                      <Badge variant="outline" className="border-blue-300 text-blue-700 text-xs gap-1">
                        <UserCircle className="h-3 w-3" />From Client
                      </Badge>
                      {formatSize(upload.fileSize) && <span className="text-xs text-muted-foreground">{formatSize(upload.fileSize)}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(upload.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  <DocDownloadButton objectPath={upload.objectPath} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DocDownloadButton({ objectPath }: { objectPath: string }) {
  const { toast } = useToast();
  const { open, isFetching } = useSignedDownload(objectPath);
  return (
    <button
      onClick={() => open((message) => toast({ title: message, variant: "destructive" }))}
      disabled={isFetching}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      title="Download"
    >
      {isFetching ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
    </button>
  );
}
