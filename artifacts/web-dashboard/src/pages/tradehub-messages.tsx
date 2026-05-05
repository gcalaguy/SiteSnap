import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format, isToday, isYesterday } from "date-fns";
import {
  ArrowLeft, Send, Loader2, MessageCircle, Plus, Search, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

function formatTime(date: string) {
  const d = new Date(date);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

// ── New Conversation Dialog ────────────────────────────────────────────────────
function NewConversationDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const { data: results = [], isLoading } = useQuery<any[]>({
    queryKey: ["tradehub-user-search", search],
    queryFn: () => customFetch(`/api/tradehub/users/search?q=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 2,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/tradehub/conversations", {
        method: "POST",
        body: JSON.stringify({ recipientId: selectedUser.id, message }),
      }),
    onSuccess: (data: any) => {
      onCreated(data.conversationId);
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message ?? "Failed to start conversation", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!selectedUser ? (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or trade…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              {search.length >= 2 && (
                <div className="mt-2 border rounded-xl divide-y max-h-52 overflow-y-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : results.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No users found</p>
                  ) : (
                    results.map((u: any) => {
                      const initials = u.displayName?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() ?? "??";
                      return (
                        <button
                          key={u.userId}
                          onClick={() => setSelectedUser(u)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{u.displayName}</p>
                            <p className="text-xs text-muted-foreground">{u.trade ?? "No trade set"}{u.province ? ` · ${u.province}` : ""}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl mb-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                  {selectedUser.displayName?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{selectedUser.displayName}</p>
                  <p className="text-xs text-muted-foreground">{selectedUser.trade}</p>
                </div>
                <button onClick={() => setSelectedUser(null)} className="text-xs text-muted-foreground hover:text-foreground">Change</button>
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your first message…"
                rows={4}
                autoFocus
              />
            </div>
          )}
        </div>
        {selectedUser && (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!message.trim() || createMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TradehubMessagesPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const [newMessage, setNewMessage] = useState("");
  const [showNew, setShowNew] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading: loadingConvs } = useQuery<any[]>({
    queryKey: ["tradehub-conversations"],
    queryFn: () => customFetch("/api/tradehub/conversations"),
    refetchInterval: 10000,
  });

  const { data: messages = [], isLoading: loadingMsgs } = useQuery<any[]>({
    queryKey: ["tradehub-messages", conversationId],
    queryFn: () => customFetch(`/api/tradehub/conversations/${conversationId}/messages`),
    enabled: !!conversationId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark read when viewing a conversation
  useEffect(() => {
    if (!conversationId) return;
    customFetch(`/api/tradehub/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
  }, [conversationId, messages.length]);

  const sendMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/tradehub/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: newMessage }),
      }),
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["tradehub-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["tradehub-conversations"] });
    },
  });

  const activeConv = conversations.find((c: any) => String(c.id) === conversationId);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (newMessage.trim()) sendMutation.mutate();
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/tradehub">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="p-2 bg-[#0A0A0A] rounded-xl">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Messages</h1>
            <p className="text-sm text-muted-foreground">Direct messages across TradeHub</p>
          </div>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-2">
          <Plus className="h-4 w-4" />New Message
        </Button>
      </div>

      <div className="grid lg:grid-cols-5 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Conversations List */}
        <div className="lg:col-span-2 border rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
                <Button size="sm" onClick={() => setShowNew(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />Start one
                </Button>
              </div>
            ) : (
              conversations.map((conv: any) => {
                const other = conv.otherParticipant;
                const initials = other?.displayName?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() ?? "??";
                const isActive = String(conv.id) === conversationId;
                const hasUnread = conv.unreadCount > 0;

                return (
                  <button
                    key={conv.id}
                    onClick={() => setLocation(`/tradehub/messages/${conv.id}`)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/30 last:border-0 ${isActive ? "bg-primary/10" : "hover:bg-muted/50"}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <p className={`text-sm truncate ${hasUnread ? "font-semibold" : "font-medium"}`}>
                          {other?.displayName ?? "Unknown"}
                        </p>
                        <p className="text-[10px] text-muted-foreground flex-shrink-0">
                          {conv.lastMessage ? formatTime(conv.lastMessage.createdAt) : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`text-xs truncate flex-1 ${hasUnread ? "text-foreground" : "text-muted-foreground"}`}>
                          {conv.lastMessage?.content ?? "No messages yet"}
                        </p>
                        {hasUnread && (
                          <span className="w-4 h-4 bg-primary rounded-full text-[10px] text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div className="lg:col-span-3 border rounded-xl overflow-hidden flex flex-col">
          {!conversationId ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-muted-foreground">Select a conversation</p>
                <p className="text-sm text-muted-foreground mt-1">Or start a new one to message any TradeHub member.</p>
              </div>
              <Button onClick={() => setShowNew(true)} className="gap-2 mt-1">
                <Plus className="h-4 w-4" />New Message
              </Button>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-3">
                {activeConv && (
                  <>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                      {activeConv.otherParticipant?.displayName?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{activeConv.otherParticipant?.displayName}</p>
                      <p className="text-xs text-muted-foreground">{activeConv.otherParticipant?.trade}</p>
                    </div>
                    <Link href={`/tradehub/profile/${activeConv.otherParticipant?.userId}`} className="ml-auto">
                      <Button variant="ghost" size="sm" className="text-xs gap-1.5">
                        <Globe className="h-3 w-3" />Profile
                      </Button>
                    </Link>
                  </>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
                  </div>
                ) : (
                  messages.map((msg: any, i: number) => {
                    const isMe = msg.senderId === (me as any)?.id;
                    const showDate = i === 0 || format(new Date(messages[i - 1].createdAt), "yyyy-MM-dd") !== format(new Date(msg.createdAt), "yyyy-MM-dd");

                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex items-center gap-2 my-4">
                            <div className="flex-1 h-px bg-border" />
                            <p className="text-[10px] text-muted-foreground px-2">
                              {isToday(new Date(msg.createdAt)) ? "Today" : isYesterday(new Date(msg.createdAt)) ? "Yesterday" : format(new Date(msg.createdAt), "MMMM d")}
                            </p>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        )}
                        <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/70 text-right" : "text-muted-foreground"}`}>
                              {format(new Date(msg.createdAt), "h:mm a")}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t bg-background flex gap-2 items-end">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (Enter to send)"
                  rows={1}
                  className="resize-none flex-1 max-h-32"
                />
                <Button
                  size="icon"
                  onClick={() => sendMutation.mutate()}
                  disabled={!newMessage.trim() || sendMutation.isPending}
                  className="flex-shrink-0"
                >
                  {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <NewConversationDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ["tradehub-conversations"] });
          setLocation(`/tradehub/messages/${id}`);
        }}
      />
    </div>
  );
}
