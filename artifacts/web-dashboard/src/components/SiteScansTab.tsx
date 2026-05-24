import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  useListScans,
  useUpdateScan,
  useDeleteScan,
  useGetScanThumbnailUrl,
  getListScansQueryKey,
  getGetScanThumbnailUrlQueryKey,
  customFetch,
  ScanRecord,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Box, Pencil, Trash2, Loader2, X, Check, ScanLine, ExternalLink, Search, CalendarRange, Upload,
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

  // Fetch the signed URL whenever the dialog is opened
  useEffect(() => {
    if (!open) {
      setScanUrl(null);
      return;
    }
    if (scanUrl !== null) return; // already loaded

    let cancelled = false;
    setLoading(true);
    customFetch<{ url: string }>(`/api/scans/${scan.id}/url`)
      .then((res) => {
        if (!cancelled) setScanUrl(res.url);
      })
      .catch(() => {
        if (!cancelled) {
          toast({ title: "Could not load 3D scan", variant: "destructive" });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scan.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

function ScanThumbnail({ scan, onClick }: { scan: ScanRecord; onClick: () => void }) {
  const isProcessing = scan.status === "processing";
  const hasThumbnail = !!scan.thumbnailPath;

  const { data: thumbData, isLoading: thumbLoading } = useGetScanThumbnailUrl(
    scan.id,
    {
      query: {
        queryKey: getGetScanThumbnailUrlQueryKey(scan.id),
        enabled: hasThumbnail && !isProcessing,
        staleTime: 600_000,
        retry: false,
      },
    },
  );

  const [imgError, setImgError] = useState(false);
  const showImg = thumbData?.url && !imgError;

  return (
    <button
      className="shrink-0 w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity disabled:cursor-default disabled:opacity-50"
      style={{ background: BLACK }}
      disabled={isProcessing}
      onClick={onClick}
      title={isProcessing ? "Processing…" : "Open 3D viewer"}
    >
      {isProcessing ? (
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
      ) : showImg ? (
        <img
          src={thumbData.url}
          alt="Scan thumbnail"
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : thumbLoading && hasThumbnail ? (
        <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
      ) : (
        <Box className="h-7 w-7 text-violet-400" />
      )}
    </button>
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
            <ScanThumbnail scan={scan} onClick={() => !isProcessing && setViewerOpen(true)} />

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

function formatDateRangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return "Pick a date range";
  if (!range.to) return format(range.from, "MMM d, yyyy");
  return `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`;
}

interface SiteScansTabProps {
  projectId: number;
}

export default function SiteScansTab({ projectId }: SiteScansTabProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: scans, isLoading, isError } = useListScans(
    { projectId },
    { query: { staleTime: 30_000, queryKey: getListScansQueryKey({ projectId }) } }
  );

  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const hasDateFilter = !!(dateRange?.from);
  const hasAnyFilter = search.trim() !== "" || hasDateFilter;

  const filteredScans = (scans ?? []).filter((scan) => {
    const needle = search.trim().toLowerCase();
    if (needle) {
      const displayName = (scan.name ?? scan.fileName).toLowerCase();
      const fileName = scan.fileName.toLowerCase();
      if (!displayName.includes(needle) && !fileName.includes(needle)) return false;
    }
    if (dateRange?.from) {
      const scanDate = new Date(scan.createdAt);
      const from = startOfDay(dateRange.from);
      const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      if (!isWithinInterval(scanDate, { start: from, end: to })) return false;
    }
    return true;
  });

  function clearFilters() {
    setSearch("");
    setDateRange(undefined);
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".ply") && !ext.endsWith(".sog") && !ext.endsWith(".mp4")) {
      toast({ title: "Unsupported file", description: "Please select a .ply, .sog, or .mp4 file.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { uploadURL, objectPath } = await customFetch<{ uploadURL: string; objectPath: string }>(
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        },
      );

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

      await customFetch("/api/scans", {
        method: "POST",
        body: JSON.stringify({
          objectPath,
          fileName: file.name,
          fileSizeBytes: file.size,
          sourceType: file.name.toLowerCase().endsWith(".mp4") ? "video_capture" : "file",
          projectId,
        }),
      });

      qc.invalidateQueries({ queryKey: getListScansQueryKey({ projectId }) });
      toast({ title: "Scan uploaded", description: `${file.name} has been saved to this project.` });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  const uploadButton = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ply,.sog,.mp4"
        className="hidden"
        onChange={handleFileSelected}
      />
      <Button
        size="sm"
        className="gap-1.5 h-9"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : "Upload Scan"}
      </Button>
    </>
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
        <div className="rounded-full p-4" style={{ background: BLACK }}>
          <ScanLine className="h-8 w-8" style={{ color: GOLD }} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">No site scans yet</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Upload a .ply or .sog scan file to link it to this project, or capture a scan from the mobile app.
          </p>
        </div>
        {uploadButton}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search & filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name or filename…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={hasDateFilter ? "secondary" : "outline"}
                className="h-9 gap-2 text-sm"
              >
                <CalendarRange className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{hasDateFilter ? formatDateRangeLabel(dateRange) : "Date range"}</span>
                <span className="sm:hidden">Date</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  if (range?.from && range?.to) setCalendarOpen(false);
                }}
                disabled={{ after: new Date() }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {hasDateFilter && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="Clear date filter"
              onClick={() => setDateRange(undefined)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          {uploadButton}
        </div>
      </div>

      {/* Result count row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {hasAnyFilter
            ? `${filteredScans.length} of ${scans.length} scan${scans.length !== 1 ? "s" : ""} match`
            : `${scans.length} scan${scans.length !== 1 ? "s" : ""} on record`}
        </p>
        {hasAnyFilter && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Results */}
      {filteredScans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No scans match your filters</p>
            <p className="text-xs text-muted-foreground">Try a different name or date range.</p>
          </div>
          <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
        </div>
      ) : (
        filteredScans.map((scan) => (
          <ScanCard key={scan.id} scan={scan} />
        ))
      )}
    </div>
  );
}
