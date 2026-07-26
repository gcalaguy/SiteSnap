import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Loader2, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  useVoiceInspection,
  useCreateVoiceInspectionAction,
  useUpdateVoiceInspectionProject,
} from "@/hooks/voice-inspection/useVoiceInspection";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { ProjectSelect } from "@/components/voice-inspection/ProjectSelect";

const GOLD = "#C9A84C";

const RISK_COLOR: Record<string, string> = {
  critical: "#dc2626", high: "#d97706", medium: "#ca8a04", low: "#16a34a",
};

const PASS_COLOR: Record<string, string> = {
  pass: "#16a34a", conditional: "#d97706", fail: "#dc2626",
};

export default function VoiceInspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const inspectionId = id ? parseInt(id) : null;
  const { data: inspection, isLoading, isError } = useVoiceInspection(inspectionId);
  const [showTranscript, setShowTranscript] = useState(false);
  const createAction = useCreateVoiceInspectionAction(inspectionId ?? 0);
  const updateProject = useUpdateVoiceInspectionProject(inspectionId ?? 0);
  const { data: audioUrl } = useSignedUrl(inspection?.audioObjectPath ?? null);

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>;
  }
  if (isError || !inspection) {
    return <div className="py-20 text-center text-sm text-red-400">Could not load inspection.</div>;
  }

  const riskColor = RISK_COLOR[inspection.severityLevel ?? "low"];
  const passColor = PASS_COLOR[inspection.passStatus ?? "conditional"];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="text-zinc-400" onClick={() => setLocation("/safety-compliance?tab=voice-inspection")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>
        <h1 className="text-xl font-bold text-zinc-100">Voice Inspection #{inspection.id}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
        {inspection.siteAddress && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" style={{ color: GOLD }} />
            {inspection.siteAddress} · {new Date(inspection.gpsCapturedAt).toLocaleString()}
          </div>
        )}
        {inspection.submitterName && (
          <div className="flex items-center gap-1.5">
            <User className="h-4 w-4" style={{ color: GOLD }} />
            {inspection.submitterName}
          </div>
        )}
      </div>

      <div className="max-w-xs">
        <Label className="text-xs text-zinc-400 mb-1 block">Project</Label>
        <ProjectSelect
          value={inspection.projectId}
          onChange={(projectId) => updateProject.mutate(projectId)}
        />
      </div>

      {audioUrl && (
        <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-zinc-500 mb-2">AUDIO RECORDING</p>
            <audio controls src={audioUrl} className="w-full" style={{ height: 36 }} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card style={{ background: `${passColor}1A`, border: `1px solid ${passColor}` }}>
          <CardContent className="p-4">
            <p className="text-xs font-semibold" style={{ color: passColor }}>STATUS</p>
            <p className="text-3xl font-bold mt-1" style={{ color: passColor }}>
              {(inspection.passStatus ?? "conditional").toUpperCase()}
            </p>
          </CardContent>
        </Card>
        <Card style={{ background: `${riskColor}1A`, border: `1px solid ${riskColor}` }}>
          <CardContent className="p-4">
            <p className="text-xs font-semibold" style={{ color: riskColor }}>SEVERITY</p>
            <p className="text-3xl font-bold mt-1" style={{ color: riskColor }}>
              {(inspection.severityLevel ?? "low").toUpperCase()}
            </p>
          </CardContent>
        </Card>
      </div>

      {inspection.immediateActionRequired && (
        <div className="flex items-center gap-2 rounded-lg p-3" style={{ background: "#dc26261a", border: "1px solid #dc2626" }}>
          <AlertTriangle className="h-4 w-4" style={{ color: "#dc2626" }} />
          <span className="text-sm font-semibold" style={{ color: "#dc2626" }}>Immediate action required</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {inspection.equipmentOrArea && (
          <div>
            <p className="text-xs font-semibold text-zinc-500">EQUIPMENT / AREA</p>
            <p className="text-sm text-zinc-200 mt-1">{inspection.equipmentOrArea}</p>
          </div>
        )}
        {inspection.inspectionType && (
          <div>
            <p className="text-xs font-semibold text-zinc-500">INSPECTION TYPE</p>
            <p className="text-sm text-zinc-200 mt-1">{inspection.inspectionType}</p>
          </div>
        )}
        {inspection.locationDetails && (
          <div className="col-span-2">
            <p className="text-xs font-semibold text-zinc-500">LOCATION DETAILS</p>
            <p className="text-sm text-zinc-200 mt-1">{inspection.locationDetails}</p>
          </div>
        )}
      </div>

      {inspection.hazardSummary && (
        <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-zinc-500 mb-2">HAZARD SUMMARY</p>
            <p className="text-sm text-zinc-300 leading-relaxed">{inspection.hazardSummary}</p>
          </CardContent>
        </Card>
      )}

      {inspection.recommendedActions.length > 0 && (
        <Card style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-zinc-500 mb-3">RECOMMENDED ACTIONS</p>
            <ul className="space-y-1.5">
              {inspection.recommendedActions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: GOLD }} />
                  {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div>
        {inspection.capaTicketId ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />Corrective action created
          </span>
        ) : (
          <Button
            size="sm"
            style={{ background: GOLD, color: "#111111" }}
            disabled={createAction.isPending}
            onClick={() => createAction.mutate(undefined)}
          >
            {createAction.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Corrective Action"}
          </Button>
        )}
      </div>

      <button
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-300"
        onClick={() => setShowTranscript((v) => !v)}
      >
        {showTranscript ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {showTranscript ? "Hide" : "Show"} raw transcript
      </button>
      {showTranscript && (
        <p className="text-xs text-zinc-500 leading-relaxed whitespace-pre-wrap">{inspection.transcript}</p>
      )}
    </div>
  );
}
