/**
 * ProgramExportPanel (components/training/program-export-panel.tsx)
 *
 * Functionality:
 * - Lets staff/TA export program data (members, submissions, reviews, gradebook) as CSV or JSON, or as an LMS-formatted gradebook.
 * - Owns scope/format/redaction state; TA callers are forced to redact PII.
 * - Downloads results by fetching the export endpoint and triggering a client-side file download.
 *
 * Notes:
 * - Uses `sonner` toasts and the `training.manage` i18n namespace.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/** Exportable data scopes. */
type Scope = "members" | "submissions" | "reviews" | "gradebook" | "lms";
/** Generic export file formats. */
type Format = "csv" | "json";
/** LMS-specific gradebook CSV formats. */
type LmsFormat = "generic" | "canvas" | "moodle";

/** Panel for exporting program data or an LMS gradebook. */
export function ProgramExportPanel({
  programId,
  forceRedact = false,
}: {
  programId: string;
  /** TA exports always redact PII; checkbox is locked on. */
  forceRedact?: boolean;
}) {
  const t = useTranslations("training.manage");
  const [scope, setScope] = useState<Scope>("members");
  const [format, setFormat] = useState<Format>("csv");
  const [lmsFormat, setLmsFormat] = useState<LmsFormat>("canvas");
  const [redact, setRedact] = useState(true);
  const [busy, setBusy] = useState(false);
  const effectiveRedact = forceRedact || redact;

  // Fetch the chosen export and trigger a client-side download.
  async function download() {
    setBusy(true);
    try {
      if (scope === "lms") {
        const params = new URLSearchParams({
          format: lmsFormat,
          email: effectiveRedact ? "0" : "1",
        });
        const res = await fetch(
          `/api/training/programs/${programId}/lms/gradebook?${params.toString()}`
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          toast.error(String(json.error ?? t("exportFailed")));
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lms-${lmsFormat}-gradebook.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t("exportSuccess"));
        return;
      }

      const params = new URLSearchParams({
        scope,
        format,
        redact: effectiveRedact ? "1" : "0",
      });
      const res = await fetch(
        `/api/training/programs/${programId}/export?${params.toString()}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(String(json.error ?? t("exportFailed")));
        return;
      }
      if (format === "csv") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `training-export-${scope}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const json = await res.json();
        const blob = new Blob([JSON.stringify(json, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `training-export-${scope}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(t("exportSuccess"));
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("exportTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <div className="space-y-1">
          <Label>{t("export.scope")}</Label>
          <select
            className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
          >
            <option value="members">{t("export.members")}</option>
            <option value="submissions">{t("export.submissions")}</option>
            <option value="reviews">{t("export.reviews")}</option>
            <option value="gradebook">{t("export.gradebook")}</option>
            <option value="lms">{t("export.lms")}</option>
          </select>
        </div>
        {scope === "lms" ? (
          <div className="space-y-1">
            <Label>{t("export.lmsFormat")}</Label>
            <select
              className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
              value={lmsFormat}
              onChange={(e) => setLmsFormat(e.target.value as LmsFormat)}
            >
              <option value="canvas">Canvas CSV</option>
              <option value="moodle">Moodle CSV</option>
              <option value="generic">Generic CSV</option>
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <Label>{t("export.format")}</Label>
            <select
              className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm pb-2">
          <input
            type="checkbox"
            checked={effectiveRedact}
            disabled={forceRedact}
            onChange={(e) => setRedact(e.target.checked)}
          />
          {forceRedact ? t("export.redactForced") : t("export.redact")}
        </label>
        <Button onClick={() => void download()} disabled={busy}>
          {t("actions.export")}
        </Button>
      </CardContent>
    </Card>
  );
}
