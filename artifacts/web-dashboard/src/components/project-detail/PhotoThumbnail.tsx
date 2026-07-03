import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Trash2 } from "lucide-react";

export function PhotoThumbnail({ photo, compact, onDelete }: { photo: any; compact?: boolean; onDelete?: () => void }) {
  const { data: signedUrl, isLoading } = useQuery({
    queryKey: ["signed-photo-url", photo.objectPath],
    queryFn: async () => {
      const path = photo.objectPath?.replace(/^\//, "");
      if (!path) return null;
      const rest = path.startsWith("objects/")
        ? path.replace(/^objects\//, "")
        : path.startsWith("api/storage/objects/")
          ? path.replace(/^api\/storage\/objects\//, "")
          : null;
      if (!rest) return null;
      const { url } = (await customFetch(`/api/storage/objects/${rest}/signed-url`)) as { url: string };
      return url;
    },
    enabled: !!photo.objectPath,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

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
    <div className="relative group">
      <img
        src={signedUrl}
        alt={photo.caption ?? "Site photo"}
        className={`${sizeClass} object-cover rounded-md border border-border opacity-80 hover:opacity-100 transition-opacity cursor-pointer`}
        onClick={(e) => {
          e.stopPropagation();
          window.open(signedUrl, "_blank", "noopener,noreferrer");
        }}
      />
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
  );
}
