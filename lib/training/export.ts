/**
 * CSV / JSON helpers for training camp staff exports.
 *
 * Functionality:
 * - Serializes row objects to CSV (`toCsv`) with union-of-keys headers and escaping.
 * - Redacts learner emails and ids for privacy-preserving exports.
 * - Maps members / submissions / reviews / gradebook rows into LMS-friendly shapes.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** Serialize rows to CSV using the union of all keys as headers. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );
  // Quote and double-escape cells that contain separators, quotes, or newlines.
  const escape = (value: unknown) => {
    if (value == null) return "";
    const text =
      typeof value === "string"
        ? value
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ];
  return lines.join("\n");
}

/** Partially mask a local part while keeping the domain, for exports. */
export function redactEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const safeUser = user.length <= 2 ? "*".repeat(user.length) : `${user[0]}***${user[user.length - 1]}`;
  return `${safeUser}@${domain}`;
}

/** Show only the first/last characters of an id, or fully mask short ids. */
export function redactId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 8) return "***";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

/** Selectable staff export datasets. */
export type ExportScope = "members" | "submissions" | "reviews" | "gradebook";

/** LMS-friendly gradebook rows (one row per learner). */
export function mapGradebookForExport(
  rows: Array<{
    learnerId: string;
    displayName?: string | null;
    email?: string | null;
    taskScores: Record<string, number | null>;
    overall: number | null;
    status: string;
    completedAt?: string | null;
  }>,
  redact: boolean
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const base: Record<string, unknown> = {
      learner_id: redact ? redactId(row.learnerId) : row.learnerId,
      display_name: row.displayName ?? null,
      email: redact ? redactEmail(row.email) : row.email ?? null,
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

/** Map enrollment rows into an export-safe member list. */
export function mapMembersForExport(
  rows: Array<Record<string, unknown>>,
  redact: boolean
): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    enrollment_id: row.id,
    learner_id: redact ? redactId(String(row.learner_id ?? "")) : row.learner_id,
    display_name: row.display_name ?? row.displayName ?? null,
    email: redact ? redactEmail(row.email as string | undefined) : row.email ?? null,
    role: row.role ?? "learner",
    status: row.status,
    joined_at: row.joined_at ?? row.joinedAt ?? null,
  }));
}

/** Map submission rows into an export-safe submission list. */
export function mapSubmissionsForExport(
  rows: Array<Record<string, unknown>>,
  redact: boolean
): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    submission_id: row.id,
    program_id: row.program_id,
    task_id: row.task_id,
    learner_id: redact ? redactId(String(row.learner_id ?? "")) : row.learner_id,
    status: row.status,
    answers: row.answers,
    reflection: row.reflection ?? null,
    updated_at: row.updated_at,
  }));
}

/** Map review rows into an export-safe review list. */
export function mapReviewsForExport(
  rows: Array<Record<string, unknown>>,
  redact: boolean
): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    review_id: row.id,
    submission_id: row.submission_id,
    reviewer_id: redact ? redactId(String(row.reviewer_id ?? "")) : row.reviewer_id,
    decision: row.decision,
    feedback: row.feedback ?? null,
    score: row.score ?? null,
    created_at: row.created_at,
  }));
}
