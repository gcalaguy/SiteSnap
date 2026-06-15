import { useState } from "react";
import { useListFormSubmissions } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, FileCheck, Shield, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";

interface SafetyComplianceTabProps {
  projectId: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  draft: { label: "Draft", color: "text-muted-foreground", bg: "bg-muted border-border", icon: FileCheck },
  submitted: { label: "Submitted", color: "text-blue-400", bg: "bg-blue-950/20 border-blue-900/40", icon: Shield },
  reviewed: { label: "Reviewed", color: "text-amber-400", bg: "bg-amber-950/20 border-amber-900/40", icon: AlertTriangle },
  approved: { label: "Approved", color: "text-green-400", bg: "bg-green-950/20 border-green-900/40", icon: CheckCircle },
};

export default function SafetyComplianceTab({ projectId }: SafetyComplianceTabProps) {
  const { data: submissions = [], isLoading } = useListFormSubmissions({ projectId });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="text-center p-8 border rounded-md bg-card">
        <Shield className="mx-auto h-8 w-8 text-muted-foreground mb-3 animate-pulse" />
        <p className="font-medium">Loading safety & compliance records…</p>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="text-center p-8 border rounded-md bg-card">
        <Shield className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
        <p className="font-medium">No safety & compliance records yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Safety form submissions for this project will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Safety & Compliance</h3>
        <span className="text-sm text-muted-foreground">{submissions.length} total</span>
      </div>

      <div className="space-y-3">
        {submissions.map((s: any) => {
          const isExpanded = expandedId === s.id;
          const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.draft;
          const Icon = cfg.icon;

          return (
            <Card
              key={s.id}
              className={`hover:border-primary/50 transition-colors cursor-pointer select-none ${cfg.bg}`}
              onClick={() => setExpandedId(isExpanded ? null : s.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-muted-foreground shrink-0">
                        {s.templateCategory ?? "safety"}
                      </span>
                      <h4 className="font-bold text-base">{s.templateName ?? "Untitled Form"}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Inspected by {s.workerName ?? "Unknown"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`capitalize ${cfg.color}`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {cfg.label}
                      </Badge>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Submission Date:</span>
                        <p className="font-medium">{s.createdAt ? format(new Date(s.createdAt), "MMM d, yyyy h:mm a") : "N/A"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <p className={`font-medium capitalize ${cfg.color}`}>{s.status}</p>
                      </div>
                      {s.workerEmail && (
                        <div>
                          <span className="text-muted-foreground">Worker Email:</span>
                          <p className="font-medium">{s.workerEmail}</p>
                        </div>
                      )}
                      {s.reviewedAt && (
                        <div>
                          <span className="text-muted-foreground">Reviewed:</span>
                          <p className="font-medium">{format(new Date(s.reviewedAt), "MMM d, yyyy h:mm a")}</p>
                        </div>
                      )}
                      {s.reviewNotes && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Review Notes:</span>
                          <p className="font-medium whitespace-pre-wrap">{s.reviewNotes}</p>
                        </div>
                      )}
                      {s.aiSummary && (
                        <div className="col-span-2 bg-primary/5 border border-primary/10 rounded-md p-3">
                          <span className="text-primary font-medium flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" /> AI Summary
                          </span>
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{s.aiSummary}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
