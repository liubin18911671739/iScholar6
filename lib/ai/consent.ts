/**
 * AI Consent Validation (lib/ai/consent.ts)
 *
 * Functionality:
 * - Defines the consent proof shape sent with external AI requests.
 * - Validates that consent is present, redaction-confirmed, includes DeepSeek, and is fresh.
 *
 * Notes:
 * - Proofs older than the max age (default 30 minutes) are rejected.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** Proof of user consent to send data to an external AI service. */
export interface AiConsentProof {
  consentId: string;
  consentedAt: string;
  externalServices: string[];
  redactionConfirmed: boolean;
}

/** Returns true when the consent proof is complete, includes DeepSeek, and is within max age. */
export function validateAiConsentProof(
  proof: AiConsentProof | undefined,
  now = Date.now(),
  maxAgeMs = 30 * 60 * 1000
) {
  if (!proof?.consentId || !proof.redactionConfirmed) return false;
  if (!proof.externalServices.some((service) => service.toLowerCase() === "deepseek")) return false;
  const consentedAt = Date.parse(proof.consentedAt);
  return Number.isFinite(consentedAt) && now - consentedAt >= 0 && now - consentedAt <= maxAgeMs;
}
