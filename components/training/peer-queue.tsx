/**
 * PeerReviewQueue (components/training/peer-queue.tsx)
 *
 * Functionality:
 * - Learner-facing peer review queue: lists assigned peer submissions with answers, reflection, and evidence cards.
 * - Collects feedback, an optional score, and selected evidence, then posts an approve/needs-revision decision.
 * - Fetches `/api/training/peer` and reloads the queue after each submitted review.
 *
 * Notes:
 * - Uses `sonner` toasts and the `training.peer` i18n namespace.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";

/** A peer review assignment with the submission payload under review. */
type PeerItem = {
  assignmentId: string;
  submissionId: string;
  taskId: string;
  taskTitle?: string;
  authorToken: string;
  answers: Record<string, string>;
  reflection?: string | null;
  evidenceCards?: Array<{
    id: string;
    claim?: string;
    sourceExcerpt?: string;
    verificationStatus?: string;
  }>;
  assignedAt: string;
};

/** Queue of peer submissions awaiting the learner's review. */
export function PeerReviewQueue() {
  const t = useTranslations("training.peer");
  const [items, setItems] = useState<PeerItem[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, string>>({});
  const [selectedEvidence, setSelectedEvidence] = useState<Record<string, string[]>>({});

  // Load the learner's pending peer review assignments.
  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/training/peer");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(String(json.error ?? "LOAD_FAILED"));
      }
      const json = await res.json();
      setItems(json.data ?? []);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : t("loadError"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Submit a peer decision with feedback, score, and selected evidence.
  async function submit(item: PeerItem, decision: "approved" | "needs_revision") {
    setBusyId(item.assignmentId);
    try {
      const scoreRaw = scores[item.assignmentId];
      const score = scoreRaw ? Number(scoreRaw) : null;
      const res = await fetch("/api/training/peer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: item.assignmentId,
          decision,
          feedback: feedback[item.assignmentId] ?? "",
          score: Number.isFinite(score) ? score : null,
          evidenceCardIds: selectedEvidence[item.assignmentId] ?? [],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(json.error ?? t("submitFailed")));
        return;
      }
      toast.success(t("submitSuccess"));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  // Toggle a selected evidence card for a given assignment.
  function toggleEvidence(assignmentId: string, cardId: string) {
    setSelectedEvidence((prev) => {
      const cur = prev[assignmentId] ?? [];
      const next = cur.includes(cardId) ? cur.filter((id) => id !== cardId) : [...cur, cardId];
      return { ...prev, [assignmentId]: next };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          {t("refresh")}
        </Button>
      </div>
      <RemoteLoadError error={error || null} onRetry={() => void load()} />
      {items.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
      {items.map((item) => (
        <Card key={item.assignmentId}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {item.taskTitle || item.taskId}
            </CardTitle>
            <Badge variant="outline">{item.authorToken}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {Object.entries(item.answers).map(([k, v]) => (
              <div key={k}>
                <div className="text-xs text-muted-foreground">{t("answer", { n: k })}</div>
                <p className="whitespace-pre-wrap rounded border bg-background/40 p-2">{v}</p>
              </div>
            ))}
            {item.reflection && (
              <div>
                <div className="text-xs text-muted-foreground">{t("reflection")}</div>
                <p className="whitespace-pre-wrap rounded border p-2">{item.reflection}</p>
              </div>
            )}
            {(item.evidenceCards?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{t("evidence")}</div>
                {item.evidenceCards!.map((card) => (
                  <label
                    key={card.id}
                    className="flex items-start gap-2 rounded border p-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={(selectedEvidence[item.assignmentId] ?? []).includes(card.id)}
                      onChange={() => toggleEvidence(item.assignmentId, card.id)}
                    />
                    <span>
                      <span className="font-medium">{card.claim}</span>
                      {card.sourceExcerpt && (
                        <span className="mt-1 block text-muted-foreground">{card.sourceExcerpt}</span>
                      )}
                      {card.verificationStatus && (
                        <Badge variant="secondary" className="mt-1 text-[10px]">
                          {card.verificationStatus}
                        </Badge>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <Textarea
              placeholder={t("feedbackPlaceholder")}
              value={feedback[item.assignmentId] ?? ""}
              onChange={(e) =>
                setFeedback((prev) => ({ ...prev, [item.assignmentId]: e.target.value }))
              }
              rows={3}
            />
            <Input
              type="number"
              min={0}
              max={100}
              placeholder={t("scorePlaceholder")}
              value={scores[item.assignmentId] ?? ""}
              onChange={(e) =>
                setScores((prev) => ({ ...prev, [item.assignmentId]: e.target.value }))
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busyId === item.assignmentId}
                onClick={() => void submit(item, "approved")}
              >
                {t("approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === item.assignmentId}
                onClick={() => void submit(item, "needs_revision")}
              >
                {t("needsRevision")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
