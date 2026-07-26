import { useState } from "react";
import { useLocation } from "wouter";
import { Headphones, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVoiceInspectionList, type VoiceInspectionFilters } from "@/hooks/voice-inspection/useVoiceInspection";
import { useCompanyMembers } from "@/hooks/cor-compliance/useCompanyMembers";
import { ProjectSelect } from "@/components/voice-inspection/ProjectSelect";

const RISK_COLOR: Record<string, string> = {
  critical: "#dc2626", high: "#d97706", medium: "#ca8a04", low: "#16a34a",
};

const PASS_COLOR: Record<string, string> = {
  pass: "#16a34a", conditional: "#d97706", fail: "#dc2626",
};

/** Voice Notes & Inspections history — filterable by project, date, severity, and submitter. */
export function InspectionHistoryTab() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [severityLevel, setSeverityLevel] = useState<string>("all");
  const [submittedByUserId, setSubmittedByUserId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const membersQuery = useCompanyMembers();
  const [, setLocation] = useLocation();

  const filters: VoiceInspectionFilters = {
    projectId: projectId ?? undefined,
    severityLevel: severityLevel === "all" ? undefined : severityLevel,
    submittedByUserId: submittedByUserId === "all" ? undefined : parseInt(submittedByUserId),
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data, isLoading, isError } = useVoiceInspectionList(filters);
  const inspections = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs text-zinc-400 mb-1 block">Project</Label>
          <ProjectSelect
            value={projectId}
            onChange={setProjectId}
            allowAll
            placeholder="All projects"
          />
        </div>
        <div>
          <Label className="text-xs text-zinc-400 mb-1 block">Severity</Label>
          <Select value={severityLevel} onValueChange={setSeverityLevel}>
            <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
              <SelectItem value="all" style={{ color: "#e5e5e5" }}>All severities</SelectItem>
              {(["critical", "high", "medium", "low"] as const).map((s) => (
                <SelectItem key={s} value={s} style={{ color: RISK_COLOR[s] }}>{s.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-zinc-400 mb-1 block">Submitter</Label>
          <Select value={submittedByUserId} onValueChange={setSubmittedByUserId}>
            <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
              <SelectItem value="all" style={{ color: "#e5e5e5" }}>Everyone</SelectItem>
              {(membersQuery.data?.members ?? []).map((m) => (
                <SelectItem key={m.id} value={String(m.id)} style={{ color: "#e5e5e5" }}>
                  {m.firstName} {m.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-zinc-400 mb-1 block">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
          </div>
          <div>
            <Label className="text-xs text-zinc-400 mb-1 block">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
      ) : isError ? (
        <div className="py-10 text-center text-sm text-red-400">Could not load inspection history.</div>
      ) : inspections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-zinc-600">
          <Headphones className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">No voice notes or inspections match these filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {inspections.map((inspection) => {
            const riskColor = RISK_COLOR[inspection.severityLevel ?? "low"];
            const passColor = PASS_COLOR[inspection.passStatus ?? "conditional"];
            return (
              <Card
                key={inspection.id}
                className="cursor-pointer transition-colors hover:brightness-110"
                style={{ background: "#111111", border: "1px solid #2a2a2a" }}
                onClick={() => setLocation(`/voice-inspection/${inspection.id}`)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {inspection.equipmentOrArea ?? inspection.siteAddress ?? "Voice inspection"}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {inspection.projectName ?? "Unknown project"}
                      {inspection.submitterName ? ` · ${inspection.submitterName}` : ""}
                      {" · "}{new Date(inspection.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold" style={{ color: passColor }}>
                      {(inspection.passStatus ?? "conditional").toUpperCase()}
                    </p>
                    <p className="text-sm font-bold" style={{ color: riskColor }}>
                      {(inspection.severityLevel ?? "low").toUpperCase()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
