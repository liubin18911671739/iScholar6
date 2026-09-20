/**
 * Sensitive Redaction Panel (components/privacy/sensitive-redaction-panel.tsx)
 *
 * Functionality:
 * - Warns when sensitive content (phone, email, national ID, student ID) is detected in text.
 * - Breaks down matches by category and offers a single action to mask all findings.
 * - Renders nothing when no sensitive content is present and supports a compact layout.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { SensitiveSummary } from "@/lib/privacy/sensitive-content";

// Maps internal sensitive-content categories to translation keys.
const CATEGORY_I18N: Record<string, string> = {
  phone: "phone",
  email: "email",
  national_id: "nationalId",
  student_id: "studentId",
};

/** Alert panel summarizing detected sensitive content with a mask-all action. */
export function SensitiveRedactionPanel({
  summary,
  onMask,
  disabled,
  compact,
}: {
  summary: SensitiveSummary;
  onMask: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("privacy.sensitive");
  if (summary.total <= 0) return null;

  const categories = Object.entries(summary.byCategory).filter(([, n]) => n > 0);

  return (
    <div
      role="alert"
      className={
        compact
          ? "flex flex-col gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          : "space-y-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm"
      }
    >
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="space-y-1">
          <p className="font-medium text-amber-100">{t("title", { count: summary.total })}</p>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {categories.map(([cat, count]) => (
              <li
                key={cat}
                className="rounded border border-amber-400/30 bg-background/40 px-2 py-0.5"
              >
                {t(`categories.${CATEGORY_I18N[cat] ?? "other"}` as "categories.phone")}: {count}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="shrink-0 gap-1"
        onClick={onMask}
        disabled={disabled}
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        {t("maskAll")}
      </Button>
    </div>
  );
}
