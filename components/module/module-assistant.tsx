/**
 * Module Assistant (components/module/module-assistant.tsx)
 *
 * Functionality:
 * - Renders a right-side chat sheet that talks to the `/api/hermes/chat` agent endpoint.
 * - Streams assistant responses into the transcript and supports clearing and per-agent context.
 * - Authenticates with the Supabase browser session, refreshing near-expiry tokens and redirecting to login when absent.
 *
 * Notes:
 * - Uses the agent registry for naming and the shared stages helpers for accent theming.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Trash2,
  Send,
  Loader2,
  Sparkles,
  User,
} from "lucide-react";
import type { AgentId } from "@/lib/ai/agents/registry";
import { AGENT_META } from "@/lib/ai/agents/registry";
import { getStage, primaryStageForAgent } from "./stages";
import { MarkdownText } from "@/components/ui/markdown-text";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// ── Types ────────────────────────────────────────────────────────

/** A single chat turn in the assistant transcript. */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Props controlling the assistant sheet visibility and agent context. */
interface ModuleAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: AgentId;
}

// ── Component ────────────────────────────────────────────────────

/** Side-sheet chat assistant scoped to the current module's agent. */
export function ModuleAssistant({
  open,
  onOpenChange,
  agentId,
}: ModuleAssistantProps) {
  const t = useTranslations("moduleAssistant");
  // Use runtime Supabase configuration instead of the build-time mode flag.
  // This keeps the browser and server auth paths aligned after env changes.
  const supabase = createSupabaseBrowserClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stage = getStage(primaryStageForAgent(agentId)) ?? {
    accent: {
      text: "text-blue-300",
      nodeBg: "bg-blue-500 text-white",
      nodeBorder: "border-blue-400",
      nodeText: "text-blue-200",
      line: "bg-blue-400/60",
      glow: "",
      chip: "bg-blue-500/15 text-blue-200 border-blue-400/30",
      soft: "ring-blue-400/40",
    },
  };
  const accent = stage.accent;
  const agentName = AGENT_META[agentId as keyof typeof AGENT_META]?.name ?? agentId;

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Focus input when sheet opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // Reset state when changing agents
  useEffect(() => {
    setMessages([]);
    setInput("");
    setStreaming(false);
    setStreamingContent("");
  }, [agentId]);

  // Send the trimmed input as a streamed chat turn and append the reply.
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = {
      id: nanoid(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamingContent("");

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      if (supabase) {
        let session = supabase ? (await supabase.auth.getSession()).data.session : null;
        if (session && session.expires_at && session.expires_at * 1000 <= Date.now() + 30_000) {
          session = (await supabase!.auth.refreshSession()).data.session;
        }
        if (!session) {
          setStreamingContent("协作模式需要登录 Supabase 账号，正在返回登录页。");
          setStreaming(false);
          setTimeout(() => { window.location.assign("/login"); }, 700);
          return;
        }
      }
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const response = await fetch("/api/hermes/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ agentId, messages: history }),
      });

      if (!response.ok) {
        const err = await response.json();
        const message = response.status === 401 && err.error === "UNAUTHENTICATED"
          ? "协作登录已失效，请重新登录后再使用模块助手。"
          : `Error: ${err.error ?? "Request failed"}`;
        setStreamingContent(message);
        // Finalize after a short delay so the user can read the error
        setTimeout(() => {
          setStreamingContent((prev) => {
            if (prev) {
              setMessages((m) => [
                ...m,
                { id: nanoid(), role: "assistant", content: prev },
              ]);
            }
            setStreaming(false);
            setStreamingContent("");
            return "";
          });
        }, 500);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let content = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        content += chunk;
        setStreamingContent(content);
      }

      setMessages((prev) => [
        ...prev,
        { id: nanoid(), role: "assistant", content },
      ]);
      setStreaming(false);
      setStreamingContent("");
    } catch {
      setStreamingContent("Network error. Please try again.");
      setTimeout(() => {
        setStreamingContent((prev) => {
          if (prev) {
            setMessages((m) => [
              ...m,
              { id: nanoid(), role: "assistant", content: prev },
            ]);
          }
          setStreaming(false);
          setStreamingContent("");
          return "";
        });
      }, 500);
    }
  }, [input, streaming, messages, agentId, supabase]);

  // Submit on Enter while preserving Shift+Enter for newlines.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Reset the transcript and streaming state.
  const clearChat = () => {
    setMessages([]);
    setStreamingContent("");
    setStreaming(false);
  };

  // Resolve the agent-specific empty hint, falling back to the topic hint.
  const emptyHintKey = `emptyHint.${agentId}` as "emptyHint.topic";
  const emptyHint = (() => {
    try {
      return t(emptyHintKey);
    } catch {
      return t("emptyHint.topic"); // fallback
    }
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[380px] flex-col p-0 sm:w-[420px]"
      >
        {/* Header */}
        <SheetHeader className="border-b border-border/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className={cn("h-4 w-4", accent.text)} />
              <SheetTitle className="text-sm font-semibold">
                {t("title")}
              </SheetTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={clearChat}
              title={t("clearChat")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("context")}: {agentName}
          </p>
        </SheetHeader>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        >
          {messages.length === 0 && !streamingContent && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-4">
              <Sparkles className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {emptyHint}
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                {t("disclaimer")}
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    accent.nodeBg
                  )}
                >
                  <Sparkles className="h-3 w-3" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed",
                  msg.role === "user"
                    ? "cosmic-panel text-foreground"
                    : "bg-muted/40 text-foreground"
                )}
              >
                {msg.role === "assistant" ? <MarkdownText content={msg.content} className="text-xs" /> : msg.content}
              </div>
              {msg.role === "user" && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {/* Streaming message */}
          {streamingContent && (
            <div className="flex gap-2 justify-start">
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  accent.nodeBg
                )}
              >
                <Sparkles className="h-3 w-3" />
              </div>
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed bg-muted/40 text-foreground">
                <MarkdownText content={streamingContent} className="text-xs" />
                <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-current align-middle" />
              </div>
            </div>
          )}

          {streaming && !streamingContent && (
            <div className="flex gap-2 justify-start">
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  accent.nodeBg
                )}
              >
                <Sparkles className="h-3 w-3" />
              </div>
              <div className="rounded-lg px-3 py-2 bg-muted/40">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border/50 p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("inputPlaceholder")}
              rows={2}
              className={cn(
                "flex-1 resize-none rounded-lg border border-border bg-muted/20 px-3 py-2",
                "text-xs text-foreground placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-1 focus:ring-ring"
              )}
              disabled={streaming}
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
            >
              {streaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground/60 text-center">
            {t("disclaimer")}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
