/**
 * Agent Configs Barrel (components/agents/agent-configs.tsx)
 *
 * Functionality:
 * - Re-exports the shared ScrollColumn helper and every per-module AgentPageConfig.
 * - Keeps the `@/components/agents/agent-configs` import path stable after configs were split by module.
 *
 * Notes:
 * - Single import surface consumed by agent pages and the config registry.
 *
 * @author mrpi
 * @date 2026-09-16
 */

// Barrel re-exports — agent configs are organized by module under ./configs/
// Import paths remain backward-compatible: `from "@/components/agents/agent-configs"`

/** Shared scrollable column wrapper used by module layouts. */
export { ScrollColumn } from "./configs/shared/ScrollColumn";
/** Topic selection agent configuration. */
export { TOPIC_CONFIG } from "./configs/topic/config";
/** Literature review agent configuration. */
export { LITREVIEW_CONFIG } from "./configs/litreview/config";
/** Study design agent configuration. */
export { DESIGN_CONFIG } from "./configs/design/config";
/** Data analysis agent configuration. */
export { DATA_CONFIG } from "./configs/data/config";
/** Writing agent configuration. */
export { WRITE_CONFIG } from "./configs/write/config";
/** Journal submission agent configuration. */
export { SUBMIT_CONFIG } from "./configs/submit/config";
/** Reviewer rebuttal agent configuration. */
export { REBUTTAL_CONFIG } from "./configs/rebuttal/config";
