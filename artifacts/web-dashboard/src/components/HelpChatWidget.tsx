import React, { useState, useRef, useEffect, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  HelpCircle,
  X,
  Send,
  Loader2,
  Bot,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const GOLD = "#C9A84C";
const BLACK = "#111111";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_CHIPS = [
  "How do I create a quote?",
  "How does Smart Estimator work?",
  "How do I add a daily report?",
  "How do I invite a team member?",
  "How do I use Voice Estimator on mobile?",
];

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-5 px-1">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

function formatWithLinks(text: string) {
  const emailRegex = /support@sitesnap\.io/g;
  const parts = text.split(emailRegex);
  const result: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    result.push(<React.Fragment key={`p-${i}`}>{part}</React.Fragment>);
    if (i < parts.length - 1) {
      result.push(
        <a
          key={`link-${i}`}
          href="mailto:support@sitesnap.io"
          className="underline font-medium"
          style={{ color: GOLD }}
        >
          support@sitesnap.io
        </a>,
      );
    }
  });
  return result;
}

export function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const unreadCount = messages.filter(
    (m, i) => m.role === "assistant" && !open && i === messages.length - 1,
  ).length;

  useEffect(() => {
    if (open && !minimised) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [messages, open, minimised]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput("");

      const newMessages: Msg[] = [...messages, { role: "user", content: trimmed }];
      setMessages(newMessages);
      setLoading(true);

      try {
        const data = await customFetch<{ reply: string }>("/api/help/chat", {
          method: "POST",
          body: JSON.stringify({
            message: trimmed,
            history: messages.slice(-10),
          }),
        });
        setMessages([...newMessages, { role: "assistant", content: data.reply }]);
      } catch {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content:
              "Sorry, I had trouble connecting. Please try again or contact support@sitesnap.io for help.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading],
  );

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setMinimised(false);
  };

  const handleClose = () => {
    setOpen(false);
    setMinimised(false);
  };

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-3 shadow-2xl transition-all hover:scale-105 active:scale-95"
          style={{ background: BLACK, border: `2px solid ${GOLD}`, color: "#FFF" }}
          aria-label="Open help chat"
        >
          <HelpCircle size={18} style={{ color: GOLD }} />
          <span className="text-sm font-semibold tracking-wide">Help</span>
          {unreadCount > 0 && (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: GOLD, color: BLACK }}
            >
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            width: 360,
            height: minimised ? "auto" : 520,
            background: "#FFFFFF",
            border: `1.5px solid #E5E7EB`,
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ background: BLACK, borderBottom: `1px solid ${GOLD}33` }}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
              style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}44` }}
            >
              <Bot size={16} style={{ color: GOLD }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">Site Snap Help</p>
              <p className="text-xs leading-tight" style={{ color: `${GOLD}CC` }}>
                Ask anything about the app
              </p>
            </div>
            <button
              onClick={() => setMinimised((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
              title={minimised ? "Expand" : "Minimise"}
            >
              <Minus size={15} className="text-white/60" />
            </button>
            <button
              onClick={handleClose}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
              title="Close"
            >
              <X size={15} className="text-white/60" />
            </button>
          </div>

          {/* Body */}
          {!minimised && (
            <>
              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-3">
                {!hasMessages ? (
                  <div className="flex flex-col items-center pt-4 pb-2 text-center">
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center mb-3"
                      style={{ background: `${GOLD}15` }}
                    >
                      <Bot size={22} style={{ color: GOLD }} />
                    </div>
                    <p className="text-sm font-semibold text-foreground">How can I help?</p>
                    <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-[260px]">
                      Ask me how to use any feature in Site Snap. If I can't help, I'll connect you with support.
                    </p>
                    <div className="flex flex-col gap-1.5 w-full">
                      {QUICK_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          onClick={() => send(chip)}
                          className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-amber-300 hover:bg-amber-50/50 transition-colors"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex gap-2 max-w-full",
                          msg.role === "user" ? "justify-end" : "justify-start",
                        )}
                      >
                        {msg.role === "assistant" && (
                          <div
                            className="h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}33` }}
                          >
                            <Bot size={12} style={{ color: GOLD }} />
                          </div>
                        )}
                        <div
                          className={cn(
                            "max-w-[82%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                            msg.role === "user"
                              ? "text-white rounded-br-sm"
                              : "bg-muted border border-border rounded-bl-sm text-foreground",
                          )}
                          style={
                            msg.role === "user"
                              ? { background: BLACK }
                              : undefined
                          }
                        >
                          {msg.role === "assistant"
                            ? formatWithLinks(msg.content)
                            : msg.content}
                        </div>
                      </div>
                    ))}

                    {loading && (
                      <div className="flex gap-2 justify-start">
                        <div
                          className="h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}33` }}
                        >
                          <Bot size={12} style={{ color: GOLD }} />
                        </div>
                        <div className="bg-muted border border-border rounded-xl rounded-bl-sm px-3 py-2">
                          <TypingDots />
                        </div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Input area */}
              <div
                className="flex-shrink-0 px-3 py-2.5 border-t border-border"
                style={{ background: "#FAFAFA" }}
              >
                <div className="flex gap-2 items-end">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask a question… (Enter to send)"
                    className="min-h-[38px] max-h-28 resize-none text-xs"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    onClick={() => send(input)}
                    disabled={!input.trim() || loading}
                    className="h-9 w-9 flex-shrink-0"
                    style={
                      input.trim() && !loading
                        ? { background: BLACK }
                        : undefined
                    }
                  >
                    {loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                  Can't find what you need?{" "}
                  <a
                    href="mailto:support@sitesnap.io"
                    className="underline font-medium"
                    style={{ color: GOLD }}
                  >
                    support@sitesnap.io
                  </a>
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
