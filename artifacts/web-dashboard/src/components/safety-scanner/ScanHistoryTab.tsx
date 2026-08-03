import { useLocation } from "wouter";
import { FileDown, Loader2, ScanEye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useSafetyScanList } from "@/hooks/safety-scanner/useSafetyScan";

const RISK_COLOR: Record<string, string> = {
  critical: "#dc2626", high: "#d97706", medium: "#ca8a04", low: "#16a34a",
};

/** Scan history + linked corrective-action status + PDF report links — the audit log for the AI Safety Scanner. */
export function ScanHistoryTab({ projectId }: { projectId?: number }) {
  const { data, isLoading, isError } = useSafetyScanList(projectId);
  const [, setLocation] = useLocation();

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
              {scan.reportObjectPath && (
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
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
