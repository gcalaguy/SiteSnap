import { useState, Component, type ReactNode } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

interface SplatViewerProps {
  scanUrl: string;
  className?: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Local ErrorBoundary: isolates WebGL/Canvas crashes so they don't bubble up ──

class ViewerErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("SplatViewer crashed:", error);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm">3D viewer crashed. WebGL may not be supported.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main Viewer ────────────────────────────────────────────────────────────────

export default function SplatViewer({ scanUrl, className }: SplatViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Resolve to absolute URL so the iframe fetch() works regardless of base path
  const resolvedUrl = scanUrl.startsWith("http")
    ? scanUrl
    : `${window.location.origin}${scanUrl.startsWith("/") ? "" : "/"}${scanUrl}`;

  const params = new URLSearchParams({
    content: resolvedUrl,
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
      <ViewerErrorBoundary onError={() => setErrored(true)}>
        {/* key forces a full remount when the scan changes, clearing any stale WebGL state */}
        <iframe
          key={scanUrl}
          src={src}
          className="w-full h-full border-0"
          title="3D Site Scan Viewer"
          allow="cross-origin-isolated"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{ display: "block" }}
        />
      </ViewerErrorBoundary>
    </div>
  );
}
