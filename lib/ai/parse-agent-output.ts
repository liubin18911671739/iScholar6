/**
 * Agent Output Parser (lib/ai/parse-agent-output.ts)
 *
 * Functionality:
 * - Declares per-agent Zod schemas for the structured JSON embedded in AI output.
 * - Exports inferred TypeScript types for each agent output shape.
 * - Extracts the last ```json fenced block and validates it against the agent's schema.
 *
 * Notes:
 * - Parsing is best-effort: invalid JSON or schema mismatches return null rather than throwing.
 * - Plugin agents (non-built-in) are not parsed here.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { z } from "zod";
import { isBuiltInAgent, type AgentId, type BuiltInAgentId } from "./agents/registry";

// ── Per-Agent Zod Schemas ──────────────────────────────────────────────

const TopicSchema = z.object({
  topics: z.array(
    z.object({
      title: z.string(),
      gap: z.string(),
      novelty: z.number(),
      value: z.number(),
      feasibility: z.number(),
      rationale: z.string(),
    })
  ),
});

const LitReviewSchema = z.object({
  papers: z.array(
    z.object({
      title: z.string(),
      authors: z.array(z.string()).optional(),
      year: z.number().optional(),
      venue: z.string().optional(),
      method: z.string().optional(),
      findings: z.string().optional(),
      doi: z.string().optional(),
    })
  ),
  themes: z.array(z.string()).optional(),
  gaps: z.array(z.string()).optional(),
});

const DesignSchema = z.object({
  feasibility: z.object({
    score: z.number(),
    factors: z.array(
      z.object({
        name: z.string(),
        score: z.number(),
        note: z.string().optional(),
      })
    ),
  }),
  hypotheses: z.array(z.string()).optional(),
  variables: z
    .object({
      independent: z.array(z.string()).optional(),
      dependent: z.array(z.string()).optional(),
      mediators: z.array(z.string()).optional(),
      moderators: z.array(z.string()).optional(),
    })
    .optional(),
});

const DataSchema = z.object({
  scripts: z.array(
    z.object({
      language: z.string(),
      filename: z.string().optional(),
      code: z.string(),
    })
  ),
  recommendations: z.array(z.string()).optional(),
  analysisPlan: z.array(z.string()).optional(),
});

const WriteSchema = z.object({
  references: z.array(
    z.object({
      key: z.string(),
      authors: z.string().optional(),
      title: z.string().optional(),
      year: z.number().optional(),
      venue: z.string().optional(),
      doi: z.string().optional(),
    })
  ),
  section: z.string().optional(),
  wordCount: z.number().optional(),
});

const SubmitSchema = z.object({
  journals: z.array(
    z.object({
      name: z.string(),
      fitScore: z.number(),
      impactFactor: z.number().optional(),
      reviewTimeline: z.string().optional(),
      openAccess: z.boolean().optional(),
      rationale: z.string().optional(),
    })
  ),
  checklist: z.array(z.string()).optional(),
});

const RebuttalSchema = z.object({
  responses: z.array(
    z.object({
      commentNumber: z.number(),
      comment: z.string(),
      response: z.string(),
      changeLocation: z.string().optional(),
      evidence: z.string().optional(),
    })
  ),
});

// ── Schema Registry ────────────────────────────────────────────────────

// Maps each built-in agent id to its validation schema.
const SCHEMAS: Record<BuiltInAgentId, z.ZodTypeAny> = {
  topic: TopicSchema,
  litreview: LitReviewSchema,
  design: DesignSchema,
  data: DataSchema,
  write: WriteSchema,
  submit: SubmitSchema,
  rebuttal: RebuttalSchema,
};

// ── Types ──────────────────────────────────────────────────────────────

/** Validated output shape for the TopicScout agent. */
export type TopicOutput = z.infer<typeof TopicSchema>;
/** Validated output shape for the LitReview agent. */
export type LitReviewOutput = z.infer<typeof LitReviewSchema>;
/** Validated output shape for the ResearchDesigner agent. */
export type DesignOutput = z.infer<typeof DesignSchema>;
/** Validated output shape for the DataPilot agent. */
export type DataOutput = z.infer<typeof DataSchema>;
/** Validated output shape for the IMRaDWriter agent. */
export type WriteOutput = z.infer<typeof WriteSchema>;
/** Validated output shape for the SubmitMatch agent. */
export type SubmitOutput = z.infer<typeof SubmitSchema>;
/** Validated output shape for the RebuttalShow agent. */
export type RebuttalOutput = z.infer<typeof RebuttalSchema>;

/** Discriminated-by-agent union of every structured output shape. */
export type AgentStructuredOutput =
  | TopicOutput
  | LitReviewOutput
  | DesignOutput
  | DataOutput
  | WriteOutput
  | SubmitOutput
  | RebuttalOutput;

// ── Parser ─────────────────────────────────────────────────────────────

/**
 * Extract the last ```json code block from AI text output and validate
 * against the agent's Zod schema. Returns parsed data or null.
 */
export function parseAgentOutput(
  agentId: AgentId,
  text: string
): AgentStructuredOutput | null {
  if (!isBuiltInAgent(agentId)) return null;
  const schema = SCHEMAS[agentId];
  if (!schema) return null;

  // Find the last ```json ... ``` fenced code block
  const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
  let lastMatch: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = jsonBlockRegex.exec(text)) !== null) {
    lastMatch = match[1];
  }

  if (!lastMatch) return null;

  try {
    const parsed = JSON.parse(lastMatch.trim());
    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data as AgentStructuredOutput;
    }
    // Schema validation failed — return null silently
    return null;
  } catch {
    return null;
  }
}
