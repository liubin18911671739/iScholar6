/**
 * LMS gradebook helpers (CSV/JSON shapes for Canvas/Moodle import).
 * Full LTI 1.3 AGS passback is out of scope; this package is import-ready.
 *
 * Functionality:
 * - Defines the learner/score shape shared with LMS export and AGS passback.
 * - Builds import rows for Canvas, Moodle, and a generic CSV format.
 * - Converts 0–100 scores to unit scores and to AGS score objects.
 *
 * Notes:
 * - `toAgsScoreLines` produces AGS-like objects only; actual POSTing lives in lib/lms/lti/ags.ts.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** A single learner's overall and per-task scores for LMS export. */
export type GradebookLearner = {
  learnerId: string;
  displayName?: string | null;
  email?: string | null;
  /** 0–100 overall or null if unscored */
  overall: number | null;
  status: string;
  taskScores: Record<string, number | null>;
  completedAt?: string | null;
};

/** Supported LMS import row formats. */
export type LmsGradebookFormat = "generic" | "canvas" | "moodle";

/** Map 0–100 overall → 0–1 for Canvas points_possible=1 style. */
export function toUnitScore(overall: number | null): number | null {
  if (overall == null || Number.isNaN(overall)) return null;
  return Math.max(0, Math.min(1, overall / 100));
}

/**
 * Build rows for LMS CSV import.
 * - generic: same as mapGradebookForExport
 * - canvas: Student, ID, SIS User ID, SIS Login ID, Section, Overall
 * - moodle: First name, Last name, Email address, Overall grade
 */
export function buildLmsGradebookRows(
  learners: GradebookLearner[],
  format: LmsGradebookFormat,
  options?: { courseName?: string; section?: string }
): Array<Record<string, unknown>> {
  if (format === "canvas") {
    return learners.map((row) => ({
      Student: row.displayName ?? "",
      ID: row.learnerId,
      "SIS User ID": "",
      "SIS Login ID": row.email ?? "",
      Section: options?.section ?? options?.courseName ?? "",
      Overall: row.overall ?? "",
      "Overall (0-1)": toUnitScore(row.overall) ?? "",
      Status: row.status,
    }));
  }
  if (format === "moodle") {
    return learners.map((row) => {
      const name = (row.displayName ?? "").trim();
      const parts = name.split(/\s+/);
      const first = parts[0] ?? "";
      const last = parts.slice(1).join(" ") || "";
      return {
        "First name": first,
        "Last name": last,
        "Email address": row.email ?? "",
        "ID number": row.learnerId,
        "Overall grade": row.overall ?? "",
        Status: row.status,
      };
    });
  }

  // generic
  return learners.map((row) => {
    const base: Record<string, unknown> = {
      learner_id: row.learnerId,
      display_name: row.displayName ?? null,
      email: row.email ?? null,
      overall: row.overall,
      status: row.status,
      completed_at: row.completedAt ?? null,
    };
    for (const [taskId, score] of Object.entries(row.taskScores)) {
      base[`score_${taskId}`] = score;
    }
    return base;
  });
}

/** AGS-like score objects (for future LTI passback wiring). */
export function toAgsScoreLines(
  learners: GradebookLearner[],
  lineItemId = "urn:ischolar:overall"
): Array<{
  userId: string;
  scoreGiven: number | null;
  scoreMaximum: number;
  activityProgress: string;
  gradingProgress: string;
  comment?: string;
  lineItemId: string;
}> {
  return learners.map((row) => ({
    userId: row.learnerId,
    scoreGiven: row.overall,
    scoreMaximum: 100,
    activityProgress: row.status === "completed" ? "Completed" : "InProgress",
    gradingProgress: row.overall != null ? "FullyGraded" : "Pending",
    comment: row.displayName ? `iScholar grade for ${row.displayName}` : undefined,
    lineItemId,
  }));
}
