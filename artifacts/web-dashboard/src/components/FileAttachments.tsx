import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useSignedDownload } from "@/hooks/useSignedUrl";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";
import {
  Paperclip,
  Upload,
  Trash2,
  FileText,
  Image,
  FileSpreadsheet,
  File,
  Loader2,
  Download,
} from "lucide-react";
import { format } from "date-fns";

type FileAttachment = {
  id: number;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  objectPath: string;
  createdAt: string;
  uploaderName?: string;
};

type EntityType = "project" | "contact" | "task" | "form_submission";

interface Props {
  entityType: EntityType;
  entityId: number;
  readOnly?: boolean;
}

function fileIcon(mimeType?: string | null) {
  if (!mimeType) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("text"))
    return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function fmtSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function FileAttachments({ entityType, entityId, readOnly = false }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const queryKey = ["file-attachments", entityType, entityId];
  const {
    data: fetchedFiles = [],
    isLoading: loading,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      return await customFetch(
        `/api/files?entityType=${entityType}&entityId=${entityId}`,
      ) as FileAttachment[];
    },
    enabled: !!entityId,
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });

  useEffect(() => {
    setFiles(fetchedFiles);
  }, [fetchedFiles]);

  async function fetchWithTimeout(url: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
    const { timeout = 30000, ...rest } = init;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...rest, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    setUploadProgress(10);
    try {
      const { uploadURL, objectPath } = await customFetch(`/api/storage/uploads/request-url`, {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      }) as { uploadURL: string; objectPath: string };

      setUploadProgress(40);
      const uploadRes = await fetchWithTimeout(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
        timeout: 60000,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      setUploadProgress(80);
      const record = await customFetch(`/api/files`, {
        method: "POST",
        body: JSON.stringify({
          entityType,
          entityId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          objectPath,
        }),
      }) as FileAttachment;

      setFiles((prev) => [record, ...prev]);
      setUploadProgress(100);
      toast({ title: "File uploaded", description: file.name });

      const { mirrorUploadedFile } = await import("@/lib/driveSyncPipeline");
      await mirrorUploadedFile(file);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Please try again", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await customFetch(`/api/files/${deleteId}`, { method: "DELETE" });
      setFiles((prev) => prev.filter((f) => f.id !== deleteId));
      setDeleteId(null);
      toast({ title: "File removed" });
    } catch {
      toast({ title: "Failed to remove file", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            Files
            {files.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground font-normal">({files.length})</span>
            )}
          </span>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-7 text-xs gap-1.5"
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            {uploading ? `${uploadProgress}%` : "Upload File"}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="*/*"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
      ) : files.length === 0 ? (
        <div
          className="rounded-lg border-2 border-dashed flex flex-col items-center justify-center py-6 cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => !readOnly && fileInputRef.current?.click()}
        >
          <Paperclip className="h-7 w-7 text-muted-foreground/40 mb-1.5" />
          <p className="text-xs text-muted-foreground">
            {readOnly ? "No files attached" : "Click to upload files"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 group">
              <div className="flex-shrink-0">{fileIcon(f.mimeType)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtSize(f.fileSize)}
                  {fmtSize(f.fileSize) && " · "}
                  {format(new Date(f.createdAt), "MMM d, yyyy")}
                  {f.uploaderName && ` · ${f.uploaderName}`}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <DownloadButton objectPath={f.objectPath} fileName={f.fileName} />
                {!readOnly && (
                  <button
                    onClick={() => setDeleteId(f.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove file?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the file record. The stored file will remain in storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DownloadButton({ objectPath, fileName }: { objectPath: string; fileName: string }) {
  const { open, isFetching } = useSignedDownload(objectPath);
  return (
    <button
      onClick={open}
      disabled={isFetching}
      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      title="Download"
    >
      {isFetching ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
