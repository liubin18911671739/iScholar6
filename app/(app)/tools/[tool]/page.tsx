/**
 * Tool Workspace (/tools/[tool])
 *
 * Functionality:
 * - Maps a tool slug to its backing agent and renders the shared ToolWorkspace shell.
 * - Collects tool-specific inputs, runs the agent, and renders markdown or error results.
 * - Gates runs behind a sensitive-content check and an explicit external-AI consent prompt.
 * - Uses a session-scoped virtual project id and cleans up its temp agent runs on unmount.
 *
 * Notes:
 * - Relies on useAgentRun for execution/status and recordAiConsent for the audit trail.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { nanoid } from "nanoid";
import type { AgentId } from "@/lib/ai/agents/registry";
import { isValidAgent, AGENT_META } from "@/lib/ai/agents/registry";
import { ToolWorkspace, type AgentStatus } from "@/components/tools/tool-workspace";
import { useAgentRun } from "@/lib/ai/agents/use-agent-run";
import { MarkdownText } from "@/components/ui/markdown-text";
import { recordAiConsent } from "@/lib/local/hooks";
import { containsSensitiveContent } from "@/lib/privacy/sensitive-content";

/** Maps each standalone tool slug to the agent id that performs the work. */
const TOOL_AGENT_MAP: Record<string, AgentId> = {
  "literature-analysis": "litreview",
  "paper-polishing": "write",
  "journal-selection": "submit",
};

/** Renders the input fields for the current tool slug. */
function ToolInputs({
  toolKey,
  fieldState,
  setField,
}: {
  toolKey: string;
  fieldState: Record<string, string>;
  setField: (key: string, value: string) => void;
}) {
  const t = useTranslations("agentConfig");

  switch (toolKey) {
    case "literature-analysis":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t("searchTerms")}</label>
            <input
              className="w-full rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g., machine learning education"
              value={fieldState.searchTerms ?? ""}
              onChange={(e) => setField("searchTerms", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t("yearRange")}</label>
            <div className="flex items-center gap-2">
              <input
                className="w-full rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="From"
                value={fieldState.yearFrom ?? ""}
                onChange={(e) => setField("yearFrom", e.target.value)}
              />
              <span className="text-xs text-muted-foreground">—</span>
              <input
                className="w-full rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="To"
                value={fieldState.yearTo ?? ""}
                onChange={(e) => setField("yearTo", e.target.value)}
              />
            </div>
          </div>
        </div>
      );

    case "paper-polishing":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Text to Polish</label>
            <textarea
              className="w-full rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={6}
              placeholder="Paste the text you want to polish..."
              value={fieldState.text ?? ""}
              onChange={(e) => setField("text", e.target.value)}
            />
          </div>
        </div>
      );

    case "journal-selection":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t("keywords")}</label>
            <input
              className="w-full rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g., deep learning, NLP, transformer"
              value={fieldState.keywords ?? ""}
              onChange={(e) => setField("keywords", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Abstract</label>
            <textarea
              className="w-full rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={4}
              placeholder="Paste your abstract here..."
              value={fieldState.abstract ?? ""}
              onChange={(e) => setField("abstract", e.target.value)}
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}

/** Standalone tool workspace that resolves the slug to an agent and runs it. */
export default function ToolPage() {
  const params = useParams<{ tool: string }>();
  const toolKey = params.tool;
  const agentId = TOOL_AGENT_MAP[toolKey];
  const t = useTranslations("tools");

  // Create a session-scoped virtual project ID
  const projectIdRef = useRef(`__tool_${nanoid()}`);
  const projectId = projectIdRef.current;

  // Cleanup on unmount
  useEffect(() => {
    const pid = projectIdRef.current;
    return () => {
      // Clean up temp data (fire-and-forget)
      import("@/lib/local/db").then(({ localDB }) => {
        localDB.agentRuns.where("projectId").equals(pid).delete().catch(() => {});
      });
    };
  }, []);

  const [fieldState, setFieldState] = useState<Record<string, string>>({});
  const setField = (key: string, value: string) =>
    setFieldState((prev) => ({ ...prev, [key]: value }));

  const { status, progress, results, errorMessage, handleRun } = useAgentRun(agentId, projectId);

  // Fall back to a not-found message when the slug has no valid agent.
  if (!agentId || !isValidAgent(agentId)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">Tool not found: {toolKey}</p>
          <a href="/tools" className="text-xs text-primary hover:underline">
            {t("backToTools")}
          </a>
        </div>
      </div>
    );
  }

  const agentName = AGENT_META[agentId]?.name ?? agentId;

  return (
    <ToolWorkspace
      agentId={agentId}
      status={status as AgentStatus}
      progress={progress}
      inputs={
        <ToolInputs
          toolKey={toolKey}
          fieldState={fieldState}
          setField={setField}
        />
      }
      workspace={
        <div className="min-h-[200px]">
          {status === "running" ? (
            <p className="text-xs text-muted-foreground animate-pulse">Running {agentName}...</p>
          ) : status === "failed" ? (
            <div className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-200">
              <p className="font-medium">{agentName} 运行失败</p>
              <p className="mt-1 break-words">{errorMessage || "未返回错误详情，请查看开发服务器日志"}</p>
            </div>
          ) : status === "needs_review" || status === "approved" || status === "applied" ? (
            <MarkdownText content={results} className="text-xs text-foreground/80" />
          ) : (
            <p className="text-xs text-muted-foreground">
              Configure inputs and click Run to start.
            </p>
          )}
        </div>
      }
      outputs={
        results && (status === "approved" || status === "applied") ? (
          <div className="cosmic-panel rounded-xl p-4 mt-4">
            <h4 className="text-xs font-medium mb-2">Results</h4>
            <MarkdownText content={results} className="max-h-[300px] overflow-y-auto text-xs text-foreground/80" />
          </div>
        ) : null
      }
      onRun={
        status === "idle" || status === "failed"
          ? async () => {
              const input = buildToolInput(toolKey, fieldState);
              // Block obvious sensitive data before anything leaves the browser.
              const blob = Object.values(input).map(String).join("\n");
              if (containsSensitiveContent(blob)) {
                window.alert("检测到可能的敏感信息，请脱敏后再调用外部 AI 模型。");
                return;
              }
              const confirmed = window.confirm("本次调用会将输入发送给外部 AI 服务。请确认已完成脱敏，并同意调用。");
              if (!confirmed) return;
              try {
                // Persist the user's consent record before dispatching the run.
                const consent = await recordAiConsent({
                  projectId,
                  purpose: "mcp_tool",
                  dataCategories: ["research_input"],
                  externalServices: ["DeepSeek"],
                  redactionConfirmed: true,
                });
                handleRun(input, consent);
              } catch (error) {
                const message = error instanceof Error
                  ? error.message
                  : error && typeof error === "object"
                    ? JSON.stringify(error)
                    : String(error);
                window.alert(`无法保存 AI 调用授权：${message}`);
              }
            }
          : undefined
      }
    />
  );
}

/** Normalizes the tool's form fields into the agent's expected input shape. */
function buildToolInput(
  toolKey: string,
  fieldState: Record<string, string>
): Record<string, unknown> {
  switch (toolKey) {
    case "literature-analysis":
      return {
        query: fieldState.searchTerms ?? "",
        yearFrom: fieldState.yearFrom ? parseInt(fieldState.yearFrom) : undefined,
        yearTo: fieldState.yearTo ? parseInt(fieldState.yearTo) : undefined,
      };
    case "paper-polishing":
      return {
        text: fieldState.text ?? "",
      };
    case "journal-selection":
      return {
        abstract: fieldState.abstract ?? "",
        keywords: fieldState.keywords?.split(",").map((k) => k.trim()) ?? [],
      };
    default:
      return {};
  }
}
