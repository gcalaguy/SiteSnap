import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface DraftBannerProps {
  show: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}

export function DraftBanner({ show, onRestore, onDiscard }: DraftBannerProps) {
  if (!show) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="flex-1">Unsaved draft detected.</span>
      <Button variant="outline" size="sm" className="h-7 text-xs border-amber-300 hover:bg-amber-100" onClick={onRestore}>
        Restore Draft
      </Button>
      <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-100" onClick={onDiscard}>
        Discard
      </Button>
    </div>
  );
}
