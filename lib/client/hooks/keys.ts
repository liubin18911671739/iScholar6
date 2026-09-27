/**
 * Query keys (lib/client/hooks/keys.ts)
 *
 * Functionality:
 * - Centralizes React Query cache keys for the BFF research data layer.
 *
 * @author mrpi
 * @date 2026-09-27
 */

/** Cache keys for backend-backed research queries. */
export const qk = {
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  manuscripts: (projectId: string) => ["manuscripts", projectId] as const,
  blocks: (manuscriptId: string) => ["manuscript-blocks", manuscriptId] as const,
  versionsByManuscript: (manuscriptId: string) => ["manuscript-versions", "manuscript", manuscriptId] as const,
  versionsByBlock: (blockId: string) => ["manuscript-versions", "block", blockId] as const,
  bibItems: (projectId: string) => ["bib-items", projectId] as const,
  ragChunks: (bibItemId: string) => ["rag-chunks", bibItemId] as const,
  attachments: (projectId: string) => ["attachments", projectId] as const,
  experiments: (projectId: string) => ["experiments", projectId] as const,
  submissions: (projectId: string) => ["submissions", projectId] as const,
  reviewRounds: (submissionId: string) => ["review-rounds", submissionId] as const,
  rebuttalItems: (reviewRoundId: string) => ["rebuttal-items", reviewRoundId] as const,
  tasks: (projectId: string) => ["tasks", projectId] as const,
};
