/**
 * CoachWorkspace (components/training/coach-workspace.tsx)
 *
 * Functionality:
 * - Learner-facing workspace for a single training task: step inputs, reflection, submit checklist, coach/rubric pane, and evidence cards.
 * - Persists drafts and submissions either to the remote `/api/training/me` API or local Dexie, with debounced autosave and an unload guard.
 * - Scans answers for sensitive content with one-click masking, records AI consent on submit, and links agent runs.
 *
 * Notes:
 * - Collaborates with `step-types`, `submit-checklist`, `rubrics`, privacy utilities, `StepRenderer`, and Supabase collaborative auth headers.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLocalProjects } from "@/lib/hooks";
import { recordAiConsent } from "@/lib/client/hooks/consent";
import {
  joinTextFields,
  maskSensitiveContent,
  maskSensitiveFields,
  sensitiveScanForAudit,
  summarizeSensitiveMatches,
  detectSensitiveContent,
} from "@/lib/privacy/sensitive-content";
import { SensitiveRedactionPanel } from "@/components/privacy/sensitive-redaction-panel";
import { createEvidence, getMyTraining, submitTraining, updateEvidence } from "@/lib/client/training";
import { listRuns } from "@/lib/client/agents";
import { toLocalRun } from "@/lib/client/hooks/agent-runs";
import { StepRenderer } from "@/components/training/steps/step-renderer";
import {
  AGENT_RUN_IDS_KEY,
  getTypedTaskDefinition,
  hydrateAnswers,
  isCompareTableComplete,
  parseAgentRunIds,
  typedStepsComplete,
  withAgentRunId,
} from "@/lib/training/step-types";
import {
  buildSubmitChecklist,
  canSubmitFromChecklist,
  countCompletedSteps,
} from "@/lib/training/submit-checklist";
import { buildAgentDeepLink } from "@/lib/training/safe-return";
import { previewRubric } from "@/lib/training/rubrics";
import type { LocalEvidenceCard } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

/** Fallback query result shape used when local hooks return nothing. */
const EMPTY_LIST_QUERY = {
  data: undefined as undefined,
  error: null as string | null,
  refetch: () => {},
};

/** A single review record returned by the remote training API. */
type RemoteReview = {
  id: string;
  decision: string;
  feedback?: string | null;
  score?: number | null;
  created_at: string;
};

/** A remote training submission together with its review timeline. */
type RemoteSubmission = {
  id: string;
  task_id: string;
  program_id: string;
  answers: Record<string, string>;
  reflection?: string | null;
  status: string;
  latest_review?: RemoteReview | null;
  training_reviews?: RemoteReview[];
  evidence_cards?: LocalEvidenceCard[];
};

/** Map a backend camelCase review into the component's review shape. */
function mapRemoteReview(r: { id: string; decision: string; feedback?: string | null; score?: number | null; createdAt: string }): RemoteReview {
  return { id: r.id, decision: r.decision, feedback: r.feedback ?? null, score: r.score ?? null, created_at: r.createdAt };
}

/** Map backend camelCase submissions into the component's submission shape. */
function mapRemoteSubmissions(rows: Array<Record<string, unknown>>): RemoteSubmission[] {
  return rows.map((s) => ({
    id: String(s.id),
    task_id: String(s.taskId ?? ""),
    program_id: String(s.programId ?? ""),
    answers: (s.answers as Record<string, string>) ?? {},
    reflection: (s.reflection as string | null) ?? null,
    status: String(s.status ?? ""),
    latest_review: s.latestReview ? mapRemoteReview(s.latestReview as never) : null,
    training_reviews: ((s.reviews as Array<Record<string, unknown>>) ?? []).map((r) => mapRemoteReview(r as never)),
    evidence_cards: (s.evidenceCards as LocalEvidenceCard[] | undefined) ?? [],
  }));
}

/** Props for {@link CoachWorkspace}. */
type Props = {
  taskId: string;
  /** When true, render dual-pane coach shell (P2). */
  dualPane?: boolean;
  className?: string;
};

/** Task workspace that bridges local drafts and remote submissions for a learner. */
export function CoachWorkspace({ taskId, dualPane = true, className }: Props) {
  const t = useTranslations("training.learner");
  const typed = getTypedTaskDefinition(taskId);
  const projectsQuery = useLocalProjects() ?? EMPTY_LIST_QUERY;
  const { data: projectsData } = projectsQuery;
  const projects = Array.isArray(projectsData) ? projectsData : [];
  const projectId = projects[0]?.id ?? "";

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reflection, setReflection] = useState("");
  const [claim, setClaim] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [message, setMessage] = useState("");
  const [mobileTab, setMobileTab] = useState<"answer" | "coach">("answer");
  const [remoteEnrollment, setRemoteEnrollment] = useState<{
    program_id: string;
    training_programs?: { name: string; status?: string };
  } | null>(null);
  const [remoteSubmissions, setRemoteSubmissions] = useState<RemoteSubmission[]>(
    []
  );
  const dirtyRef = useRef(false);
  const collaborative = true;

  const remoteSubmission = useMemo(
    () => remoteSubmissions.find((s) => s.task_id === taskId),
    [remoteSubmissions, taskId]
  );
  const evidenceCards = useMemo(() => remoteSubmission?.evidence_cards ?? [], [remoteSubmission]);

  // Reload the learner's submissions from the backend.
  const reloadSubmissions = useCallback(async () => {
    const me = await getMyTraining("all");
    setRemoteSubmissions(mapRemoteSubmissions((me.submissions ?? []) as unknown as Array<Record<string, unknown>>));
  }, []);
  const latestReview = remoteSubmission?.latest_review ?? null;
  const reviewTimeline = remoteSubmission?.training_reviews ?? [];
  const needsRevision =
    remoteSubmission?.status === "needs_review" ||
    latestReview?.decision === "needs_revision";
  const isCompleted =
    remoteSubmission?.status === "completed" ||
    latestReview?.decision === "approved";
  const programArchived =
    remoteEnrollment?.training_programs?.status === "archived";

  const stepIds = typed?.steps.map((s) => s.id) ?? [];
  const stepMinChars = typed?.steps.map((s) => s.minChars) ?? [];

  // Load the current remote enrollment and submissions once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMyTraining("all");
        if (cancelled) return;
        const enrollment = me.enrollments?.[0] ?? null;
        setRemoteEnrollment(
          enrollment
            ? {
                program_id: enrollment.programId,
                training_programs: enrollment.program
                  ? { name: enrollment.program.name, status: enrollment.program.status }
                  : undefined,
              }
            : null
        );
        setRemoteSubmissions(mapRemoteSubmissions((me.submissions ?? []) as unknown as Array<Record<string, unknown>>));
      } catch {
        if (!cancelled) {
          setRemoteEnrollment(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Rehydrate answers and reflection from the backend submission payload.
  useEffect(() => {
    const stored = remoteSubmission?.answers ?? {};
    setAnswers(hydrateAnswers(stored, stepIds));
    setReflection(remoteSubmission?.reflection ?? "");
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rehydrate when task or remote payload changes
  }, [remoteSubmission, taskId]);

  const answerBlob = useMemo(
    () =>
      joinTextFields({
        ...Object.fromEntries(
          Object.entries(answers).filter(([k]) => k !== AGENT_RUN_IDS_KEY)
        ),
        reflection,
      }),
    [answers, reflection]
  );
  const sensitiveSummary = useMemo(
    () => summarizeSensitiveMatches(detectSensitiveContent(answerBlob)),
    [answerBlob]
  );
  const hasSensitive = sensitiveSummary.total > 0;

  const stepsComplete = typed
    ? typedStepsComplete(answers, typed.steps)
    : false;

  // Soft evidence hint for review tasks (hard gate when remote evidence UX is complete).
  const checklist = buildSubmitChecklist({
    answers,
    stepCount: typed?.steps.length ?? 0,
    stepAnswersComplete: stepsComplete,
    reflection,
    hasSensitive,
    evidenceCount: typed?.requiresReview
      ? (evidenceCards?.length ?? 0)
      : undefined,
    requireEvidence: false,
  });
  const canSubmit = canSubmitFromChecklist(checklist);

  const completedCount = typed
    ? typed.steps.filter((step) => {
        if (step.type === "compare_table") {
          return isCompareTableComplete(answers[step.id], step.rows ?? 3);
        }
        return (answers[step.id] ?? "").trim().length >= (step.minChars ?? 1);
      }).length
    : countCompletedSteps(answers, stepIds.length, stepMinChars);

  const rubric = useMemo(
    () =>
      typed
        ? previewRubric({
            answers,
            steps: typed.steps,
            reflection,
            evidence: evidenceCards ?? [],
            review: latestReview
              ? ({
                  score: latestReview.score ?? undefined,
                } as never)
              : null,
            requiresReview: typed.requiresReview,
          })
        : null,
    [typed, answers, reflection, evidenceCards, latestReview]
  );

  const collabLockedPending =
    collaborative &&
    remoteSubmission?.status === "submitted" &&
    !needsRevision;
  const locked =
    collabLockedPending || isCompleted || programArchived;

  // Update a single step answer and mark the workspace dirty for autosave.
  function setAnswerField(stepId: string, value: string) {
    dirtyRef.current = true;
    setAnswers((cur) => ({ ...cur, [stepId]: value }));
  }

  // Mask sensitive values across answers and reflection in one action.
  function applyOneClickMask() {
    const maskedAnswers = maskSensitiveFields(answers);
    const maskedReflection = maskSensitiveContent(reflection);
    setAnswers(maskedAnswers.fields);
    setReflection(maskedReflection.text);
    setMessage(
      t("maskApplied", {
        count: maskedAnswers.applied + maskedReflection.applied,
      })
    );
  }

  // Persist a draft or submission remotely or locally, enforcing consent and submit gating.
  const saveSubmission = useCallback(
    async (status: "in_progress" | "submitted") => {
      if (!typed) {
        setMessage(t("loadingTask"));
        return;
      }
      if (programArchived) {
        setMessage(t("archivedBlocked"));
        return;
      }
      if (hasSensitive) {
        setMessage(t("sensitiveBlocked"));
        return;
      }
      if (status === "submitted" && !canSubmit) {
        setMessage(t("checklistTitle"));
        return;
      }

      if (collaborative && remoteEnrollment?.program_id) {
        let consentProof:
          | {
              consentId: string;
              consentedAt: string;
              externalServices: string[];
              redactionConfirmed: true;
            }
          | undefined;
        if (status === "submitted") {
          try {
            const consent = await recordAiConsent({
              // Camp consent is program-scoped; omit the project when absent.
              projectId: projectId || undefined,
              programId: remoteEnrollment.program_id,
              trainingTaskId: taskId,
              purpose: "training_submit",
              dataCategories: ["training_answers", "reflection"],
              externalServices: ["camp_audit"],
              redactionConfirmed: true,
              sensitiveScan: sensitiveScanForAudit(answerBlob),
            });
            consentProof = {
              consentId: consent.id,
              consentedAt: consent.consentedAt,
              externalServices: consent.externalServices,
              redactionConfirmed: true,
            };
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : t("consentFailed")
            );
            return;
          }
        }

        try {
          await submitTraining({
            programId: remoteEnrollment.program_id,
            taskId,
            answers,
            reflection,
            status,
            ...(consentProof
              ? { consentProof: { consentId: consentProof.consentId, consentedAt: consentProof.consentedAt } }
              : {}),
          });
        } catch (error) {
          const code = error instanceof Error ? error.message : "";
          if (code === "SENSITIVE_CONTENT") setMessage(t("sensitiveBlocked"));
          else if (
            code === "CONSENT_REQUIRED" ||
            code === "CONSENT_INVALID" ||
            code === "CONSENT_EXPIRED"
          ) {
            setMessage(t("consentFailed"));
          } else setMessage(code || t("submitFailed"));
          return;
        }
        dirtyRef.current = false;
        setMessage(status === "submitted" ? t("submittedRemote") : t("draftSaved"));
        const me = await getMyTraining("all");
        setRemoteSubmissions(mapRemoteSubmissions((me.submissions ?? []) as unknown as Array<Record<string, unknown>>));
        return;
      }

      if (!remoteEnrollment?.program_id) {
        setMessage(t("needProject"));
      }
    },
    [
      typed,
      t,
      programArchived,
      hasSensitive,
      canSubmit,
      collaborative,
      remoteEnrollment,
      projectId,
      taskId,
      answerBlob,
      answers,
      reflection,
    ]
  );

  // Debounced autosave draft when dirty
  useEffect(() => {
    if (locked || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      if (dirtyRef.current) void saveSubmission("in_progress");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [answers, reflection, locked, saveSubmission]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Create an evidence card tied to the current backend submission.
  async function saveEvidence() {
    if (!remoteSubmission || !claim.trim()) return;
    try {
      await createEvidence(remoteSubmission.id, {
        claim: claim.trim(),
        sourceExcerpt: excerpt.trim(),
        verificationStatus: "unverified",
      });
      await reloadSubmissions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("evidenceFailed"));
      return;
    }
    setClaim("");
    setExcerpt("");
    setMessage(t("evidenceSaved"));
  }

  /** Update an evidence card's verification status. */
  async function setEvidenceStatus(cardId: string, status: string) {
    try {
      await updateEvidence(cardId, { verificationStatus: status });
      await reloadSubmissions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("evidenceFailed"));
    }
  }

  // Attach the most recent matching agent run id to the current answers.
  async function linkLatestAgentRun() {
    if (!projectId || !typed) return;
    const runs = (await listRuns(projectId))
      .map(toLocalRun)
      .filter((run) => run.agent === typed.agent || String(run.agent).includes(typed.agent))
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    const latest = runs.at(-1);
    if (!latest) {
      setMessage(t("agentRunsEmpty"));
      return;
    }
    setAnswers((cur) => withAgentRunId(cur, latest.id));
    dirtyRef.current = true;
    setMessage(t("draftSaved"));
  }

  // Fill answers from the task definition's sample values.
  function fillSample() {
    if (!typed?.sampleAnswers || locked) return;
    setAnswers((cur) => ({
      ...cur,
      ...typed.sampleAnswers,
    }));
    setReflection(
      "示例：已比较三候选并完成一次人工修改（去产品名、补情境），最终问题可检索。"
    );
    dirtyRef.current = true;
  }

  const agentDeepLink =
    projectId && typed
      ? buildAgentDeepLink({
          projectId,
          agent: typed.agent,
          trainingTaskId: taskId,
        })
      : null;

  const linkedRuns = parseAgentRunIds(answers);

  if (!typed) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {t("loadingTask")}
        </CardContent>
      </Card>
    );
  }

  // Primary pane: step inputs, reflection, sensitive-content panel, checklist, and actions.
  const answerPane = (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{typed.description}</p>
      <p className="text-xs text-muted-foreground">
        {t("stepProgress", {
          done: completedCount,
          total: typed.steps.length,
        })}
      </p>

      {typed.sampleAnswers && !locked && (
        <Button type="button" size="sm" variant="secondary" onClick={fillSample}>
          {t("fillSample")}
        </Button>
      )}

      {reviewTimeline.length > 0 && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">{t("feedbackTitle")}</p>
          {reviewTimeline.map((review) => (
            <div key={review.id} className="rounded border bg-background/60 p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{review.decision}</Badge>
                {review.score != null && (
                  <span>{t("scoreLabel", { score: review.score })}</span>
                )}
                <span>{new Date(review.created_at).toLocaleString()}</span>
              </div>
              {review.feedback && (
                <p className="mt-1 whitespace-pre-wrap">{review.feedback}</p>
              )}
            </div>
          ))}
          {needsRevision && (
            <p className="text-xs text-amber-500">{t("resubmitHint")}</p>
          )}
        </div>
      )}

      {typed.steps.map((step, index) => (
        <StepRenderer
          key={step.id}
          taskId={taskId}
          step={step}
          stepIndex={index}
          value={answers[step.id] ?? ""}
          onChange={(v) => setAnswerField(step.id, v)}
          disabled={locked}
        />
      ))}

      <div className="space-y-2">
        <label className="text-sm font-medium">{t("reflection")}</label>
        <Textarea
          value={reflection}
          onChange={(e) => {
            dirtyRef.current = true;
            setReflection(e.target.value);
          }}
          disabled={locked}
        />
      </div>

      {hasSensitive && (
        <SensitiveRedactionPanel
          summary={sensitiveSummary}
          onMask={applyOneClickMask}
          disabled={locked}
        />
      )}

      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{t("checklistTitle")}</p>
        <ul className="space-y-1 text-xs">
          {checklist.map((item) => {
            const label =
              item.id === "steps"
                ? t("checklistSteps")
                : item.id === "reflection"
                  ? t("checklistReflection")
                  : item.id === "sensitive"
                    ? t("checklistSensitive")
                    : item.required
                      ? t("checklistEvidenceRequired")
                      : t("checklistEvidence");
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-2",
                  item.ok ? "text-emerald-500" : "text-muted-foreground"
                )}
              >
                {item.ok ? "✓" : "○"} {label}
                {!item.required && !item.ok ? " (optional)" : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => void saveSubmission("in_progress")}
          disabled={locked || !typed}
        >
          {t("saveDraft")}
        </Button>
        <Button
          onClick={() => void saveSubmission("submitted")}
          disabled={locked || !canSubmit || (collabLockedPending && !needsRevision)}
        >
          {needsRevision ? t("resubmit") : t("submit")}
        </Button>
      </div>
      {message && (
        <p className="flex items-center gap-2 text-sm text-emerald-500">
          <CheckCircle2 className="h-4 w-4" />
          {message}
        </p>
      )}
    </div>
  );

  // Side pane: agent deep link, rubric preview, and linked agent runs.
  const coachPane = (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">{typed.title}</p>
        <p className="text-xs text-muted-foreground">{typed.description}</p>
        {agentDeepLink && (
          <Button asChild size="sm" variant="outline" className="gap-1">
            <Link
              href={agentDeepLink}
              onClick={() => {
                if (dirtyRef.current) void saveSubmission("in_progress");
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("openAgent")}
            </Link>
          </Button>
        )}
      </div>

      {rubric && (
        <div className="space-y-1 rounded border p-3 text-xs">
          <p className="font-medium">{t("rubricTitle")}</p>
          <p>
            {t("rubricSteps")}: {rubric.weights.steps}%{" "}
            {rubric.stepsOk ? "✓" : "○"}
          </p>
          <p>
            {t("rubricReflection")}: {rubric.weights.reflection}%{" "}
            {rubric.reflectionOk ? "✓" : "○"}
          </p>
          <p>
            {t("rubricEvidence")}: {rubric.weights.evidence}% (
            {Math.round(rubric.evidenceRatio * 100)}%)
          </p>
          <p>
            {t("rubricReview")}: {rubric.weights.review}%{" "}
            {rubric.reviewPending ? t("rubricReviewPending") : ""}
          </p>
          <p className="pt-1 font-medium">
            {t("rubricEstimated", { score: rubric.estimated })}
          </p>
        </div>
      )}

      <div className="space-y-2 rounded border p-3 text-xs">
        <p className="font-medium">{t("agentRunsTitle")}</p>
        {linkedRuns.length === 0 ? (
          <p className="text-muted-foreground">{t("agentRunsEmpty")}</p>
        ) : (
          <ul className="list-disc pl-4">
            {linkedRuns.map((id) => (
              <li key={id} className="font-mono">
                {id}
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={locked || !projectId}
          onClick={() => void linkLatestAgentRun()}
        >
          {t("linkLatestRun")}
        </Button>
      </div>
    </div>
  );

  // Evidence pane is only rendered once a backend submission exists.
  const evidencePane = remoteSubmission ? (
    <Card>
      <CardHeader>
        <CardTitle>{t("evidenceTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder={t("claimPlaceholder")}
          />
          <Input
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder={t("excerptPlaceholder")}
          />
        </div>
        <Button onClick={() => void saveEvidence()}>{t("addEvidence")}</Button>
        <div className="space-y-2">
          {evidenceCards?.map((card) => (
            <div
              key={card.id}
              className="flex items-center justify-between rounded border p-3 text-sm"
            >
              <span>
                {card.claim}
                <span className="ml-2 text-muted-foreground">
                  {card.sourceExcerpt}
                </span>
              </span>
              <select
                className="rounded border bg-background p-1"
                value={card.verificationStatus}
                onChange={(e) => void setEvidenceStatus(card.id, e.target.value)}
              >
                <option value="unverified">{t("verify.unverified")}</option>
                <option value="verified">{t("verify.verified")}</option>
                <option value="unsupported">{t("verify.unsupported")}</option>
                <option value="incorrect_source">{t("verify.incorrect")}</option>
              </select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  ) : null;

  if (!dualPane) {
    return (
      <div className={cn("space-y-4", className)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {typed.title}
              {agentDeepLink && (
                <Button asChild size="sm" variant="outline" className="gap-1">
                  <Link href={agentDeepLink}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("openAgent")}
                  </Link>
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>{answerPane}</CardContent>
        </Card>
        {evidencePane}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex gap-2 md:hidden">
        <Button
          size="sm"
          variant={mobileTab === "answer" ? "default" : "outline"}
          onClick={() => setMobileTab("answer")}
        >
          {t("coachTabAnswer")}
        </Button>
        <Button
          size="sm"
          variant={mobileTab === "coach" ? "default" : "outline"}
          onClick={() => setMobileTab("coach")}
        >
          {t("coachTabCoach")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card className={cn(mobileTab !== "answer" && "hidden md:block")}>
          <CardHeader>
            <CardTitle>{typed.title}</CardTitle>
          </CardHeader>
          <CardContent>{answerPane}</CardContent>
        </Card>
        <Card className={cn(mobileTab !== "coach" && "max-md:hidden")}>
          <CardHeader>
            <CardTitle className="text-sm">{t("coachTabCoach")}</CardTitle>
          </CardHeader>
          <CardContent>{coachPane}</CardContent>
        </Card>
      </div>
      {evidencePane}
    </div>
  );
}
