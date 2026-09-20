/**
 * Allow only same-origin relative training return paths.
 *
 * Functionality:
 * - `sanitizeTrainingReturnTo` rejects absolute/protocol-relative or unsafe return paths.
 * - `buildAgentDeepLink` builds a project-agent URL that patches back into a training task.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** Return a safe `/training...` path, or `null` for anything else. */
export function sanitizeTrainingReturnTo(
  raw: string | null | undefined
): string | null {
  if (!raw || typeof raw !== "string") return null;
  const path = raw.trim();
  if (!path.startsWith("/training")) return null;
  if (path.startsWith("//")) return null;
  if (path.includes("://")) return null;
  if (/[\s<>'"]/.test(path)) return null;
  return path.slice(0, 512);
}

/** Build a deep link into a project agent with a training return path. */
export function buildAgentDeepLink(input: {
  projectId: string;
  agent: string;
  trainingTaskId: string;
}): string {
  const returnTo = `/training/tasks/${encodeURIComponent(input.trainingTaskId)}`;
  const q = new URLSearchParams({
    from: "training",
    trainingTaskId: input.trainingTaskId,
    returnTo,
  });
  return `/projects/${input.projectId}/${input.agent}?${q.toString()}`;
}
