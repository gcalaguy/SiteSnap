import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

interface SplatViewerProps {
  scanUrl: string;
  className?: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SplatViewer({ scanUrl, className }: SplatViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const params = new URLSearchParams({
    content: scanUrl,
    noui: "",
  });
  const src = `${BASE}/supersplat-viewer/index.html?${params.toString()}`;

  if (errored) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm">Failed to load 3D viewer</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${className ?? ""}`}>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading 3D scan…</p>
        </div>
      )}
      <iframe
        src={src}
        className="w-full h-full border-0"
        title="3D Site Scan Viewer"
        allow="cross-origin-isolated"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        style={{ display: "block" }}
      />
    </div>
  );
}
