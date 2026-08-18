import { useState } from "react";
import { useLocation } from "wouter";
import { FileDown, Loader2, ScanEye, Trash2, RefreshCw } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { useSafetyScanList, useDeleteSafetyScan, type SafetyScanListItem } from "@/hooks/safety-scanner/useSafetyScan";

const RISK_COLOR: Record<string, string> = {
  critical: "#dc2626", high: "#d97706", medium: "#ca8a04", low: "#16a34a",
};

/** Scan history + linked corrective-action status + PDF report links — the audit log for the AI Safety Scanner. */
export function ScanHistoryTab({ projectId }: { projectId?: number }) {
  const { data, isLoading, isError } = useSafetyScanList(projectId);
  const { data: me } = useGetMe();
  const [, setLocation] = useLocation();
  const [deleting, setDeleting] = useState<SafetyScanListItem | null>(null);
  const deleteScan = useDeleteSafetyScan(() => setDeleting(null));

  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  if (isLoading) return <div className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>;
  if (isError) return <div className="py-10 text-center text-sm text-red-400">Could not load scan history.</div>;

  const scans = data?.data ?? [];
  if (scans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-zinc-600">
        <ScanEye className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">No AI safety scans yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {scans.map((scan) => {
        const riskColor = RISK_COLOR[scan.riskLevel ?? "low"];
        return (
          <Card
            key={scan.id}
            className="cursor-pointer transition-colors hover:brightness-110"
            style={{ background: "#111111", border: "1px solid #2a2a2a" }}
            onClick={() => setLocation(`/safety-scan/${scan.id}`)}
          >
            <CardContent className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{scan.siteAddress ?? "Unknown location"}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{new Date(scan.createdAt).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold" style={{ color: riskColor }}>
                  {(scan.riskLevel ?? "low").toUpperCase()}
                </p>
                <p className="text-lg font-bold text-zinc-100">{scan.complianceScore ?? 0}%</p>
              </div>
              {/* Generated in the background, or on demand by /report if not
                  ready yet — always safe to offer. */}
              <a
                href={`/api/safety/scans/${scan.id}/report`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 p-2 rounded hover:bg-white/5"
                style={{ color: "#C9A84C" }}
                title="Download PDF report"
              >
                <FileDown className="h-4 w-4" />
              </a>
              {isOwnerOrForeman && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleting(scan);
                  }}
                  className="shrink-0 p-2 rounded hover:bg-white/5 text-zinc-500 hover:text-red-400"
                  title="Delete scan"
                  aria-label="Delete scan"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this safety scan?</AlertDialogTitle>
            <AlertDialogDescription>
              This scan and its photos will be permanently removed from the Web Dashboard. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleting && deleteScan.mutate(deleting.id)}
            >
              {deleteScan.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
