/**
 * Design Config (components/agents/configs/design/config.ts)
 *
 * Functionality:
 * - Declares the study-design agent page config: inputs, output panel, run input mapping, and module layout.
 * - Maps applied results into the "design" manuscript section.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { AgentPageConfig } from "../../agent-page-template";
import { DesignOutputPanel } from "@/components/agents/outputs/design-output";
import { DesignInputs } from "./DesignInputs";
import { DesignModuleContent } from "./DesignModuleContent";

/** Configuration for the study-design agent page. */
export const DESIGN_CONFIG: AgentPageConfig = {
  agentId: "design",
  InputsComponent: DesignInputs,
  OutputComponent: DesignOutputPanel,
  buildRunInput: (fs) => ({
    researchQuestion: fs.researchQuestion,
    methodology: fs.methodology,
  }),
  manuscriptSection: "design",
  manuscriptOrder: 2,
  ModuleContentComponent: DesignModuleContent,
};
