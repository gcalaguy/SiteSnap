import { useQueryClient } from "@tanstack/react-query";
import {
  useListUncategorizedEmails,
  getListUncategorizedEmailsQueryKey,
  useAssignEmailThreadToProject,
  useIgnoreUncategorizedEmail,
  type EmailThread,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Check, X, CheckCircle2, AlertCircle } from "lucide-react";

function SuggestionCard({
  thread,
  onConfirm,
  onIgnore,
  onOpenThread,
  busy,
}: {
  thread: EmailThread;
  onConfirm: () => void;
  onIgnore: () => void;
  onOpenThread: () => void;
  busy: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <button onClick={onOpenThread} className="text-left w-full">
          <p className="text-sm font-medium truncate">{thread.subject || "(no subject)"}</p>
          <p className="text-xs text-foreground/50 truncate mt-0.5">
            {(thread.participantEmails ?? []).slice(0, 2).join(", ") || "Unknown participants"}
          </p>
        </button>
        {thread.matchConfidence != null && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1">
            <Zap className="w-3 h-3 text-primary" />
            <span className="text-xs font-semibold text-primary">
              {thread.matchConfidence}% match
              {(thread.matchReasons ?? [])[0]?.value ? ` · ${thread.matchReasons![0].value}` : ""}
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-8 bg-primary text-black hover:bg-primary/90" disabled={busy} onClick={onConfirm}>
            <Check className="w-3.5 h-3.5 mr-1" /> Confirm
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-8 border-border" disabled={busy} onClick={onIgnore}>
            <X className="w-3.5 h-3.5 mr-1" /> Ignore
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SuggestedMatchesPanel({ projectId, onOpenThread }: { projectId: number; onOpenThread: (threadId: number) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useListUncategorizedEmails({ status: "suggested", suggestedProjectId: projectId });
  const threads = data?.data ?? [];

  const { mutateAsync: assignThread, isPending: assigning } = useAssignEmailThreadToProject();
  const { mutateAsync: ignoreThread, isPending: ignoring } = useIgnoreUncategorizedEmail();
  const busy = assigning || ignoring;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListUncategorizedEmailsQueryKey() });
  }

  async function handleConfirm(threadId: number) {
    try {
      await assignThread({ threadId, data: { projectId } });
      invalidate();
    } catch {
      toast({ title: "Failed", description: "Could not confirm this match. Please try again.", variant: "destructive" });
    }
  }

  async function handleIgnore(threadId: number) {
    try {
      await ignoreThread({ threadId });
      invalidate();
    } catch {
      toast({ title: "Failed", description: "Could not ignore this thread. Please try again.", variant: "destructive" });
    }
  }

  if (isLoading) return <div className="py-8 text-center text-foreground/60 animate-pulse text-sm">Loading…</div>;

  if (isError) {
    return (
      <div className="py-10 flex flex-col items-center text-center gap-2">
        <AlertCircle className="w-6 h-6 text-foreground/30" />
        <p className="text-sm text-foreground/60">Failed to load suggested matches</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center text-center gap-2 border border-dashed border-border rounded-lg">
        <CheckCircle2 className="w-6 h-6 text-foreground/30" />
        <p className="text-sm font-medium">No suggested matches</p>
        <p className="text-xs text-foreground/40 max-w-xs">
          When the matching engine finds an unfiled email that's likely part of this project, it'll show up here for
          a quick confirm.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {threads.map((t) => (
        <SuggestionCard
          key={t.id}
          thread={t}
          busy={busy}
          onConfirm={() => handleConfirm(t.id)}
          onIgnore={() => handleIgnore(t.id)}
          onOpenThread={() => onOpenThread(t.id)}
        />
      ))}
    </div>
  );
}
