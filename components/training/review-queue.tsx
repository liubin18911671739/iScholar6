/**
 * ReviewQueue (components/training/review-queue.tsx)
 *
 * Functionality:
 * - Staff/TA review queue for training submissions with filters (task, status, peer status), sorting, and pagination.
 * - Renders each submission's answers, reflection, and evidence cards with feedback templates, score, and claim/unclaim actions.
 * - Posts approve/needs-revision/escalate decisions to `/api/training/reviews` (remote) or local Dexie, then refreshes.
 *
 * Notes:
 * - Uses `sonner` toasts, the `training.review` i18n namespace, and `MVP_TRAINING_TASKS` for filter options.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { createTrainingReview, useReviewQueue } from "@/lib/local/hooks";
import { MVP_TRAINING_TASKS } from "@/lib/training/registry";
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";

/** Evidence card shape tolerant of snake_case or camelCase fields. */
type EvidenceCard = {
  id?: string;
  claim?: string;
  source_excerpt?: string;
  sourceExcerpt?: string;
  verification_status?: string;
  verificationStatus?: string;
};

/** A review row stored against a submission. */
type ReviewRow = {
  id: string;
  decision: string;
  feedback?: string | null;
  score?: number | null;
  created_at: string;
};

/** A remote submission queued for review with related review metadata. */
type RemoteSubmission = {
  id: string;
  task_id: string;
  task_title?: string;
  learner_id: string;
  learner_display_name?: string | null;
  answers: Record<string, string>;
  reflection?: string | null;
  status: string;
  peer_status?: string | null;
  updated_at: string;
  wait_ms?: number;
  claimed_by?: string | null;
  evidence_cards?: EvidenceCard[];
  training_reviews?: ReviewRow[];
  latest_review?: ReviewRow | null;
};

/** Prefilled feedback strings per review decision. */
const FEEDBACK_TEMPLATES = {
  approved: "已通过。论证清晰，请继续保持证据与结论的对应关系。",
  needs_revision: "请补充证据或修正论证后再次提交。重点关注：",
  escalated: "已升级人工处理，请等待进一步通知。",
} as const;

/** Format a wait duration in milliseconds as `h m` or `m`. */
function formatWait(ms?: number): string {
  if (ms == null) return "—";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Staff/TA review queue for pending training submissions. */
export function ReviewQueue() {
  const t = useTranslations("training.review");
  const { data: queue, error: queueError, refetch: refetchQueue } = useReviewQueue();
  const collaborative = true;

  const [remoteQueue, setRemoteQueue] = useState<RemoteSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [remoteQueueError, setRemoteQueueError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [taskFilter, setTaskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [peerStatusFilter, setPeerStatusFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("oldest");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch the filtered, sorted, paginated remote review queue.
  const loadRemote = useCallback(async () => {
    if (!collaborative) return;
    setRemoteQueueError("");
    setForbidden(false);
    const params = new URLSearchParams({
      status: statusFilter,
      page: String(page),
      pageSize: String(pageSize),
      sort,
    });
    if (taskFilter) params.set("taskId", taskFilter);
    if (peerStatusFilter) params.set("peerStatus", peerStatusFilter);
    try {
      const res = await fetch(`/api/training/reviews?${params.toString()}`);
      if (res.status === 403) {
        setForbidden(true);
        setRemoteQueue([]);
        return;
      }
      if (!res.ok) throw new Error("LOAD_FAILED");
      const json = await res.json();
      setRemoteQueue(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch {
      setRemoteQueue([]);
      setRemoteQueueError(t("loadError"));
    }
  }, [collaborative, page, sort, statusFilter, peerStatusFilter, t, taskFilter]);

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  // Post a review decision remotely or save it to local storage.
  async function review(
    submissionId: string,
    decision: "approved" | "needs_revision" | "escalated"
  ) {
    setBusyId(submissionId);
    try {
      if (collaborative) {
        const scoreRaw = scores[submissionId];
        const score =
          scoreRaw != null && scoreRaw !== ""
            ? Number(scoreRaw)
            : decision === "approved"
              ? 100
              : undefined;
        const res = await fetch("/api/training/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submissionId,
            decision,
            feedback: feedback[submissionId],
            score: Number.isFinite(score) ? score : undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(String(json.error ?? t("reviewFailed")));
          return;
        }
        toast.success(t("reviewSuccess"));
        await loadRemote();
        return;
      }
      await createTrainingReview({
        submissionId,
        reviewer: "local-librarian",
        decision,
        feedback: feedback[submissionId],
        score: decision === "approved" ? 100 : undefined,
      });
      toast.success(t("reviewSuccess"));
      refetchQueue();
    } catch {
      toast.error(t("reviewFailed"));
    } finally {
      setBusyId(null);
    }
  }

  // Claim or release a submission for the current reviewer.
  async function claim(submissionId: string, claimValue: boolean) {
    if (!collaborative) return;
    const res = await fetch("/api/training/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, claim: claimValue }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(String(json.error ?? t("claimFailed")));
      return;
    }
    toast.success(claimValue ? t("claimed") : t("unclaimed"));
    await loadRemote();
  }

  // Insert a canned feedback template for a submission.
  function applyTemplate(
    submissionId: string,
    decision: keyof typeof FEEDBACK_TEMPLATES
  ) {
    setFeedback((current) => ({
      ...current,
      [submissionId]: FEEDBACK_TEMPLATES[decision],
    }));
  }

  /** Local-mode queue item shape. */
  type LocalItem = {
    submission: { id: string; answers: Record<string, string>; reflection?: string };
    task?: { title?: string };
    evidence: EvidenceCard[];
  };

  // Normalize local or remote queue rows into a common display shape.
  const items = useMemo(() => {
    if (!collaborative) {
      const localItems = (queue ?? []) as LocalItem[];
      return localItems.map((item) => ({
        id: item.submission.id,
        title: item.task?.title ?? t("taskFallback"),
        answers: item.submission.answers,
        reflection: item.submission.reflection,
        evidence: item.evidence ?? [],
        waitLabel: "—",
        status: "submitted",
        peerStatus: null as string | null,
        learnerLabel: "—",
        claimed: false,
        remote: false as const,
      }));
    }
    return remoteQueue.map((row) => ({
      id: row.id,
      title: row.task_title ?? row.task_id,
      answers: row.answers ?? {},
      reflection: row.reflection,
      evidence: row.evidence_cards ?? [],
      waitLabel: formatWait(row.wait_ms),
      status: row.status,
      peerStatus: row.peer_status ?? null,
      learnerLabel: row.learner_display_name || row.learner_id.slice(0, 8) + "…",
      claimed: Boolean(row.claimed_by),
      remote: true as const,
    }));
  }, [collaborative, queue, remoteQueue, t]);

  const loadError = collaborative ? remoteQueueError : queueError;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (forbidden) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{t("forbidden")}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {collaborative ? t("collabHint") : t("localHint")}
        </p>
      </div>

      {collaborative && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-5">
            <div className="space-y-1">
              <Label>{t("filters.task")}</Label>
              <select
                className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={taskFilter}
                onChange={(e) => {
                  setPage(1);
                  setTaskFilter(e.target.value);
                }}
              >
                <option value="">{t("filters.allTasks")}</option>
                {MVP_TRAINING_TASKS.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("filters.status")}</Label>
              <select
                className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={statusFilter}
                onChange={(e) => {
                  setPage(1);
                  setStatusFilter(e.target.value);
                }}
              >
                <option value="pending">{t("filters.pending")}</option>
                <option value="submitted">{t("filters.submitted")}</option>
                <option value="needs_review">{t("filters.needsReview")}</option>
                <option value="escalated">{t("filters.escalated")}</option>
                <option value="completed">{t("filters.completed")}</option>
                <option value="all">{t("filters.all")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("filters.peerStatus")}</Label>
              <select
                className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={peerStatusFilter}
                onChange={(e) => {
                  setPage(1);
                  setPeerStatusFilter(e.target.value);
                }}
              >
                <option value="">{t("filters.peerAny")}</option>
                <option value="awaiting_peer">{t("filters.peerAwaiting")}</option>
                <option value="peer_done">{t("filters.peerDone")}</option>
                <option value="peer_skipped">{t("filters.peerSkipped")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("filters.sort")}</Label>
              <select
                className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
              >
                <option value="oldest">{t("filters.oldest")}</option>
                <option value="newest">{t("filters.newest")}</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={() => void loadRemote()}>
                {t("actions.refresh")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <RemoteLoadError
        error={loadError || null}
        onRetry={() => (collaborative ? void loadRemote() : refetchQueue())}
      />

      {!loadError && items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      )}

      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base flex flex-wrap items-center gap-2">
              {item.title}
              <Badge variant="outline">{item.status}</Badge>
              {item.peerStatus && item.peerStatus !== "none" && (
                <Badge variant="secondary">{item.peerStatus}</Badge>
              )}
              {item.claimed && <Badge>{t("claimedBadge")}</Badge>}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("metaLine", { learner: item.learnerLabel, wait: item.waitLabel })}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 rounded border p-3 text-sm">
              {Object.entries(item.answers).filter(([k]) => !k.startsWith("__"))
                .length === 0 ? (
                <p className="text-muted-foreground">{t("noAnswers")}</p>
              ) : (
                Object.entries(item.answers)
                  .filter(([k]) => !k.startsWith("__"))
                  .map(([k, v]) => {
                    let display = v;
                    try {
                      const parsed = JSON.parse(v) as { rows?: unknown };
                      if (parsed && Array.isArray(parsed.rows)) {
                        display = JSON.stringify(parsed.rows, null, 2);
                      }
                    } catch {
                      /* plain text */
                    }
                    return (
                      <div key={k} className="border-b border-border/40 pb-2 last:border-0">
                        <p className="text-xs font-medium text-muted-foreground">
                          [{k}]
                        </p>
                        <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">
                          {display}
                        </pre>
                      </div>
                    );
                  })
              )}
            </div>
            {/* Structured step feedback: prefix lines as stepId: comment for P3 */}
            <p className="text-[11px] text-muted-foreground">
              Tip: feedback may include lines like{" "}
              <code className="rounded bg-muted px-1">object: …</code> per step.
            </p>
            {item.reflection && (
              <div className="rounded border border-dashed p-3 text-sm">
                <span className="font-medium">{t("reflection")}: </span>
                {item.reflection}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t("evidence", { count: item.evidence.length })}
              </p>
              {item.evidence.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("noEvidence")}</p>
              )}
              {item.evidence.map((card, index) => (
                <div key={card.id ?? index} className="rounded border p-2 text-xs">
                  <div className="font-medium">{card.claim}</div>
                  <div className="text-muted-foreground">
                    {card.sourceExcerpt ?? card.source_excerpt}
                  </div>
                  <Badge variant="secondary" className="mt-1 text-[10px]">
                    {card.verificationStatus ?? card.verification_status ?? "unverified"}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => applyTemplate(item.id, "approved")}>
                {t("templates.approved")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => applyTemplate(item.id, "needs_revision")}>
                {t("templates.needsRevision")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => applyTemplate(item.id, "escalated")}>
                {t("templates.escalated")}
              </Button>
            </div>

            <Textarea
              placeholder={t("feedbackPlaceholder")}
              value={feedback[item.id] ?? ""}
              onChange={(event) =>
                setFeedback((current) => ({ ...current, [item.id]: event.target.value }))
              }
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">{t("score")}</Label>
              <Input
                className="h-8 w-24"
                type="number"
                min={0}
                max={100}
                value={scores[item.id] ?? ""}
                onChange={(e) =>
                  setScores((current) => ({ ...current, [item.id]: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {item.remote && item.status === "submitted" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === item.id}
                  onClick={() => void claim(item.id, !item.claimed)}
                >
                  {item.claimed ? t("actions.unclaim") : t("actions.claim")}
                </Button>
              )}
              <Button
                onClick={() => void review(item.id, "approved")}
                disabled={busyId === item.id || (item.remote && item.status !== "submitted")}
              >
                {t("actions.approve")}
              </Button>
              <Button
                variant="outline"
                onClick={() => void review(item.id, "needs_revision")}
                disabled={busyId === item.id || (item.remote && item.status !== "submitted")}
              >
                {t("actions.needsRevision")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void review(item.id, "escalated")}
                disabled={busyId === item.id || (item.remote && item.status !== "submitted")}
              >
                {t("actions.escalate")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {collaborative && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("actions.prev")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("pageLabel", { page, totalPages, total })}
          </span>
          <Button
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("actions.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
