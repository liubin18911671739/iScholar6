/**
 * Prompt Barrel (lib/ai/prompts/index.ts)
 *
 * Functionality:
 * - Re-exports every built-in agent system prompt from its dedicated module.
 * - Provides a single import surface for prompt resolution and tests.
 *
 * @author mrpi
 * @date 2026-09-16
 */

export { TOPIC_SCOUT_PROMPT } from "./topic";
export { LIT_REVIEW_PROMPT } from "./litreview";
export { DESIGN_PROMPT } from "./design";
export { DATA_PILOT_PROMPT } from "./data";
export { IMRAD_WRITER_PROMPT } from "./write";
export { SUBMIT_MATCH_PROMPT } from "./submit";
export { REBUTTAL_PROMPT } from "./rebuttal";
