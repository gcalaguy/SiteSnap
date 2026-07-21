import { useState } from "react";
import { Trash2, Clock } from "lucide-react";
import { format } from "date-fns";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { DailyReportPhoto } from "@workspace/api-client-react";

const CATEGORY_LABELS: Record<string, string> = {
  progress: "Progress",
  issue: "Issue/Defect",
  site_condition: "Site Condition",
};

const CATEGORY_STYLES: Record<string, string> = {
  progress: "bg-blue-600/90 text-white",
  issue: "bg-amber-600/90 text-white",
  site_condition: "bg-slate-600/90 text-white",
};

export function CategoryBadge({ category, className }: { category?: string | null; className?: string }) {
  const key = category ?? "progress";
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CATEGORY_STYLES[key] ?? CATEGORY_STYLES.progress} ${className ?? ""}`}>
      {CATEGORY_LABELS[key] ?? "Progress"}
    </span>
  );
}

export function PhotoThumbnail({
  photo,
  compact,
  onDelete,
  uploaderName,
}: {
  photo: DailyReportPhoto;
  compact?: boolean;
  onDelete?: () => void;
  uploaderName?: string | null;
}) {
  const { data: signedUrl, isLoading } = useSignedUrl(photo.objectPath);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const sizeClass = compact ? "h-16 w-16" : "h-24 w-24";

  if (isLoading) {
    return (
      <div className={`${sizeClass} rounded-md border border-border bg-muted flex items-center justify-center`}>
        <div className="w-4 h-4 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className={`${sizeClass} rounded-md border border-border bg-muted flex items-center justify-center text-[10px] text-muted-foreground`}>
        No photo
      </div>
    );
  }

  return (
    <>
      <div className="relative group">
        <img
          src={signedUrl}
          alt={photo.caption ?? "Site photo"}
          className={`${sizeClass} object-cover rounded-md border border-border opacity-80 hover:opacity-100 transition-opacity cursor-pointer`}
          onClick={(e) => {
            e.stopPropagation();
            setLightboxOpen(true);
          }}
        />
        <div className="absolute bottom-0.5 left-0.5">
          <CategoryBadge category={photo.category} />
        </div>
        {onDelete && (
          <button
            type="button"
            title="Delete photo"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="sm:max-w-3xl p-2 bg-black/95 border-none" onClick={(e) => e.stopPropagation()}>
          <img src={signedUrl} alt={photo.caption ?? "Site photo"} className="w-full max-h-[75vh] object-contain rounded" />
          <div className="flex items-center justify-between gap-3 px-2 pb-1 text-sm text-white/80">
            <div className="flex items-center gap-2">
              <CategoryBadge category={photo.category} />
              {uploaderName && <span>Uploaded by {uploaderName}</span>}
            </div>
            <span className="flex items-center gap-1 text-white/60">
              <Clock className="h-3.5 w-3.5" />
              {format(new Date(photo.uploadedAt), "MMM d, yyyy 'at' h:mm a")}
            </span>
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={() => { onDelete(); setLightboxOpen(false); }}
              className="absolute top-3 right-3 p-1.5 rounded bg-black/60 text-white hover:bg-red-600"
              title="Delete photo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
