/**
 * LitReview Config (components/agents/configs/litreview/config.ts)
 *
 * Functionality:
 * - Declares the literature-review agent page config: inputs, output panel, run input mapping, and module layout.
 * - Converts parsed papers into local bibliography items when results are applied.
 * - Maps applied results into the "litreview" manuscript section.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { AgentPageConfig } from "../../agent-page-template";
import type { LitReviewOutput } from "@/lib/ai/parse-agent-output";
import { bulkCreateBibItems } from "@/lib/local/hooks";
import { LitReviewOutputPanel } from "@/components/agents/outputs/litreview-output";
import { LitReviewInputs } from "./LitReviewInputs";
import { LitReviewModuleContent } from "./LitReviewModuleContent";

/** Configuration for the literature-review agent page. */
export const LITREVIEW_CONFIG: AgentPageConfig = {
  agentId: "litreview",
  InputsComponent: LitReviewInputs,
  OutputComponent: LitReviewOutputPanel,
  buildRunInput: (fs) => ({
    query: fs.query,
    yearFrom: fs.yearFrom,
    yearTo: fs.yearTo,
    maxResults: parseInt(fs.maxResults ?? "50") || 50,
  }),
  manuscriptSection: "litreview",
  manuscriptOrder: 1,
  // Bulk-inserts the parsed papers as bibliography items on apply.
  onApplyExtra: async ({ projectId, parsedResults }) => {
    const litData = parsedResults as LitReviewOutput | null;
    if (litData?.papers?.length) {
      await bulkCreateBibItems(
        litData.papers.map((p) => ({
          projectId,
          title: p.title,
          authors: p.authors,
          year: p.year,
          venue: p.venue,
          abstract: p.findings,
          doi: p.doi,
          metadata: { method: p.method },
        }))
      );
    }
  },
  ModuleContentComponent: LitReviewModuleContent,
};
