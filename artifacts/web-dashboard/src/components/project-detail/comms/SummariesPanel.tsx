import { useListProjectCommunicationSummaries, type MessageSummary } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, AlertCircle } from "lucide-react";

function relativeDateLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function SummaryCard({ summary, onPress }: { summary: MessageSummary; onPress: () => void }) {
  return (
    <button onClick={onPress} className="w-full text-left">
      <Card className="hover:border-primary/40 transition-colors">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate flex-1">{summary.subject || "(no subject)"}</p>
            <span className="text-xs text-foreground/40 shrink-0">{relativeDateLabel(summary.sent_at)}</span>
          </div>
          <p className="text-xs text-foreground/50 truncate mt-0.5">{summary.from_name || summary.from_email || "Unknown sender"}</p>
          {summary.ai_trade && (
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30 mt-1.5 capitalize">
              {summary.ai_trade}
            </Badge>
          )}
          <p className="text-xs text-foreground/70 mt-2 line-clamp-3 leading-relaxed">{summary.ai_summary}</p>
        </CardContent>
      </Card>
    </button>
  );
}

export function SummariesPanel({ projectId, onOpenThread }: { projectId: number; onOpenThread: (threadId: number) => void }) {
  const { data, isLoading, isError, refetch } = useListProjectCommunicationSummaries(projectId);
  const summaries = data?.data ?? [];

  if (isLoading) return <div className="py-8 text-center text-foreground/60 animate-pulse text-sm">Loading…</div>;

  if (isError) {
    return (
      <div className="py-10 flex flex-col items-center text-center gap-2">
        <AlertCircle className="w-6 h-6 text-foreground/30" />
        <p className="text-sm text-foreground/60">Failed to load summaries</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center text-center gap-2 border border-dashed border-border rounded-lg">
        <Zap className="w-6 h-6 text-foreground/30" />
        <p className="text-sm font-medium">No AI summaries yet</p>
        <p className="text-xs text-foreground/40 max-w-xs">
          Summaries appear here shortly after new emails are synced and assigned to this project.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {summaries.map((m) => (
        <SummaryCard key={m.id} summary={m} onPress={() => onOpenThread(m.thread_id)} />
      ))}
    </div>
  );
}
