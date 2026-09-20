/**
 * DeepSeek API pricing (USD per 1M tokens).
 * Update these when DeepSeek changes pricing.
 *
 * Functionality:
 * - Holds per-model input/output prices for DeepSeek chat and reasoner models.
 * - Computes run cost in cents from token counts.
 * - Formats costs and token counts for display.
 *
 * Notes:
 * - Pricing values must be kept in sync with DeepSeek's public rates.
 *
 * @author mrpi
 * @date 2026-09-16
 */

export const DEEPSEEK_PRICING = {
  "deepseek-chat": {
    inputPerMillion: 0.14,
    outputPerMillion: 0.28,
  },
  "deepseek-reasoner": {
    inputPerMillion: 0.55,
    outputPerMillion: 2.19,
  },
} as const;

/** Union of model ids that have pricing defined. */
export type DeepSeekModel = keyof typeof DEEPSEEK_PRICING;

/**
 * Calculate cost in cents given token counts and model.
 */
export function calculateCostCents(
  model: DeepSeekModel,
  tokenIn: number,
  tokenOut: number
): number {
  const pricing = DEEPSEEK_PRICING[model] ?? DEEPSEEK_PRICING["deepseek-chat"];
  const inputCost = (tokenIn / 1_000_000) * pricing.inputPerMillion * 100;
  const outputCost = (tokenOut / 1_000_000) * pricing.outputPerMillion * 100;
  return Math.round(inputCost + outputCost);
}

/** Format cents as a USD string like "$0.42" */
export function formatCostCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format token count as a human-readable string like "12.3K" */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
