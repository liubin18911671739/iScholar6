/**
 * Data Config (components/agents/configs/data/config.ts)
 *
 * Functionality:
 * - Declares the Data agent page config: inputs, output panel, run input mapping, and module layout.
 * - Persists an experiment record (source data + collection method) when results are applied.
 * - Maps applied results into the "methods" manuscript section.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { createExperiment } from "@/lib/local/hooks";
import type { AgentPageConfig } from "../../agent-page-template";
import { DataOutputPanel } from "@/components/agents/outputs/data-output";
import { DataInputs } from "./DataInputs";
import { DataModuleContent } from "./DataModuleContent";

/** Configuration for the data-analysis agent page. */
export const DATA_CONFIG: AgentPageConfig = {
  agentId: "data",
  InputsComponent: DataInputs,
  OutputComponent: DataOutputPanel,
  buildRunInput: (fs) => ({
    dataSource: fs.dataSource,
    collectionMethod: fs.collectionMethod,
  }),
  manuscriptSection: "methods",
  manuscriptOrder: 3,
  // Records the dataset and collection method as a local experiment on apply.
  onApplyExtra: async ({ projectId, fieldState }) => {
    await createExperiment({
      projectId,
      name: `Data Analysis — ${fieldState.collectionMethod || "unspecified method"}`,
      dataset: fieldState.dataSource,
      params: { collectionMethod: fieldState.collectionMethod },
    });
  },
  ModuleContentComponent: DataModuleContent,
};
