/**
 * ResearchPlan Workflow Panel (components/agents/configs/research-plan/WorkflowPanel.tsx)
 *
 * Functionality:
 * - Collaboration console for the research-plan multi-agent run: stage chips,
 *   quality verdict, and the two operator gates (direction selection + final
 *   approval) backed by the durable backend run.
 * - Derived entirely from run/ artifact state (polling `GET /api/agent/runs/{id}`),
 *   so a page refresh rebuilds the correct view — SSE events only nicify it.
 *
 * Notes:
 * - Gates call `resumeRun` (backend owns the state machine); approve/reject of
 *   the final gate also updates artifacts through the review endpoint.
 *
 * @author mrpi
 * @date 2026-10-23
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarkdownText } from "@/components/ui/markdown-text";
import { Loader2, CheckCircle2, XCircle, CircleDashed } from "lucide-react";
import {
  getRun,
  resumeRun,
  type AgentRunDetail,
  type RunArtifact,
} from "@/lib/client/agents";

type StageKey = "topic" | "litreview" | "design" | "quality" | "summary";

const KIND_BY_STAGE: Record<Exclude<StageKey, "quality">, string> = {
  topic: "topic_proposal",
  litreview: "literature_brief",
  design: "research_design",
  summary: "research_plan",
};

const STAGE_ORDER: StageKey[] = ["topic", "litreview", "design", "quality", "summary"];

interface TopicCandidate {
  title: string;
  gap?: string;
  novelty?: number;
  value?: number;
  feasibility?: number;
  rationale?: string;
}

interface WorkflowPanelProps {
  runId: string | null;
}

/** Extract (best-effort) a typed candidate list from a topic artifact. */
function candidatesFrom(artifact: RunArtifact | undefined): TopicCandidate[] {
  const structured = artifact?.content?.structured as { topics?: TopicCandidate[] } | undefined;
  const topics = structured?.topics;
  return Array.isArray(topics) ? topics.filter((t) => t && t.title) : [];
}

/** Owns polling + gate actions for one research-plan run. */
export function WorkflowPanel({ runId }: WorkflowPanelProps) {
  const t = useTranslations("researchPlan");
  const [detail, setDetail] = useState<AgentRunDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll the durable run; faster while it is active.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const run = await getRun(runId);
        if (!cancelled) setDetail(run);
        const active = run.status === "queued" || run.status === "running";
        timer = setTimeout(tick, active || busy ? 1200 : run.status === "waiting_for_review" ? 4000 : 0);
      } catch {
        if (!cancelled) timer = setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, busy]);

  // A successful resume can leave the run in a human-review state. Clear the
  // local action lock once the durable run is no longer executing so the next
  // approval gate becomes actionable (including after a delayed poll).
  useEffect(() => {
    if (busy && detail && detail.status !== "queued" && detail.status !== "running") {
      setBusy(false);
    }
  }, [busy, detail]);

  const stageDone = useMemo(() => {
    const kinds = new Set((detail?.artifacts ?? []).map((a) => a.kind));
    return {
      topic: kinds.has(KIND_BY_STAGE.topic),
      litreview: kinds.has(KIND_BY_STAGE.litreview),
      design: kinds.has(KIND_BY_STAGE.design),
      quality: kinds.has(KIND_BY_STAGE.summary),
      summary: kinds.has(KIND_BY_STAGE.summary),
    };
  }, [detail]);

  const gateStage: "topic" | "final" | null = useMemo(() => {
    if (detail?.status !== "waiting_for_review") return null;
    return stageDone.summary ? "final" : "topic";
  }, [detail, stageDone]);

  const topicArtifact = detail?.artifacts?.find((a) => a.kind === KIND_BY_STAGE.topic);
  const planArtifact = detail?.artifacts?.find((a) => a.kind === KIND_BY_STAGE.summary);
  const planContent = planArtifact?.content as unknown as
    | { quality?: { verdict?: string; issues?: { step: string; severity: string; note: string }[] }; selectedTopic?: string }
    | undefined;
  const quality = planContent?.quality ?? null;
  const candidates = useMemo(() => candidatesFrom(topicArtifact), [topicArtifact]);
  const selectedTopic = planContent?.selectedTopic ?? null;

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      if (!runId) return;
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
        setBusy(false);
      }
    },
    [runId]
  );

  const chooseDirection = (title: string) => act(() => resumeRun(runId!, true, { selected: title }));
  const rejectDirection = () => act(() => resumeRun(runId!, false));
  const decideFinal = (approved: boolean) => act(() => resumeRun(runId!, approved));

  if (!runId) return null;

  const backendActive = detail?.status === "queued" || detail?.status === "running" || busy;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STAGE_ORDER.map((stage) => {
          const isDone = stageDone[stage];
          const isActive = !isDone && backendActive && stage === STAGE_ORDER.find((s) => !stageDone[s]);
          return (
            <Badge key={stage} variant={stage === "quality" ? "secondary" : isDone ? "default" : isActive ? "outline" : "outline"} className="gap-1">
              {isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : isDone ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3 opacity-50" />}
              {t(`stages.${stage}`)}
            </Badge>
          );
        })}
      </div>

      {quality && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={quality.verdict === "pass" ? "default" : quality.verdict === "blocked" ? "destructive" : "secondary"}>
            {t("quality.verdict")}: {t(`quality.${quality.verdict}`)}
          </Badge>
          {(quality.issues ?? []).slice(0, 3).map((issue, index) => (
            <span key={index} className="rounded bg-muted px-2 py-0.5">
              {issue.step}: {issue.note}
            </span>
          ))}
        </div>
      )}

      {/* Gate 1 — select the research direction */}
      {gateStage === "topic" && candidates.length > 0 && !busy && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("gateTopic.title")}</p>
          {selectedTopic && <p className="text-xs text-muted-foreground">{t("gateTopic.selected")}: {selectedTopic}</p>}
          {candidates.map((candidate) => (
            <div key={candidate.title} className="flex items-center justify-between rounded-md border p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{candidate.title}</p>
                {candidate.gap && <p className="truncate text-xs text-muted-foreground">{candidate.gap}</p>}
              </div>
              <Button size="sm" data-testid="workflow-select-topic" onClick={() => chooseDirection(candidate.title)}>
                {t("gateTopic.select")}
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={rejectDirection}>
            <XCircle className="mr-1 h-3.5 w-3.5" />
            {t("gateTopic.reject")}
          </Button>
        </div>
      )}

      {/* Gate 2 — approve the final plan */}
      {gateStage === "final" && planArtifact && !busy && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("gateFinal.title")}</p>
          <div className="max-h-64 overflow-y-auto rounded-md border p-3">
            <MarkdownText content={planArtifact.content?.text ?? ""} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" data-testid="workflow-approve-final" onClick={() => decideFinal(true)}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              {t("gateFinal.approve")}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => decideFinal(false)}>
              <XCircle className="mr-1 h-3.5 w-3.5" />
              {t("gateFinal.reject")}
            </Button>
          </div>
        </div>
      )}

      {(backendActive || busy) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("status.working")}
        </div>
      )}

      {detail?.status === "succeeded" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {t("status.done")}
        </p>
      )}
      {detail?.status === "failed" && (
        <p className="text-sm text-red-400">{detail.error ?? t("status.failed")}</p>
      )}
      {detail?.status === "cancelled" && <p className="text-sm text-muted-foreground">{t("status.cancelled")}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </Card>
  );
}
