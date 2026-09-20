/**
 * Sensitive Content (lib/privacy/sensitive-content.ts)
 *
 * Functionality:
 * - Detects PII categories (phone, email, national id, student id) in free text via regexes.
 * - Summarizes matches and masks detected spans with placeholder tokens.
 * - Supports field-level masking and multi-field concatenation for form scans.
 *
 * Notes:
 * - Masking replaces matches right-to-left and drops overlapping spans to keep indices valid.
 * - Audit helpers expose counts only and never raw matched values.
 *
 * @author mrpi
 * @date 2026-09-16
 */

export const SENSITIVE_MASK_TOKENS: Record<string, string> = {
  phone: "[PHONE]",
  email: "[EMAIL]",
  national_id: "[NATIONAL_ID]",
  student_id: "[STUDENT_ID]",
};

// Category → detection regex pairs; `g` is added per scan to avoid shared state.
const PATTERNS: Array<[string, RegExp]> = [
  ["phone", /(?:\+?86[- ]?)?1[3-9]\d{9}/],
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["national_id", /\b\d{17}[\dXx]\b/],
  ["student_id", /(?:学号|student\s*id)\s*[:：]?\s*[A-Za-z0-9-]{5,}/i],
];

/** A detected sensitive substring with its category, position, and length. */
export interface SensitiveMatch {
  category: string;
  index: number;
  length: number;
  /** Original matched substring (for preview only — do not log to remote). */
  value?: string;
}

/** Total and per-category counts of sensitive matches. */
export interface SensitiveSummary {
  total: number;
  byCategory: Record<string, number>;
}

/** Result of masking text: redacted text plus match details and summary. */
export interface MaskResult {
  text: string;
  applied: number;
  matches: SensitiveMatch[];
  summary: SensitiveSummary;
  changed: boolean;
}

/** Detect all sensitive matches across categories, sorted by position. */
export function detectSensitiveContent(value: string): SensitiveMatch[] {
  return PATTERNS.flatMap(([category, pattern]) => {
    const matches: SensitiveMatch[] = [];
    const globalPattern = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
    let match: RegExpExecArray | null;
    while ((match = globalPattern.exec(value)) !== null) {
      matches.push({
        category,
        index: match.index,
        length: match[0].length,
        value: match[0],
      });
    }
    return matches;
  }).sort((a, b) => a.index - b.index);
}

/** True when the text contains at least one sensitive match. */
export function containsSensitiveContent(value: string) {
  return detectSensitiveContent(value).length > 0;
}

/** Aggregate matches into total and per-category counts. */
export function summarizeSensitiveMatches(matches: SensitiveMatch[]): SensitiveSummary {
  const byCategory: Record<string, number> = {};
  for (const match of matches) {
    byCategory[match.category] = (byCategory[match.category] ?? 0) + 1;
  }
  return { total: matches.length, byCategory };
}

/**
 * Replace detected sensitive spans with category tokens.
 * Processes matches from right to left so indices stay valid.
 * Overlapping matches: keep the earlier (leftmost) span.
 */
export function maskSensitiveContent(value: string, tokens = SENSITIVE_MASK_TOKENS): MaskResult {
  const raw = detectSensitiveContent(value);
  // Drop overlaps (keep earlier / longer first by index).
  const nonOverlap: SensitiveMatch[] = [];
  let cursor = -1;
  for (const match of raw) {
    if (match.index < cursor) continue;
    nonOverlap.push(match);
    cursor = match.index + match.length;
  }

  let text = value;
  for (let i = nonOverlap.length - 1; i >= 0; i -= 1) {
    const match = nonOverlap[i];
    const token = tokens[match.category] ?? "[REDACTED]";
    text = text.slice(0, match.index) + token + text.slice(match.index + match.length);
  }

  const summary = summarizeSensitiveMatches(nonOverlap);
  return {
    text,
    applied: nonOverlap.length,
    matches: nonOverlap,
    summary,
    changed: nonOverlap.length > 0,
  };
}

/** Apply one-click mask to every string field in a record. */
export function maskSensitiveFields(
  fields: Record<string, string>,
  tokens = SENSITIVE_MASK_TOKENS
): { fields: Record<string, string>; applied: number; changed: boolean; summary: SensitiveSummary } {
  let applied = 0;
  const byCategory: Record<string, number> = {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const result = maskSensitiveContent(value, tokens);
    next[key] = result.text;
    applied += result.applied;
    for (const [cat, count] of Object.entries(result.summary.byCategory)) {
      byCategory[cat] = (byCategory[cat] ?? 0) + count;
    }
  }
  return {
    fields: next,
    applied,
    changed: applied > 0,
    summary: { total: applied, byCategory },
  };
}

/** Join all string values for scanning multi-field forms. */
export function joinTextFields(fields: Record<string, unknown>): string {
  return Object.values(fields)
    .map((v) => (v == null ? "" : String(v)))
    .join("\n");
}

/** Safe summary for consent/audit payloads (counts only, no raw PII). */
export function sensitiveScanForAudit(value: string): SensitiveSummary {
  return summarizeSensitiveMatches(detectSensitiveContent(value));
}
