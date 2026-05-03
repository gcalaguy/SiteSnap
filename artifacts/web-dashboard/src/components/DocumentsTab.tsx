import { useState, useCallback, useRef } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { VoiceNoteButton } from "./VoiceNoteButton";
import {
  Upload, FileText, Image, Trash2, Sparkles, Download,
  Loader2, ChevronDown, ChevronUp, AlertCircle, CheckCircle,
  Clock, UserCircle, Search, MessageSquare, X, Send, BookOpen,
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
type DocStatus = "pending" | "processing" | "ready" | "failed";

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

type SearchResult = ProjectDoc & { relevance: "high" | "medium" | "low"; reason: string };
type SearchResponse = { results: SearchResult[]; answer: string };
type QAResponse = { answer: string; citations: { id: number; filename: string }[] };

// ─── Constants ────────────────────────────────────────────────────────────────
const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic"];

const RELEVANCE_COLOR: Record<string, string> = {
  high: "bg-green-100 text-green-700 border-green-300",
  medium: "bg-amber-100 text-amber-700 border-amber-300",
  low: "bg-slate-100 text-slate-600 border-slate-300",
};

// ─── Helper components ────────────────────────────────────────────────────────
function statusBadge(status: DocStatus) {
  switch (status) {
    case "pending":    return <Badge variant="outline" className="gap-1 text-xs"><Clock className="h-3 w-3" />Pending</Badge>;
    case "processing": return <Badge variant="outline" className="gap-1 text-xs border-amber-400 text-amber-700"><Loader2 className="h-3 w-3 animate-spin" />Analyzing…</Badge>;
    case "ready":      return <Badge variant="outline" className="gap-1 text-xs border-green-500 text-green-700"><CheckCircle className="h-3 w-3" />Analyzed</Badge>;
    case "failed":     return <Badge variant="outline" className="gap-1 text-xs border-red-400 text-red-600"><AlertCircle className="h-3 w-3" />Failed</Badge>;
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

function ExtractedDataPanel({ doc }: { doc: ProjectDoc }) {
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
        </div>
      )}
    </div>
  );
}

// ─── Search Panel ─────────────────────────────────────────────────────────────
function SearchPanel({ projectId }: { projectId: number }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await customFetch(`/api/projects/${projectId}/documents/search`, {
        method: "POST",
        body: JSON.stringify({ query: query.trim() }),
      }) as SearchResponse;
      setResult(data);
    } catch (err: any) {
      setResult({ results: [], answer: err?.message ?? "Search failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Search documents… e.g. 'concrete receipts' or 'invoices over $5000'"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && runSearch()}
          />
        </div>
        <VoiceNoteButton onTranscript={t => setQuery(q => q ? `${q} ${t}` : t)} size="icon" />
        <Button onClick={runSearch} disabled={loading || !query.trim()} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          {result.answer && (
            <div className="flex gap-2 bg-primary/5 border border-primary/20 rounded-md p-3">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">{result.answer}</p>
            </div>
          )}
          {result.results.length > 0 ? (
            <div className="space-y-1.5">
              {result.results.map(doc => (
                <div key={doc.id} className="flex items-start gap-3 p-2.5 border rounded-md bg-card hover:bg-muted/30 transition-colors">
                  <FileIcon fileType={doc.fileType} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{doc.filename}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${RELEVANCE_COLOR[doc.relevance]}`}>
                        {doc.relevance}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{doc.reason}</p>
                  </div>
                  <a href={doc.objectPath.replace(/^\/objects\//, "/api/storage/objects/")} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">No matching documents found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Q&A Panel ────────────────────────────────────────────────────────────────
type QAMessage = { role: "user" | "assistant"; text: string; citations?: { id: number; filename: string }[] };

function QAPanel({ projectId }: { projectId: number }) {
  const [messages, setMessages] = useState<QAMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function ask() {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: q }]);
    setLoading(true);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const data = await customFetch(`/api/projects/${projectId}/documents/qa`, {
        method: "POST",
        body: JSON.stringify({ question: q }),
      }) as QAResponse;
      setMessages(m => [...m, { role: "assistant", text: data.answer, citations: data.citations }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: "assistant", text: err?.message ?? "Sorry, Q&A failed. Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">Ask anything about your project documents</p>
          <p className="text-xs mt-1">e.g. "What's the total spend on concrete?" or "Who is our main supplier?"</p>
          <div className="flex flex-wrap gap-2 justify-center mt-3">
            {["What's the total amount across all invoices?", "List all vendors on this project", "Any safety inspection issues?"].map(s => (
              <button key={s} onClick={() => setInput(s)} className="text-xs border rounded-full px-3 py-1 hover:bg-muted transition-colors text-left">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/30 flex flex-wrap gap-1">
                    {m.citations.map(c => (
                      <span key={c.id} className="text-[10px] bg-background/50 rounded px-1.5 py-0.5 flex items-center gap-1">
                        <FileText className="h-2.5 w-2.5" />{c.filename}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="flex gap-2">
        <Textarea
          className="flex-1 min-h-[36px] max-h-24 text-sm resize-none"
          placeholder="Ask a question about your documents…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
          rows={1}
        />
        <VoiceNoteButton onTranscript={t => setInput(q => q ? `${q} ${t}` : t)} disabled={loading} />
        <Button size="icon" onClick={ask} disabled={loading || !input.trim()} className="shrink-0">
          <Send className="h-4 w-4" />
        </Button>
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">Documents</h3>
          {docs.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {analyzedCount}/{docs.length} analyzed · {clientUploads.length} client uploads
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
                <h4 className="font-semibold text-sm">Semantic Search</h4>
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
            <QAPanel projectId={projectId} />
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
            const downloadPath = doc.objectPath.replace(/^\/objects\//, "/api/storage/objects/");
            const canAnalyze = !isAnalyzing && doc.status !== "processing" && doc.status !== "ready";

            return (
              <Card key={doc.id} className="overflow-hidden">
                <CardContent className="p-3.5">
                  <div className="flex items-start gap-3">
                    <FileIcon fileType={doc.fileType} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate max-w-xs">{doc.filename}</span>
                        {statusBadge(displayStatus)}
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
                      <ExtractedDataPanel doc={doc} />
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
                      <a href={downloadPath} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Download">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Delete" onClick={() => deleteMutation.mutate(doc.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
          {clientUploads.map(upload => {
            const downloadPath = upload.objectPath.replace(/^\/objects\//, "/api/storage/objects/");
            return (
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
                    <a href={downloadPath} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
