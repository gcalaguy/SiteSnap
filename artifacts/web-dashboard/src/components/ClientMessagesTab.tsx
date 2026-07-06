import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageCircle, Send, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const GOLD = "#C9A84C";

type PortalMessage = {
  id: number;
  projectId: number;
  senderRole: "client" | "contractor";
  senderName: string;
  message: string;
  createdAt: string;
};

type Props = {
  projectId: number;
};

export default function ClientMessagesTab({ projectId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading, isError, error } = useQuery<PortalMessage[]>({
    queryKey: ["portal-messages", projectId],
    queryFn: () => customFetch<PortalMessage[]>(`/api/projects/${projectId}/portal/messages`),
    refetchInterval: 15_000,
    retry: false,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      customFetch<PortalMessage>(`/api/projects/${projectId}/portal/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      }),
    onSuccess: (newMsg) => {
      qc.setQueryData<PortalMessage[]>(["portal-messages", projectId], (prev) =>
        prev ? [...prev, newMsg] : [newMsg]
      );
      setReply("");
    },
    onError: (e: unknown) =>
      toast({ title: e instanceof Error ? e.message : "Failed to send reply", variant: "destructive" }),
  });

  function handleSend() {
    if (!reply.trim() || sendMutation.isPending) return;
    sendMutation.mutate(reply.trim());
  }

  // No active portal (API returns 400 "No active portal link")
  const noPortal =
    isError && error instanceof Error && error.message.includes("No active portal");

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading messages…
        </CardContent>
      </Card>
    );
  }

  if (noPortal) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium">No client portal active for this project</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Generate and share a portal link from the Overview tab so clients can message you.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-sm text-destructive">Failed to load messages.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["portal-messages", projectId] })}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const msgs = messages ?? [];

  return (
    <Card className="flex flex-col" style={{ minHeight: 520 }}>
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" style={{ color: GOLD }} />
            Client Messages
          </CardTitle>
          <div className="flex items-center gap-3">
            {msgs.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {msgs.length} message{msgs.length !== 1 ? "s" : ""}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => qc.invalidateQueries({ queryKey: ["portal-messages", projectId] })}
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Message thread */}
      <CardContent className="flex-1 overflow-y-auto py-4 px-4 space-y-3" style={{ maxHeight: 400 }}>
        {msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12 text-center">
            <MessageCircle className="h-9 w-9 text-muted-foreground/25" />
            <p className="text-sm text-muted-foreground">No messages yet from the client.</p>
            <p className="text-xs text-muted-foreground">
              Once the client sends a message through their portal, it will appear here.
            </p>
          </div>
        ) : (
          msgs.map((msg) => {
            const isContractor = msg.senderRole === "contractor";
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 ${isContractor ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    isContractor
                      ? "rounded-br-sm"
                      : "rounded-bl-sm"
                  }`}
                  style={
                    isContractor
                      ? { background: GOLD, color: "#111" }
                      : { background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }
                  }
                >
                  {msg.message}
                </div>
                <div className="flex items-center gap-1.5 px-1">
                  <span className="text-[11px] text-muted-foreground font-medium">
                    {isContractor ? msg.senderName : "Client"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </CardContent>

      {/* Reply box */}
      <div className="border-t p-4 flex flex-col gap-2">
        <Textarea
          placeholder="Reply to client…"
          className="resize-none text-sm min-h-[72px]"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">⌘ Enter to send</span>
          <Button
            size="sm"
            disabled={!reply.trim() || sendMutation.isPending}
            onClick={handleSend}
            style={{ background: GOLD, color: "#111" }}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Send Reply
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
