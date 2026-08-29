import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Check, Loader2, Sparkles, X } from "lucide-react";
import {
  useGetMe,
  useListAiSkills,
  useGenerateAiSkillDraft,
  useListAiSkillRuns,
  useApproveAiSkillRun,
  useRejectAiSkillRun,
  getListAiSkillRunsQueryKey,
  type AiSkillRun,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getAiErrorMessage } from "@/hooks/useApiError";
import { ProjectSelect } from "@/components/voice-inspection/ProjectSelect";
import { formatDistanceToNow, parseISO } from "date-fns";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

function DraftOutput({ run }: { run: AiSkillRun }) {
  if (run.outputJson) {
    return (
      <div className="space-y-3 text-sm">
        {Object.entries(run.outputJson as Record<string, unknown>).map(([key, value]) => (
          <div key={key}>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{key}</div>
            {Array.isArray(value) ? (
              value.length ? (
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {value.map((v, i) => (
                    <li key={i}>{typeof v === "string" ? v : JSON.stringify(v)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground italic mt-1">None</p>
              )
            ) : (
              <p className="mt-1 whitespace-pre-wrap">{String(value ?? "")}</p>
            )}
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm whitespace-pre-wrap">{run.outputText}</p>;
}

export default function AiSkillDetailPage() {
  const { skillKey } = useParams<{ skillKey: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const { data: skills = [] } = useListAiSkills();
  const skill = skills.find((s) => s.key === skillKey);

  const isPrivileged = me?.role === "owner" || me?.role === "foreman";
  const canGenerate = isPrivileged || (me?.permissions as any)?.useAiSkills === true;

  const [projectId, setProjectId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const generate = useGenerateAiSkillDraft();
  const approve = useApproveAiSkillRun();
  const reject = useRejectAiSkillRun();

  const { data: runsResult, isLoading: runsLoading } = useListAiSkillRuns({ skillKey, limit: 10 });
  const runs = runsResult?.data ?? [];

  function handleGenerate() {
    if (!skillKey) return;
    if (!projectId) {
      toast({ title: "Select a project first", variant: "destructive" });
      return;
    }
    if (!notes.trim()) {
      toast({ title: "Enter some field notes to draft from", variant: "destructive" });
      return;
    }
    generate.mutate(
      { skillKey, data: { projectId, notes: notes.trim() } },
      {
        onSuccess: () => {
          setNotes("");
          queryClient.invalidateQueries({ queryKey: getListAiSkillRunsQueryKey({ skillKey }) });
          toast({ title: "Draft generated" });
        },
        onError: (err) => toast({ title: "Failed to generate draft", description: getAiErrorMessage(err), variant: "destructive" }),
      },
    );
  }

  function handleApprove(id: number) {
    approve.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAiSkillRunsQueryKey({ skillKey }) });
          toast({ title: "Approved" });
        },
        onError: (err) => toast({ title: "Failed to approve", description: getAiErrorMessage(err), variant: "destructive" }),
      },
    );
  }

  function handleReject(id: number) {
    reject.mutate(
      { id, data: {} },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAiSkillRunsQueryKey({ skillKey }) });
          toast({ title: "Rejected" });
        },
        onError: (err) => toast({ title: "Failed to reject", description: getAiErrorMessage(err), variant: "destructive" }),
      },
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <button
        onClick={() => setLocation("/ai-skills")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All skills
      </button>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: BLACK }}>
          <Sparkles className="h-5 w-5" style={{ color: GOLD }} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{skill?.name ?? skillKey}</h1>
          <p className="text-sm text-muted-foreground">{skill?.description}</p>
        </div>
      </div>

      {canGenerate && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <ProjectSelect value={projectId} onChange={setProjectId} placeholder="Select the project this is for" />
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 8000))}
              placeholder="Paste or type your raw field notes here…"
              className="min-h-[140px]"
            />
            <div className="flex justify-end">
              <Button
                onClick={handleGenerate}
                disabled={generate.isPending}
                style={{ background: BLACK, color: GOLD }}
                className="hover:opacity-90"
              >
                {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate draft
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Recent drafts</h2>
        {runsLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No drafts yet for this skill.</p>
        ) : (
          runs.map((run) => (
            <Card key={run.id}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant={run.status === "approved" ? "default" : run.status === "rejected" ? "destructive" : "outline"}>
                    {STATUS_LABEL[run.status] ?? run.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(parseISO(run.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <DraftOutput run={run} />
                {run.status === "pending_approval" && isPrivileged && (
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button size="sm" variant="ghost" onClick={() => handleReject(run.id)} disabled={reject.isPending}>
                      <X className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                    <Button size="sm" onClick={() => handleApprove(run.id)} disabled={approve.isPending} style={{ background: BLACK, color: GOLD }}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
