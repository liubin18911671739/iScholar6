/**
 * Final Question Checks (lib/training/final-question-checks.ts)
 *
 * Functionality:
 * - Runs lightweight client-side heuristics on a research question statement.
 * - Returns per-check results (`FinalQuestionCheck`) carrying i18n message keys.
 * - Exposes `finalChecksPassed` to gate submission on every check passing.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** Result of one heuristic check on a final research question. */
export interface FinalQuestionCheck {
  id: string;
  ok: boolean;
  /** i18n key under training.learner.finalCheck.* */
  messageKey: string;
}

/** Lightweight client-side heuristics for a research question statement. */
export function checkFinalResearchQuestion(text: string): FinalQuestionCheck[] {
  const t = text.trim();
  const len = t.length;
  return [
    {
      id: "min_length",
      ok: len >= 20,
      messageKey: "minLength",
    },
    {
      id: "has_relation",
      ok: /如何|怎样|是否|什么|哪些|为何|为什么|how|what|why|whether|does|do\s/i.test(
        t
      ) || /[?？]/.test(t),
      messageKey: "hasRelation",
    },
    {
      id: "not_slogan",
      ok: !/^(全面禁止|应该|必须|禁止).{0,20}$/.test(t) && t.length > 15,
      messageKey: "notSlogan",
    },
  ];
}

/** True only when every final-question check passes. */
export function finalChecksPassed(text: string): boolean {
  return checkFinalResearchQuestion(text).every((c) => c.ok);
}
