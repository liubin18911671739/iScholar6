/**
 * Agent Page Template (components/agents/agent-page-template.tsx)
 *
 * Functionality:
 * - Generic client shell that renders any agent page from an AgentPageConfig (inputs, workspace, outputs, tabs).
 * - Manages field state with debounced localStorage drafts plus IndexedDB restore, and handles sensitive-content masking.
 * - Gates AI runs behind sensitive-content scanning and recorded user consent, then delegates to useAgentRun.
 * - Applies results to manuscripts via standard or custom apply callbacks, including coach/training audit trails.
 *
 * Notes:
 * - Collaborates with useAgentRun, the agent registry, local hooks, and the sensitive-content/audit modules.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type ComponentType } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MarkdownText } from "@/components/ui/markdown-text";
import {
  ModuleWorkspace,
  type AgentStatus,
} from "@/components/module/module-workspace";
import { SubFeatureTabs } from "@/components/module/sub-feature-tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AgentErrorBoundary } from "@/components/agents/error-boundary";
import { useAgentRun } from "@/lib/ai/agents/use-agent-run";
import { getAgentMeta, type AgentId } from "@/lib/ai/agents/registry";
import type { AgentStructuredOutput } from "@/lib/ai/parse-agent-output";
import {
  useLocalManuscripts,
  useLocalSubmissions,
  createManuscript,
  createManuscriptBlock,
  getLatestAgentRunInputs,
} from "@/lib/local/hooks";
import { recordAiConsent } from "@/lib/local/hooks";
import {
  containsSensitiveContent,
  joinTextFields,
  maskSensitiveFields,
  sensitiveScanForAudit,
  summarizeSensitiveMatches,
  detectSensitiveContent,
} from "@/lib/privacy/sensitive-content";
import { SensitiveRedactionPanel } from "@/components/privacy/sensitive-redaction-panel";
import { RemoteLoadError, firstRemoteError } from "@/components/collaborative/remote-load-error";
import type { LocalManuscript, LocalSubmission } from "@/lib/local/db";
import { writeAuditEntry, hashContent } from "@/lib/audit/ledger";
import { useSearchParams } from "next/navigation";

// ── Public Types ───────────────────────────────────────────────

/** Props passed to every agent InputsComponent (field state + setter + project id). */
export interface InputProps {
  fieldState: Record<string, string>;
  setField: (key: string, value: string) => void;
  projectId: string;
}

/** Props for an optional custom results renderer. */
export interface ResultsProps {
  results: string;
  status: AgentStatus;
  projectId: string;
  fieldState: Record<string, string>;
}

/** Context passed to onApplyExtra after the standard manuscript block is created. */
export interface ApplyExtraContext {
  results: string;
  projectId: string;
  manuscriptId: string;
  parsedResults: AgentStructuredOutput | null;
  fieldState: Record<string, string>;
}

/** Context passed to a config's customOnApply, replacing the standard apply path. */
export interface FullApplyContext {
  results: string;
  projectId: string;
  parsedResults: AgentStructuredOutput | null;
  fieldState: Record<string, string>;
  manuscripts: LocalManuscript[] | undefined;
  submissions: LocalSubmission[] | undefined;
  handleApply: () => void;
}

/** Props supplied to a custom ModuleContentComponent layout. */
export interface ModuleContentProps {
  inputs: React.ReactNode;
  workspace: React.ReactNode;
  outputs: React.ReactNode;
  status: AgentStatus;
  projectId: string;
  fieldState: Record<string, string>;
  errorMessage?: string | null;
}

/** Declarative description of a single agent page (inputs, outputs, apply, tabs). */
export interface AgentPageConfig {
  agentId: AgentId;
  InputsComponent: ComponentType<InputProps>;
  /** Custom results renderer. Default: `<pre>` tag */
  ResultsComponent?: ComponentType<ResultsProps>;
  OutputComponent: ComponentType<{ projectId: string }>;
  buildRunInput: (fieldState: Record<string, string>) => Record<string, unknown>;
  /** Standard apply: creates manuscript block + calls onApplyExtra */
  manuscriptSection?: string;
  manuscriptOrder?: number;
  onApplyExtra?: (ctx: ApplyExtraContext) => Promise<void>;
  /** Full custom apply (replaces standard pattern). Used by write, submit, rebuttal. */
  customOnApply?: (ctx: FullApplyContext) => Promise<void>;
  /** Custom module layout (replaces default 2-col card grid). Receives slot content. */
  ModuleContentComponent?: ComponentType<ModuleContentProps>;
  /** Sub-feature tabs for this agent. When provided with >1 entries, renders a tab strip. */
  subFeatures?: {
    value: string;
    labelKey: string;
    /** Optional different buildRunInput per sub-feature */
    buildRunInput?: (fieldState: Record<string, string>) => Record<string, unknown>;
  }[];
}

// ── Workspace Skeleton ─────────────────────────────────────────

/** Placeholder cards rendered while an agent run is in flight. */
function WorkspaceSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader>
            <div className="h-5 w-48 bg-muted rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-20 bg-muted rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Template Component ─────────────────────────────────────────

/** Renders the full agent page from a config, wiring drafts, privacy checks, runs, and apply. */
export function AgentPageTemplate({ config }: { config: AgentPageConfig }) {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const trainingTaskId = searchParams?.get("trainingTaskId") ?? undefined;
  const coachMode = searchParams?.get("mode") === "coach" || Boolean(trainingTaskId);
  const tAgents = useTranslations("agents");
  const tCommon = useTranslations("common");
  const tModuleSub = useTranslations("module.subFeatures");
  const {
    status,
    progress,
    results,
    errorMessage,
    parsedResults,
    handleRun,
    handleApprove,
    handleReject,
    handleRerun,
    handleApply,
  } = useAgentRun(config.agentId);
  const { data: manuscripts, error: manuscriptsError, refetch: refetchManuscripts } = useLocalManuscripts(projectId);
  const { data: submissions, error: submissionsError, refetch: refetchSubmissions } = useLocalSubmissions(projectId);
  const remoteDataError = firstRemoteError(manuscriptsError, submissionsError);
  const [fieldState, setFieldState] = useState<Record<string, string>>({});
  const [activeSubFeature, setActiveSubFeature] = useState<string>(
    config.subFeatures?.[0]?.value ?? ""
  );
  const agentName = getAgentMeta(config.agentId)?.name ?? config.agentId;

  // Debounce timer ref for localStorage save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftKey = `ischolar-draft-${projectId}-${config.agentId}`;

  // Restore fieldState from localStorage (and fall back to IndexedDB) on mount
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (!cancelled && parsed && typeof parsed === "object") {
            setFieldState(parsed);
            return;
          }
        }
      } catch { /* ignore parse errors */ }
      // Fallback: restore from last agent run inputs
      try {
        const inputs = await getLatestAgentRunInputs(projectId, config.agentId);
        if (!cancelled && inputs) setFieldState(inputs);
      } catch { /* ignore */ }
    }
    restore();
    return () => { cancelled = true; };
  }, [projectId, config.agentId, draftKey]);

  // Clear localStorage draft when agent run completes successfully
  useEffect(() => {
    if (status === "needs_review" || status === "approved") {
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    }
  }, [status, draftKey]);

  const setField = useCallback((key: string, value: string) => {
    setFieldState((prev) => {
      const next = { ...prev, [key]: value };
      // Debounced save to localStorage
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* ignore */ }
      }, 500);
      return next;
    });
  }, [draftKey]);

  const fieldSensitiveSummary = useMemo(() => {
    return summarizeSensitiveMatches(detectSensitiveContent(joinTextFields(fieldState)));
  }, [fieldState]);

  // Replaces all field values with their masked counterparts and persists the redacted draft.
  function applyFieldMask() {
    const result = maskSensitiveFields(fieldState);
    if (!result.changed) return;
    setFieldState(result.fields);
    try {
      localStorage.setItem(draftKey, JSON.stringify(result.fields));
    } catch {
      /* ignore */
    }
  }

  // Scans inputs for sensitive content, records consent, then launches the agent run.
  async function onRun() {
    const activeSub = config.subFeatures?.find((s) => s.value === activeSubFeature);
    const buildInput = activeSub?.buildRunInput ?? config.buildRunInput;
    const input = buildInput(fieldState);
    const blob = joinTextFields(
      Object.fromEntries(Object.entries(input).map(([k, v]) => [k, String(v ?? "")]))
    );
    if (containsSensitiveContent(blob)) {
      window.alert("检测到可能的敏感信息，请使用「一键遮罩」脱敏后再调用外部 AI 模型。");
      return;
    }
    const confirmed = window.confirm("本次调用会将输入发送给外部 AI 服务。请确认已完成脱敏，并同意调用。");
    if (!confirmed) return;
    let consent;
    try {
      consent = await recordAiConsent({
        projectId,
        purpose: "agent_run",
        dataCategories: ["research_input"],
        externalServices: ["DeepSeek"],
        redactionConfirmed: true,
        sensitiveScan: sensitiveScanForAudit(blob),
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : error && typeof error === "object"
          ? JSON.stringify(error)
          : String(error);
      window.alert(`无法保存 AI 调用授权：${message}`);
      return;
    }
    handleRun(input, consent);
  }

  // Re-checks sensitivity and consent before re-running the agent.
  async function onRerun() {
    const blob = joinTextFields(fieldState);
    if (containsSensitiveContent(blob)) {
      window.alert("检测到可能的敏感信息，请使用「一键遮罩」脱敏后再调用外部 AI 模型。");
      return;
    }
    const confirmed = window.confirm("本次调用会将输入发送到外部 AI 服务。请确认已完成脱敏，并同意调用。");
    if (!confirmed) return;
    try {
      const consent = await recordAiConsent({
        projectId,
        purpose: "agent_run",
        dataCategories: ["research_input"],
        externalServices: ["DeepSeek"],
        redactionConfirmed: true,
        sensitiveScan: sensitiveScanForAudit(blob),
      });
      handleRerun(consent);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      window.alert(`无法保存 AI 调用授权：${message}`);
    }
  }

  const onApply = useCallback(async () => {
    if (!projectId) return;

    // Full custom apply path (write, submit, rebuttal)
    if (config.customOnApply) {
      await config.customOnApply({
        results,
        projectId,
        parsedResults,
        fieldState,
        manuscripts,
        submissions,
        handleApply,
      });
      return;
    }

    // Standard apply path
    if (!results) return;

    let manuscriptId = manuscripts?.[0]?.id;
    if (!manuscriptId) {
      manuscriptId = await createManuscript({
        projectId,
        title: tCommon("unnamedManuscript"),
      });
    }

    const contentWithoutJson = results.replace(/```json[\s\S]*?```/g, "").trim();

    await createManuscriptBlock({
      manuscriptId,
      section: config.manuscriptSection!,
      order: config.manuscriptOrder ?? 0,
      content: contentWithoutJson,
    });

    if (config.onApplyExtra) {
      await config.onApplyExtra({
        results,
        projectId,
        manuscriptId,
        parsedResults,
        fieldState,
      });
    }

    // Coach / training deep-link: write explicit audit trail for manuscript apply.
    if (coachMode || trainingTaskId) {
      try {
        await writeAuditEntry({
          projectId,
          actor: "local",
          action: "training.coach_apply",
          inputHash: await hashContent(
            JSON.stringify({ trainingTaskId, agentId: config.agentId })
          ),
          outputHash: await hashContent(contentWithoutJson.slice(0, 4000)),
        });
      } catch {
        /* audit best-effort */
      }
    }

    handleApply();
  }, [
    results,
    projectId,
    manuscripts,
    submissions,
    parsedResults,
    fieldState,
    config,
    handleApply,
    tCommon,
    coachMode,
    trainingTaskId,
  ]);

  const inputsWithPrivacy = (
    <div className="space-y-3">
      {fieldSensitiveSummary.total > 0 && (
        <SensitiveRedactionPanel
          summary={fieldSensitiveSummary}
          onMask={applyFieldMask}
          disabled={status === "running"}
          compact
        />
      )}
      <config.InputsComponent fieldState={fieldState} setField={setField} projectId={projectId} />
    </div>
  );

  // Workspace content
  const workspace = (
    <div className="space-y-4">
      <RemoteLoadError
        error={remoteDataError}
        onRetry={() => {
          refetchManuscripts();
          refetchSubmissions();
        }}
      />
      {errorMessage && status === "failed" && (
        <div className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
          <p className="font-medium">{agentName} 运行失败</p>
          <p className="mt-1 break-words text-xs">{errorMessage}</p>
        </div>
      )}
      {status === "idle" && (
        <div className="flex items-center justify-center h-full text-muted-foreground py-12">
          {tAgents("configHint")}
        </div>
      )}
      {status === "running" && !results && <WorkspaceSkeleton />}
      {results && config.ResultsComponent && (
        <config.ResultsComponent
          results={results}
          status={status}
          projectId={projectId}
          fieldState={fieldState}
        />
      )}
      {results && !config.ResultsComponent && (
          <MarkdownText content={results} />
      )}
    </div>
  );

  const moduleContent = config.ModuleContentComponent ? (
    <config.ModuleContentComponent
      inputs={inputsWithPrivacy}
      workspace={workspace}
      outputs={<config.OutputComponent projectId={projectId} />}
      status={status}
      projectId={projectId}
      fieldState={fieldState}
      errorMessage={errorMessage}
    />
  ) : undefined;

  // Build sub-feature tabs
  const subFeatureTabs =
    config.subFeatures && config.subFeatures.length > 1 ? (
      <SubFeatureTabs
        options={config.subFeatures.map((sf) => ({
          value: sf.value,
          label: tModuleSub(sf.labelKey),
        }))}
        value={activeSubFeature}
        onChange={setActiveSubFeature}
      />
    ) : undefined;

  return (
    <AgentErrorBoundary>
      <ModuleWorkspace
        agentId={config.agentId}
        projectId={projectId}
        status={status}
        progress={progress}
        errorMessage={errorMessage}
        onRun={onRun}
        onApprove={handleApprove}
        onReject={handleReject}
        onRerun={onRerun}
        onApply={onApply}
        inputs={inputsWithPrivacy}
        workspace={workspace}
        outputs={<config.OutputComponent projectId={projectId} />}
        moduleContent={moduleContent}
        subFeatureTabs={subFeatureTabs}
      />
    </AgentErrorBoundary>
  );
}
