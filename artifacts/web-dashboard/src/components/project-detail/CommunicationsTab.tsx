import { useState } from "react";
import { Link } from "wouter";
import {
  useListProjectCommunicationThreads,
  getListProjectCommunicationThreadsQueryKey,
  useGetProjectCommunicationThread,
  useSearchProjectCommunications,
  getSearchProjectCommunicationsQueryKey,
  getProjectCommunicationAttachmentUrl,
  type EmailThread,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AttachmentsPanel } from "./comms/AttachmentsPanel";
import { SummariesPanel } from "./comms/SummariesPanel";
import { TimelinePanel } from "./comms/TimelinePanel";
import { SearchPanel } from "./comms/SearchPanel";
import { SuggestedMatchesPanel } from "./comms/SuggestedMatchesPanel";
import {
  Mail,
  Search,
  X,
  Flag,
  ChevronLeft,
  Paperclip,
  ExternalLink,
  AlertCircle,
  Inbox,
  RefreshCw,
} from "lucide-react";

type CommsMode = "inbox" | "attachments" | "summaries" | "timeline" | "search" | "uncategorized" | "suggested";

const MODE_TABS: { value: CommsMode; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "attachments", label: "Attachments" },
  { value: "summaries", label: "AI Summaries" },
  { value: "timeline", label: "Timeline" },
  { value: "search", label: "Search" },
  { value: "suggested", label: "Suggested Matches" },
  { value: "uncategorized", label: "Uncategorized" },
];

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

function AttachmentRow({ projectId, attachment }: { projectId: number; attachment: { id: number; filename: string } }) {
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);

  async function handleOpen() {
    setOpening(true);
    try {
      const result = await getProjectCommunicationAttachmentUrl(projectId, attachment.id);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Failed", description: "Could not open this attachment. Please try again.", variant: "destructive" });
    } finally {
      setOpening(false);
    }
  }

  return (
    <button
      onClick={handleOpen}
      disabled={opening}
      className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:border-primary/40"
    >
      {opening ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-foreground/40" /> : <Paperclip className="w-3.5 h-3.5 text-primary" />}
      <span className="truncate max-w-[160px]">{attachment.filename}</span>
      <ExternalLink className="w-3 h-3 text-foreground/40" />
    </button>
  );
}

function ThreadDetail({ projectId, threadId, onBack }: { projectId: number; threadId: number; onBack: () => void }) {
  const { data, isLoading, isError, refetch } = useGetProjectCommunicationThread(projectId, threadId);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ChevronLeft className="w-4 h-4" /> All threads
      </button>

      {isLoading ? (
        <div className="py-8 text-center text-foreground/60 animate-pulse text-sm">Loading…</div>
      ) : isError || !data ? (
        <div className="py-10 flex flex-col items-center text-center gap-2">
          <AlertCircle className="w-6 h-6 text-foreground/30" />
          <p className="text-sm text-foreground/60">Failed to load thread</p>
          <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
        </div>
      ) : (
        <>
          <h3 className="text-lg font-bold text-foreground">{data.thread.subject || "(no subject)"}</h3>
          <div className="space-y-2.5">
            {data.messages.map((msg) => (
              <Card key={msg.id}>
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{msg.fromName || msg.fromEmail || "Unknown sender"}</p>
                    <span className="text-xs text-foreground/40 shrink-0">{relativeDateLabel(msg.sentAt)}</span>
                  </div>
                  {msg.fromName && msg.fromEmail && <p className="text-xs text-foreground/40 truncate">{msg.fromEmail}</p>}
                  <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">{msg.bodyText || "(no preview available)"}</p>
                  {(msg.attachments ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1.5">
                      {msg.attachments!.map((att) => (
                        <AttachmentRow key={att.id} projectId={projectId} attachment={att} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ThreadCard({ thread, onPress }: { thread: EmailThread; onPress: () => void }) {
  return (
    <button onClick={onPress} className="w-full text-left">
      <Card className="hover:border-primary/40 transition-colors">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {thread.flagged && <Flag className="w-3 h-3 text-red-500 shrink-0" />}
              <p className="text-sm font-semibold truncate">{thread.subject || "(no subject)"}</p>
            </div>
            <p className="text-xs text-foreground/50 truncate">
              {(thread.participantEmails ?? []).slice(0, 2).join(", ") || "Unknown participants"}
              {thread.category ? ` · ${thread.category}` : ""}
            </p>
            {thread.latestAiTrade && (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30 mt-1 capitalize">
                {thread.latestAiTrade}
              </Badge>
            )}
            {thread.latestAiSummary && <p className="text-xs text-foreground/50 mt-1 line-clamp-2">{thread.latestAiSummary}</p>}
          </div>
          <span className="text-xs text-foreground/40 shrink-0">{relativeDateLabel(thread.lastMessageAt)}</span>
        </CardContent>
      </Card>
    </button>
  );
}

export function CommunicationsTab({ projectId }: { projectId: number }) {
  const [mode, setMode] = useState<CommsMode>("inbox");
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const {
    data: listData,
    isLoading: listLoading,
    isError: listIsError,
    refetch: refetchList,
  } = useListProjectCommunicationThreads(projectId, undefined, {
    query: { queryKey: getListProjectCommunicationThreadsQueryKey(projectId), enabled: mode === "inbox" && !search.trim() },
  });

  const { data: searchData, isLoading: searchLoading } = useSearchProjectCommunications(
    projectId,
    { q: search.trim() },
    {
      query: {
        queryKey: getSearchProjectCommunicationsQueryKey(projectId, { q: search.trim() }),
        enabled: mode === "inbox" && !!search.trim(),
      },
    },
  );

  // Shared by every sub-tab that links back to a specific email (AI
  // Summaries, Timeline, Suggested Matches) — jumps to Inbox mode with that
  // thread's detail open, so "back" always lands somewhere sensible.
  function openThread(threadId: number) {
    setMode("inbox");
    setSelectedThreadId(threadId);
  }

  if (selectedThreadId != null) {
    return <ThreadDetail projectId={projectId} threadId={selectedThreadId} onBack={() => setSelectedThreadId(null)} />;
  }

  const isSearching = !!search.trim();
  const isLoading = isSearching ? searchLoading : listLoading;
  const threads = isSearching ? [] : listData?.data ?? [];
  const searchResults = isSearching ? searchData?.results ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {MODE_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setMode(t.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              mode === t.value ? "bg-primary text-black border-primary" : "bg-muted text-foreground/70 border-border hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "attachments" && <AttachmentsPanel projectId={projectId} />}
      {mode === "summaries" && <SummariesPanel projectId={projectId} onOpenThread={openThread} />}
      {mode === "timeline" && <TimelinePanel projectId={projectId} onOpenThread={openThread} />}
      {mode === "search" && <SearchPanel projectId={projectId} />}
      {mode === "suggested" && <SuggestedMatchesPanel projectId={projectId} onOpenThread={openThread} />}

      {mode === "uncategorized" && (
        <div className="py-10 flex flex-col items-center text-center gap-2 border border-dashed border-border rounded-lg">
          <Inbox className="w-6 h-6 text-foreground/30" />
          <p className="text-sm font-medium">Company-wide Uncategorized Inbox</p>
          <p className="text-xs text-foreground/40 max-w-sm">
            Threads land here when they're unassigned to any project — file them from the global inbox (opening it
            here since an unfiled thread can't be scoped to just this project yet).
          </p>
          <Link href="/uncategorized-emails" className="text-xs font-medium text-primary hover:underline">
            Open Uncategorized Inbox
          </Link>
        </div>
      )}

      {mode === "inbox" && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project emails…"
              className="pl-9 pr-9 bg-background border-border"
            />
            {!!search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Clear search">
                <X className="w-4 h-4 text-foreground/40" />
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-foreground/60 animate-pulse text-sm">Loading…</div>
          ) : isSearching ? (
            searchResults.length === 0 ? (
              <div className="py-10 flex flex-col items-center text-center gap-2 border border-dashed border-border rounded-lg">
                <Search className="w-6 h-6 text-foreground/30" />
                <p className="text-sm font-medium">No matches</p>
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map((r) => (
                  <button key={r.id} onClick={() => setSelectedThreadId(r.thread_id)} className="w-full text-left">
                    <Card className="hover:border-primary/40 transition-colors">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Mail className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{r.subject || "(no subject)"}</p>
                          <p className="text-xs text-foreground/50 truncate">{r.from_name || r.from_email || ""}</p>
                        </div>
                        <span className="text-xs text-foreground/40 shrink-0">{relativeDateLabel(r.sent_at)}</span>
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            )
          ) : listIsError ? (
            <div className="py-10 flex flex-col items-center text-center gap-2">
              <AlertCircle className="w-6 h-6 text-foreground/30" />
              <p className="text-sm text-foreground/60">Failed to load communications</p>
              <button onClick={() => refetchList()} className="text-xs text-primary hover:underline">Retry</button>
            </div>
          ) : threads.length === 0 ? (
            <div className="py-10 flex flex-col items-center text-center gap-2 border border-dashed border-border rounded-lg">
              <Inbox className="w-6 h-6 text-foreground/30" />
              <p className="text-sm font-medium">No emails linked yet</p>
              <p className="text-xs text-foreground/40 max-w-sm">
                Connect a mailbox in Email Integrations, then assign relevant threads to this project from the
                Uncategorized tab.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {threads.map((t) => (
                <ThreadCard key={t.id} thread={t} onPress={() => setSelectedThreadId(t.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
