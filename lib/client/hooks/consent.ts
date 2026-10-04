/**
 * AI consent hooks (lib/client/hooks/consent.ts)
 *
 * Records and reads external-AI consent proofs via the backend audit BFF.
 *
 * @author mrpi
 * @date 2026-09-30
 */

"use client";

import { createConsent, listConsents } from "@/lib/client/audit";
import type { AiConsentPurpose, LocalAiConsent } from "@/lib/types/domain";

const CONSENT_TTL_MS = 30 * 60 * 1000;

let latestConsent: LocalAiConsent | undefined;

/** Persist an AI consent record via the audit BFF. */
export async function recordAiConsent(data: {
  projectId?: string;
  programId?: string;
  trainingTaskId?: string;
  purpose?: AiConsentPurpose;
  dataCategories?: string[];
  externalServices: string[];
  redactionConfirmed: boolean;
  sensitiveScan?: LocalAiConsent["sensitiveScan"];
}): Promise<LocalAiConsent> {
  const saved = await createConsent({
    projectId: data.projectId,
    programId: data.programId,
    trainingTaskId: data.trainingTaskId,
    purpose: data.purpose ?? "agent_run",
    dataCategories: data.dataCategories,
    externalServices: data.externalServices,
    redactionConfirmed: data.redactionConfirmed,
    sensitiveScan: data.sensitiveScan,
  });
  latestConsent = saved;
  return saved;
}

/** Most recent valid consent within the freshness window. */
export async function getRecentAiConsent(
  projectId: string,
  trainingTaskId?: string
): Promise<LocalAiConsent | undefined> {
  if (latestConsent?.projectId === projectId && Date.now() - new Date(latestConsent.consentedAt).getTime() < CONSENT_TTL_MS) {
    return latestConsent;
  }
  try {
    const rows = await listConsents(projectId);
    return rows.find((row) => {
      if (trainingTaskId && row.trainingTaskId !== trainingTaskId) return false;
      return Date.now() - new Date(row.consentedAt).getTime() < CONSENT_TTL_MS;
    });
  } catch {
    return undefined;
  }
}

/** Whether a valid consent exists within the last 30 minutes. */
export async function hasRecentAiConsent(projectId: string, trainingTaskId?: string): Promise<boolean> {
  return Boolean(await getRecentAiConsent(projectId, trainingTaskId));
}
