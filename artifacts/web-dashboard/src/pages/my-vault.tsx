import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  useListMyWorkerDocuments,
  useUploadWorkerDocument,
  useDeleteWorkerDocument,
  getListMyWorkerDocumentsQueryKey,
  WorkerDocumentUploadDocumentType,
  type WorkerDocument,
  ApiError,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShieldCheck, Plus, Trash2, FileText, Upload, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const DOC_TYPES = Object.values(WorkerDocumentUploadDocumentType);

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

export default function MyVaultPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: docs = [], isLoading } = useListMyWorkerDocuments();

  const [open, setOpen] = useState(false);
  const [documentType, setDocumentType] = useState<string>(DOC_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const uploadDoc = useUploadWorkerDocument({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMyWorkerDocumentsQueryKey() });
        toast({ title: "Document uploaded" });
        setOpen(false);
        setFile(null);
        setUploading(false);
      },
      onError: (e: ApiError) => {
        setUploading(false);
        toast({ title: "Failed to upload document", description: e?.message, variant: "destructive" });
      },
    },
  });

  const deleteDoc = useDeleteWorkerDocument({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMyWorkerDocumentsQueryKey() });
        toast({ title: "Document deleted" });
      },
      onError: (e: ApiError) => toast({ title: "Failed to delete document", description: e?.message, variant: "destructive" }),
    },
  });

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const { uploadURL, objectPath } = await requestUploadUrl(file.name, file.size, file.type);
      await uploadToStorage(uploadURL, file);
      const objectId = objectPath.replace(/^\/objects\//, "");
      uploadDoc.mutate({
        data: {
          documentType: documentType as typeof WorkerDocumentUploadDocumentType[keyof typeof WorkerDocumentUploadDocumentType],
          fileUrl: `/api/storage/objects/${objectId}`,
          filePath: objectPath,
        },
      });
    } catch (e) {
      setUploading(false);
      const message = e instanceof Error ? e.message : undefined;
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" style={{ color: "#D4AF37" }} />
            My Vault
          </h1>
          <p className="text-sm text-[#121212]/60 font-medium">Your certificates, licenses, and credentials.</p>
        </div>
        <Button className="bg-[#D4AF37] text-white hover:bg-[#b5922e]" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-[#121212]/60 animate-pulse font-medium">Loading documents…</div>
      ) : docs.length === 0 ? (
        <Card className="border-[#D4AF37]/20">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <ShieldCheck className="h-10 w-10 text-[#D4AF37]/40" />
            <p className="text-[#121212]/60 font-medium">No documents in your vault yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {docs.map((doc: WorkerDocument) => (
            <Card key={doc.id} className="border-[#D4AF37]/20">
              <CardContent className="py-4 px-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[#121212]">{doc.documentType}</p>
                    <p className="text-xs text-[#121212]/60 font-medium">
                      Uploaded {format(new Date(doc.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-[#D4AF37] hover:text-[#b5922e] hover:bg-[#D4AF37]/10"
                    onClick={async () => {
                      try {
                        const objectId = doc.fileUrl.replace(/^\/api\/storage\/objects\//, "");
                        const { url } = await customFetch(`/api/storage/objects/${objectId}/signed-url`) as { url: string };
                        window.open(url, "_blank", "noopener,noreferrer");
                      } catch {
                        toast({ title: "Could not open document", variant: "destructive" });
                      }
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => deleteDoc.mutate({ id: doc.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#121212]/60 font-medium">Document Type</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[#121212]/60 font-medium">File</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#D4AF37] text-white hover:bg-[#b5922e]"
              onClick={handleUpload}
              disabled={uploading || uploadDoc.isPending || !file}
            >
              {uploading || uploadDoc.isPending ? "Uploading…" : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
