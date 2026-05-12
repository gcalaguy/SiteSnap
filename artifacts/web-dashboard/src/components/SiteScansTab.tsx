import { lazy, Suspense, useState } from "react";
import {
  useListScans,
  useUpdateScan,
  useDeleteScan,
  getListScansQueryKey,
  customFetch,
  ScanRecord,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Box, Pencil, Trash2, Loader2, X, Check, ScanLine, ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const LazySplatViewer = lazy(() => import("@/components/SplatViewer"));

const GOLD = "#C9A84C";
const BLACK = "#111111";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface InlineRenameProps {
  scan: ScanRecord;
  onDone: () => void;
}

function InlineRename({ scan, onDone }: InlineRenameProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [value, setValue] = useState(scan.name ?? scan.fileName);
  const update = useUpdateScan({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListScansQueryKey() });
        toast({ title: "Scan renamed" });
        onDone();
      },
      onError: () => {
        toast({ title: "Failed to rename scan", variant: "destructive" });
      },
    },
  });

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    update.mutate({ id: scan.id, data: { name: trimmed } });
  }

  return (
    <div className="flex items-center gap-1.5 flex-1">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onDone();
        }}
        className="h-7 text-sm py-0"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        disabled={update.isPending}
        onClick={submit}
      >
        {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onDone}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface DeleteConfirmDialogProps {
  scan: ScanRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DeleteConfirmDialog({ scan, open, onOpenChange }: DeleteConfirmDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const del = useDeleteScan({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListScansQueryKey() });
        toast({ title: "Scan deleted" });
        onOpenChange(false);
      },
      onError: () => {
        toast({ title: "Failed to delete scan", variant: "destructive" });
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            Delete scan?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{scan.name ?? scan.fileName}</span> will be permanently removed. This cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={() => del.mutate({ id: scan.id })}
          >
            {del.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ScanViewerDialogProps {
  scan: ScanRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ScanViewerDialog({ scan, open, onOpenChange }: ScanViewerDialogProps) {
  const { toast } = useToast();
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleOpen(isOpen: boolean) {
    if (isOpen && scanUrl === null) {
      setLoading(true);
      try {
        const res = await customFetch<{ url: string }>(`/api/scans/${scan.id}/url`);
        setScanUrl(res.url);
      } catch {
        toast({ title: "Could not load 3D scan", variant: "destructive" });
        return;
      } finally {
        setLoading(false);
      }
    }
    if (!isOpen) setScanUrl(null);
    onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Box className="h-4 w-4 text-violet-500" />
            3D Site Scan — {scan.name ?? scan.fileName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading 3D viewer…</p>
            </div>
          ) : scanUrl ? (
            <Suspense
              fallback={
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading 3D viewer…</p>
                </div>
              }
            >
              <LazySplatViewer scanUrl={scanUrl} />
            </Suspense>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ScanCardProps {
  scan: ScanRecord;
}

function ScanCard({ scan }: ScanCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const displayName = scan.name ?? scan.fileName;
  const isProcessing = scan.status === "processing";

  return (
    <>
      <Card className="border border-border bg-card hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* Thumbnail placeholder */}
            <button
              className="shrink-0 w-16 h-16 rounded-lg flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity disabled:cursor-default disabled:opacity-50"
              style={{ background: BLACK }}
              disabled={isProcessing}
              onClick={() => !isProcessing && setViewerOpen(true)}
              title={isProcessing ? "Processing…" : "Open 3D viewer"}
            >
              {isProcessing ? (
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
              ) : (
                <Box className="h-7 w-7 text-violet-400" />
              )}
            </button>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-1.5">
              {renaming ? (
                <InlineRename scan={scan} onDone={() => setRenaming(false)} />
              ) : (
                <p className="text-sm font-medium truncate leading-snug">{displayName}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{format(new Date(scan.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                <span>·</span>
                <span>{formatBytes(scan.fileSizeBytes)}</span>
                {scan.sourceType === "video_capture" && (
                  <>
                    <span>·</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">From Video</Badge>
                  </>
                )}
              </div>
              {isProcessing && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">
                  Processing…
                </Badge>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {!isProcessing && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-violet-500 hover:text-violet-600"
                  title="Open 3D viewer"
                  onClick={() => setViewerOpen(true)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Rename scan"
                onClick={() => setRenaming(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive/80"
                title="Delete scan"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <DeleteConfirmDialog scan={scan} open={deleteOpen} onOpenChange={setDeleteOpen} />
      {viewerOpen && (
        <ScanViewerDialog scan={scan} open={viewerOpen} onOpenChange={setViewerOpen} />
      )}
    </>
  );
}

interface SiteScansTabProps {
  projectId: number;
}

export default function SiteScansTab({ projectId }: SiteScansTabProps) {
  const { data: scans, isLoading, isError } = useListScans(
    { projectId },
    { query: { staleTime: 30_000, queryKey: getListScansQueryKey({ projectId }) } }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading site scans…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-destructive">Failed to load scans. Please refresh and try again.</p>
      </div>
    );
  }

  if (!scans || scans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div
          className="rounded-full p-4"
          style={{ background: BLACK }}
        >
          <ScanLine className="h-8 w-8" style={{ color: GOLD }} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">No site scans yet</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Upload a .ply scan file from the Smart Estimator or use the mobile app to capture a site scan. It will appear here once linked to this project.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">
          {scans.length} scan{scans.length !== 1 ? "s" : ""} on record
        </p>
      </div>
      {scans.map((scan) => (
        <ScanCard key={scan.id} scan={scan} />
      ))}
    </div>
  );
}
