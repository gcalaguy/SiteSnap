import React, { useState, useRef, useEffect, useCallback } from "react";
import { FeatureGuard } from "@/components/FeatureGuard";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useListProjects,
  useGetRecentActivity,
  customFetch,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { getAiErrorMessage } from "@/hooks/useApiError";
import {
  Bot,
  Send,
  Mic,
  MicOff,
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

type ConversationSummary = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type ChatMessage = {
  id: number | string;
  conversationId?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

const MESSAGE_MAX = 4_000;

const QUICK_CHIPS = [
  "What open tasks do I have?",
  "Show me recent daily reports",
  "What RFIs are open?",
  "Who is on my team?",
  "What invoices are pending?",
  "What are my active projects?",
  "Give me safety tips for concrete work",
  "What does NBC say about fall protection?",
];

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-5">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

function AIChatInner() {
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const {
    data: conversations = [],
    refetch: refetchConversations,
  } = useQuery<ConversationSummary[]>({
    queryKey: ["conversations"],
    queryFn: () => customFetch<ConversationSummary[]>("/api/conversations"),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const loadConversation = useCallback(
    async (id: number) => {
      try {
        const data = await customFetch<ConversationSummary & { messages: ChatMessage[] }>(
          `/api/conversations/${id}`,
        );
        setActiveConversationId(id);
        setMessages(data.messages);
      } catch {
        toast({ title: "Failed to load conversation", variant: "destructive" });
      }
    },
    [toast],
  );

  const startNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      setInput("");
      setIsLoading(true);

      const tempId = `tmp-${Date.now()}`;
      const optimisticMsg: ChatMessage = { id: tempId, role: "user", content: trimmed };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        if (activeConversationId === null) {
          const result = await customFetch<{
            conversation: ConversationSummary;
            messages: ChatMessage[];
            reply: string;
          }>("/api/conversations", {
            method: "POST",
            body: JSON.stringify({ message: trimmed, context: buildContext() }),
          });
          setActiveConversationId(result.conversation.id);
          setMessages(result.messages);
          refetchConversations();
        } else {
          const result = await customFetch<{
            message: ChatMessage;
            reply: string;
            aiMessage: ChatMessage;
          }>(`/api/conversations/${activeConversationId}/messages`, {
            method: "POST",
            body: JSON.stringify({ content: trimmed, context: buildContext() }),
          });
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== tempId);
            return [...filtered, result.message, result.aiMessage];
          });
          refetchConversations();
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        toast({ title: "Failed to send message", description: getAiErrorMessage(err), variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    },
    [activeConversationId, isLoading, buildContext, refetchConversations, toast],
  );

  const deleteConversation = useCallback(
    async (id: number, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await customFetch(`/api/conversations/${id}`, { method: "DELETE" });
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setMessages([]);
        }
        refetchConversations();
      } catch {
        toast({ title: "Failed to delete conversation", variant: "destructive" });
      }
    },
    [activeConversationId, refetchConversations, toast],
  );

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (audioChunksRef.current.length === 0) return;

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          setIsTranscribing(true);
          try {
            const result = await customFetch<{ text: string }>("/api/ai/transcribe", {
              method: "POST",
              body: JSON.stringify({ audio: base64, format: "webm" }),
            });
            if (result.text) {
              setInput((prev) => {
                const combined = prev ? `${prev} ${result.text}` : result.text;
                return combined.slice(0, MESSAGE_MAX);
              });
              textareaRef.current?.focus();
            }
          } catch (err) {
            toast({
              title: "Transcription failed",
              description: getAiErrorMessage(err),
              variant: "destructive",
            });
          } finally {
            setIsTranscribing(false);
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice input.",
        variant: "destructive",
      });
    }
  }, [isRecording, toast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[calc(100vh-7rem)] -m-4 md:-m-8 overflow-hidden rounded-lg border border-border bg-background">
      {/* ── Conversation Sidebar ── */}
      <div className="w-60 flex-shrink-0 flex flex-col border-r border-border bg-muted/20">
        <div className="p-3 border-b border-border">
          <Button className="w-full gap-2" size="sm" onClick={startNewChat}>
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {conversations.length === 0 ? (
              <div className="text-center py-10 px-4">
                <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No conversations yet</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={cn(
                    "group flex items-start gap-2 rounded-md px-2.5 py-2 text-sm cursor-pointer hover:bg-muted transition-colors",
                    activeConversationId === conv.id &&
                      "bg-primary/10 text-primary font-medium",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-medium leading-tight">{conv.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(parseISO(conv.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition-opacity flex-shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card shrink-0">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">Site Snap AI</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Construction specialist · Canadian codes
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!hasMessages && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Ask me anything</h3>
              <p className="text-muted-foreground text-sm max-w-sm mt-1 mb-6">
                I can help with projects, Canadian building codes, safety, daily reports, cost
                estimates, and more.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-xl">
                {QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted hover:border-primary/30 transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3 max-w-full",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {msg.role === "assistant" && (
                <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[72%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted border border-border rounded-bl-sm",
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <div className="bg-muted border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-border px-4 py-3 bg-card shrink-0">
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, MESSAGE_MAX))}
                onKeyDown={handleKeyDown}
                placeholder="Ask a construction question… (Enter to send, Shift+Enter for new line)"
                className="min-h-[44px] max-h-36 resize-none text-sm"
                rows={1}
                maxLength={MESSAGE_MAX}
              />
              {input.length >= MESSAGE_MAX * 0.8 && (
                <p className={`text-xs text-right tabular-nums ${input.length >= MESSAGE_MAX ? "text-destructive font-medium" : "text-amber-500"}`}>
                  {input.length.toLocaleString()}/{MESSAGE_MAX.toLocaleString()}
                </p>
              )}
            </div>

            {/* Mic button */}
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={toggleRecording}
              disabled={isTranscribing}
              className={cn("h-11 w-11 flex-shrink-0", isRecording && "animate-pulse")}
              title={isRecording ? "Stop recording" : "Voice input"}
            >
              {isTranscribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isRecording ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>

            {/* Send button */}
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="h-11 w-11 flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {isRecording && (
            <p className="text-xs text-destructive mt-1.5 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-destructive animate-ping" />
              Recording… click the mic again to stop and transcribe
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AIChat() {
  return (
    <FeatureGuard feature="AI_CHAT">
      <AIChatInner />
    </FeatureGuard>
  );
}
