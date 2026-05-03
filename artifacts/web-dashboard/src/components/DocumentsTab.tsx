import { useState, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, Image, Trash2, Sparkles, Download,
  Loader2, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Clock, UserCircle,
} from "lucide-react";
import { format } from "date-fns";

type DocStatus = "pending" | "processing" | "ready" | "failed";

type ClientUpload = {
  id: number;
  projectId: number;
  portalTokenId: number;
  filename: string;
  fileType: string;
  objectPath: string;
  fileSize: number | null;
  createdAt: string;
};

type ProjectDoc = {
  id: number;
  projectId: number;
  filename: string;
  fileType: string;
  objectPath: string;
  fileSize: number | null;
  status: DocStatus;
  extractedData: Record<string, unknown> | null;
  aiSummary: string | null;
  createdAt: string;
};

type ExtractedFields = {
  documentType?: string;
  summary?: string;
  confidence?: string;
  extractedData?: {
    vendor?: string | null;
    amount?: number | null;
    currency?: string | null;
    date?: string | null;
    items?: { description: string; quantity: string; unitPrice: string; total: string }[];
    projectReference?: string | null;
    invoiceNumber?: string | null;
    notes?: string | null;
  };
};

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic"];

function statusBadge(status: DocStatus) {
  switch (status) {
    case "pending": return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    case "processing": return <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
    case "ready": return <Badge variant="outline" className="gap-1 border-green-500 text-green-700"><CheckCircle className="h-3 w-3" />Ready</Badge>;
    case "failed": return <Badge variant="outline" className="gap-1 border-red-400 text-red-600"><AlertCircle className="h-3 w-3" />Failed</Badge>;
  }
}

function FileIcon({ fileType }: { fileType: string }) {
  if (IMAGE_TYPES.includes(fileType.toLowerCase())) return <Image className="h-5 w-5 text-blue-500 shrink-0" />;
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
    <div className="mt-3 border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Extraction — {data.documentType ?? "Document"}
          {data.confidence && <span className="text-xs text-muted-foreground font-normal">({data.confidence} confidence)</span>}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="p-4 space-y-3 text-sm">
          {doc.aiSummary && (
            <p className="text-muted-foreground italic">{doc.aiSummary}</p>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {fields.vendor && <div><span className="text-muted-foreground text-xs block">Vendor</span><span className="font-medium">{fields.vendor}</span></div>}
            {fields.amount != null && <div><span className="text-muted-foreground text-xs block">Amount</span><span className="font-medium">{fields.currency ?? ""}${fields.amount.toLocaleString()}</span></div>}
            {fields.date && <div><span className="text-muted-foreground text-xs block">Date</span><span className="font-medium">{fields.date}</span></div>}
            {fields.invoiceNumber && <div><span className="text-muted-foreground text-xs block">Invoice #</span><span className="font-medium">{fields.invoiceNumber}</span></div>}
            {fields.projectReference && <div><span className="text-muted-foreground text-xs block">Project Ref</span><span className="font-medium">{fields.projectReference}</span></div>}
          </div>
          {fields.items && fields.items.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium">Line Items</p>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-left font-medium">Description</th>
                      <th className="p-2 text-right font-medium">Qty</th>
                      <th className="p-2 text-right font-medium">Unit</th>
                      <th className="p-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.items.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{item.description}</td>
                        <td className="p-2 text-right">{item.quantity}</td>
                        <td className="p-2 text-right">{item.unitPrice}</td>
                        <td className="p-2 text-right font-medium">{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {fields.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p>{fields.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function requestUploadUrl(name: string, size: number, contentType: string): Promise<{ uploadURL: string; objectPath: string }> {
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

async function registerDoc(projectId: number, data: { filename: string; fileType: string; objectPath: string; fileSize?: number }): Promise<ProjectDoc> {
  return customFetch(`/api/projects/${projectId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }) as Promise<ProjectDoc>;
}

async function triggerExtract(projectId: number, docId: number): Promise<ProjectDoc> {
  return customFetch(`/api/projects/${projectId}/documents/${docId}/extract`, { method: "POST" }) as Promise<ProjectDoc>;
}

export default function DocumentsTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["documents", projectId];

  const { data: docs = [], isLoading } = useQuery<ProjectDoc[]>({
    queryKey,
    queryFn: () => customFetch(`/api/projects/${projectId}/documents`) as Promise<ProjectDoc[]>,
  });

  const clientUploadsKey = ["client-uploads", projectId];
  const { data: clientUploads = [] } = useQuery<ClientUpload[]>({
    queryKey: clientUploadsKey,
    queryFn: () => customFetch(`/api/projects/${projectId}/portal/uploads`) as Promise<ClientUpload[]>,
  });

  const [uploading, setUploading] = useState(false);
  const [extractingIds, setExtractingIds] = useState<Set<number>>(new Set());

  const deleteMutation = useMutation({
    mutationFn: (docId: number) =>
      customFetch(`/api/projects/${projectId}/documents/${docId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    setUploading(true);
    try {
      for (const file of files) {
        const { uploadURL, objectPath } = await requestUploadUrl(file.name, file.size, file.type);
        await uploadToStorage(uploadURL, file);
        const doc = await registerDoc(projectId, {
          filename: file.name,
          fileType: file.type,
          objectPath,
          fileSize: file.size,
        });
        queryClient.invalidateQueries({ queryKey });

        if (IMAGE_TYPES.includes(file.type.toLowerCase())) {
          setExtractingIds((prev) => new Set(prev).add(doc.id));
          try {
            const updated = await triggerExtract(projectId, doc.id);
            queryClient.setQueryData<ProjectDoc[]>(queryKey, (old = []) =>
              old.map((d) => (d.id === updated.id ? updated : d))
            );
          } catch {
            toast({ title: "AI extraction failed", description: `Could not extract data from ${file.name}.`, variant: "destructive" });
          } finally {
            setExtractingIds((prev) => { const s = new Set(prev); s.delete(doc.id); return s; });
          }
        }
      }
      toast({ title: `${files.length} file${files.length > 1 ? "s" : ""} uploaded`, description: "Documents saved to project." });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [projectId, queryClient, queryKey, toast]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Documents</h3>
        <label>
          <Button asChild disabled={uploading}>
            <span className="cursor-pointer">
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</> : <><Upload className="h-4 w-4 mr-2" />Upload Files</>}
            </span>
          </Button>
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            className="hidden"
            onChange={handleFileSelect}
            disabled={uploading}
          />
        </label>
      </div>

      <Card className="border-dashed border-2 bg-muted/10">
        <CardContent className="p-4 text-sm text-muted-foreground text-center">
          <p className="font-medium text-foreground mb-1">Accepted files</p>
          <p>Photos & receipts (JPG, PNG, WebP) — AI will extract vendor, amounts, line items, and dates automatically.</p>
          <p className="mt-1">PDFs, Word, Excel, CSV — stored for download and manual review.</p>
        </CardContent>
      </Card>

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
        <div className="space-y-3">
          {docs.map((doc) => {
            const isExtracting = extractingIds.has(doc.id);
            const displayStatus: DocStatus = isExtracting ? "processing" : doc.status;
            const downloadPath = doc.objectPath.replace(/^\/objects\//, "/api/storage/objects/");

            return (
              <Card key={doc.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <FileIcon fileType={doc.fileType} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate max-w-xs">{doc.filename}</span>
                        {statusBadge(displayStatus)}
                        {formatSize(doc.fileSize) && (
                          <span className="text-xs text-muted-foreground">{formatSize(doc.fileSize)}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Uploaded {format(new Date(doc.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                      {doc.aiSummary && displayStatus !== "ready" && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{doc.aiSummary}</p>
                      )}
                      <ExtractedDataPanel doc={doc} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a href={downloadPath} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" title="Download">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        title="Delete"
                        onClick={() => deleteMutation.mutate(doc.id)}
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
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-blue-500" />
            <h4 className="font-semibold text-sm">Client Uploads</h4>
            <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">
              {clientUploads.length}
            </span>
          </div>
          <div className="space-y-2">
            {clientUploads.map((upload) => {
              const downloadPath = `${upload.objectPath.replace(/^\/objects\//, "/api/storage/objects/")}`;
              return (
                <Card key={upload.id} className="border-blue-200 bg-blue-50/30">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <FileIcon fileType={upload.fileType} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate max-w-xs">{upload.filename}</span>
                          <Badge variant="outline" className="border-blue-300 text-blue-700 text-xs gap-1">
                            <UserCircle className="h-3 w-3" />
                            From Client
                          </Badge>
                          {formatSize(upload.fileSize) && (
                            <span className="text-xs text-muted-foreground">{formatSize(upload.fileSize)}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Uploaded {format(new Date(upload.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <a href={downloadPath} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" title="Download">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
