/**
 * ConsentAuditPanel (components/training/consent-audit-panel.tsx)
 *
 * Functionality:
 * - Shows AI-consent audit records for a program's training submissions along with aggregate stats.
 * - Fetches `/api/training/programs/:programId/consents?purpose=training_submit` and supports manual refresh.
 * - Renders per-record badges for redaction confirmation and sensitive-content hits detected at scan time.
 *
 * Notes:
 * - Uses the `training.manage` i18n namespace and `RemoteLoadError` for retry UI.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";

/** A single consent audit record. */
type ConsentRow = {
  id: string;
  userId: string;
  displayName?: string | null;
  trainingTaskId?: string | null;
  purpose: string;
  redactionConfirmed: boolean;
  sensitiveScan?: { total?: number; byCategory?: Record<string, number> };
  consentedAt: string;
};

/** Aggregate consent statistics for a program. */
type Stats = {
  total: number;
  trainingSubmit: number;
  redactionConfirmed: number;
  hadSensitiveAtScan: number;
};

/** Program consent-audit panel listing submission consents and aggregate stats. */
export function ConsentAuditPanel({ programId }: { programId: string }) {
  const t = useTranslations("training.manage");
  const [rows, setRows] = useState<ConsentRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch the latest consent records and stats for the program.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/training/programs/${programId}/consents?purpose=training_submit&pageSize=15`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(String(json.error ?? "LOAD_FAILED"));
      }
      const json = await res.json();
      setRows(json.data ?? []);
      setStats(json.stats ?? null);
    } catch (e) {
      setRows([]);
      setStats(null);
      setError(e instanceof Error ? e.message : t("consentLoadError"));
    } finally {
      setLoading(false);
    }
  }, [programId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{t("consentAuditTitle")}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {t("actions.refresh")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("consentAuditHint")}</p>
        <RemoteLoadError error={error || null} onRetry={() => void load()} />
        {stats && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">
              {t("consentStats.total", { count: stats.total })}
            </Badge>
            <Badge variant="outline">
              {t("consentStats.submits", { count: stats.trainingSubmit })}
            </Badge>
            <Badge variant="outline">
              {t("consentStats.redacted", { count: stats.redactionConfirmed })}
            </Badge>
            <Badge variant={stats.hadSensitiveAtScan > 0 ? "destructive" : "outline"}>
              {t("consentStats.sensitiveHits", { count: stats.hadSensitiveAtScan })}
            </Badge>
          </div>
        )}
        {rows.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">{t("consentEmpty")}</p>
        )}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-xs"
            >
              <div>
                <div className="font-medium">
                  {row.displayName || row.userId}
                  {row.trainingTaskId && (
                    <span className="ml-2 text-muted-foreground">{row.trainingTaskId}</span>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {new Date(row.consentedAt).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {row.redactionConfirmed && (
                  <Badge variant="secondary">{t("consentRedacted")}</Badge>
                )}
                {(row.sensitiveScan?.total ?? 0) > 0 ? (
                  <Badge variant="destructive">
                    {t("consentSensitiveAtScan", { count: row.sensitiveScan?.total ?? 0 })}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t("consentCleanScan")}</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
