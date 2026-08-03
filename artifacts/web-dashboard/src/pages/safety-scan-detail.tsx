import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileDown, Loader2, MapPin, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSafetyScan } from "@/hooks/safety-scanner/useSafetyScan";
import type { ScanHazard } from "@/hooks/safety-scanner/useSafetyScan";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { ActionItemDrawer } from "@/components/safety-scanner/ActionItemDrawer";

const GOLD = "hsl(var(--primary))";

const RISK_COLOR: Record<string, string> = {
  critical: "var(--severity-critical)", high: "var(--severity-high)",
  medium: "var(--severity-medium)", low: "var(--severity-low)",
};

function ScanPhoto({ objectPath }: { objectPath: string }) {
  const { data: url } = useSignedUrl(objectPath);
  if (!url) return <div className="w-full h-full animate-pulse bg-muted" />;
  return <img src={url} alt="Scan evidence" className="w-full h-full object-cover" />;
}

export default function SafetyScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const scanId = id ? parseInt(id) : null;
  const { data: scan, isLoading, isError } = useSafetyScan(scanId);
  const [actionHazard, setActionHazard] = useState<ScanHazard | null>(null);

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>;
  }
  if (isError || !scan) {
    return <div className="py-20 text-center text-sm text-red-400">Could not load scan.</div>;
  }

  const riskColor = RISK_COLOR[scan.riskLevel ?? "low"];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="text-zinc-400" onClick={() => setLocation("/safety-compliance?tab=scanner")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>
        <h1 className="text-xl font-bold text-zinc-100">AI Safety Scan #{scan.id}</h1>
      </div>

      {scan.siteAddress && (
        <div className="flex items-center gap-1.5 text-sm text-zinc-400">
          <MapPin className="h-4 w-4" style={{ color: GOLD }} />
          {scan.siteAddress} · {new Date(scan.gpsCapturedAt).toLocaleString()}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card style={{ background: "var(--surface-inverted)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-zinc-500">COMPLIANCE SCORE</p>
            <p className="text-3xl font-bold text-zinc-100 mt-1">{scan.complianceScore ?? 0}%</p>
          </CardContent>
        </Card>
        <Card style={{ background: `color-mix(in srgb, ${riskColor} 10%, transparent)`, border: `1px solid ${riskColor}` }}>
          <CardContent className="p-4">
            <p className="text-xs font-semibold" style={{ color: riskColor }}>RISK LEVEL</p>
            <p className="text-3xl font-bold mt-1" style={{ color: riskColor }}>
              {(scan.riskLevel ?? "low").toUpperCase()}
            </p>
          </CardContent>
        </Card>
      </div>

      {scan.summary && (
        <Card style={{ background: "var(--surface-inverted)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-zinc-500 mb-2">AI SUMMARY</p>
            <p className="text-sm text-zinc-300 leading-relaxed">{scan.summary}</p>
          </CardContent>
        </Card>
      )}

      <Card style={{ background: "var(--surface-inverted)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-zinc-500 mb-3">PPE COMPLIANCE</p>
          <div className="grid grid-cols-2 gap-2">
            {scan.ppeDetected.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {p.present
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span className="text-zinc-300">{p.item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <p className="text-sm font-bold text-zinc-100 mb-3">Hazards ({scan.hazards.length})</p>
        {scan.hazards.length === 0 ? (
          <p className="text-sm text-zinc-500">No hazards identified.</p>
        ) : (
          <div className="space-y-3">
            {scan.hazards.map((h) => {
              const hColor = RISK_COLOR[h.severity];
              return (
                <Card key={h.id} style={{ background: "var(--surface-inverted)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      {h.sourcePhotoObjectPath && (
                        <div className="w-24 h-24 rounded-lg overflow-hidden shrink-0" style={{ border: `2px solid ${hColor}` }}>
                          <ScanPhoto objectPath={h.sourcePhotoObjectPath} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-3.5 w-3.5" style={{ color: hColor }} />
                          <span className="text-xs font-bold" style={{ color: hColor }}>{h.severity.toUpperCase()}</span>
                        </div>
                        <p className="text-sm font-semibold text-zinc-100">{h.title}</p>
                        <p className="text-xs text-zinc-400 mt-1">{h.description}</p>
                        {h.remediation && (
                          <p className="text-xs text-zinc-300 mt-2">
                            <span className="font-semibold">Remediation: </span>{h.remediation}
                          </p>
                        )}
                        <div className="mt-3">
                          {h.capaTicketId ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />Action created ({h.capaStatus})
                            </span>
                          ) : (
                            <Button size="sm" style={{ background: GOLD, color: "#111111" }} onClick={() => setActionHazard(h)}>
                              Create Corrective Action
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {scan.reportObjectPath && (
        <Button
          variant="outline"
          className="w-full"
          style={{ borderColor: "#2a2a2a", color: GOLD }}
          onClick={() => window.open(`/api/safety/scans/${scan.id}/report`, "_blank")}
        >
          <FileDown className="h-4 w-4 mr-2" />Download PDF Report
        </Button>
      )}

      <ActionItemDrawer scanId={scan.id} hazard={actionHazard} onClose={() => setActionHazard(null)} />
    </div>
  );
}
