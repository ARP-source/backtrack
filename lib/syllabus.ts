/**
 * Syllabus -> prerequisite frontier.
 *
 * This is extraction, not generation: every mapping carries the syllabus line that
 * justifies it, so the UI can show the evidence beside the claim.
 */
import { z } from "zod";
import { callLLM, type LLMResult } from "./llm";
import type { DagIndex } from "./dag";
import type { Dag, NodeId } from "./types";

export const SyllabusMappingSchema = z.object({
  courseTitle: z.string().default("This course"),
  /** Nodes the syllabus expects you to arrive already knowing. */
  assumed: z.array(
    z.object({
      nodeId: z.string(),
      quote: z.string(),
      week: z.number().nullable().optional(),
    })
  ),
  /** Nodes the course itself teaches, with the week they appear. */
  taught: z.array(
    z.object({
      nodeId: z.string(),
      week: z.number(),
      quote: z.string(),
    })
  ),
});

export type SyllabusMapping = z.infer<typeof SyllabusMappingSchema>;

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    courseTitle: { type: "string" },
    assumed: {
      type: "array",
      items: {
        type: "object",
        properties: { nodeId: { type: "string" }, quote: { type: "string" }, week: { type: "integer" } },
        required: ["nodeId", "quote"],
      },
    },
    taught: {
      type: "array",
      items: {
        type: "object",
        properties: { nodeId: { type: "string" }, week: { type: "integer" }, quote: { type: "string" } },
        required: ["nodeId", "week", "quote"],
      },
    },
  },
  required: ["courseTitle", "assumed", "taught"],
};

export function buildSyllabusPrompt(syllabus: string, dag: Dag): string {
  const catalogue = dag.nodes.map((n) => `${n.id} — ${n.label}: ${n.blurb}`).join("\n");
  return `Map a course syllabus onto a fixed catalogue of concepts.

Return two lists:
- "assumed": concepts the syllabus expects students to ALREADY know on day one (stated prerequisites, phrases like "students should be comfortable with", "assumes familiarity with", or background named as not being covered).
- "taught": concepts the course itself covers, each with the week number it first appears.

Rules:
- Use ONLY nodeId values from the catalogue below. Never invent one.
- "quote" must be a VERBATIM span copied from the syllabus that justifies the mapping. Do not paraphrase. If you cannot quote it, do not include the mapping.
- A concept belongs in exactly one list. If the course teaches it, it is taught, not assumed.
- Omit anything the syllabus does not support. Precision over coverage.

CATALOGUE:
${catalogue}

SYLLABUS:
${syllabus}`;
}

export type FrontierEntry = {
  nodeId: NodeId;
  /** The week this becomes load-bearing — when not knowing it starts to hurt. */
  week: number;
  quote?: string;
  /** Whether the syllabus named it directly, or it is implied by something taught. */
  via: "stated" | "implied";
  /** For implied entries, the taught concept that needs it. */
  neededFor?: NodeId;
};

/**
 * The frontier is everything the course needs you to already have.
 *
 * That is broader than the stated prerequisites. When a syllabus says week 11 covers
 * change of basis, it is silently assuming you will have matrix multiplication and
 * coordinates solid by then. Those unstated assumptions are where students actually fail,
 * so the direct prerequisites of every taught concept join the frontier, dated to the week
 * the concept that needs them is taught.
 */
export function computeFrontier(mapping: SyllabusMapping, idx: DagIndex): FrontierEntry[] {
  const best = new Map<NodeId, FrontierEntry>();

  const consider = (e: FrontierEntry) => {
    if (!idx.byId.has(e.nodeId)) return;
    const prev = best.get(e.nodeId);
    // Keep the earliest week — that is when the gap first bites.
    if (!prev || e.week < prev.week || (e.week === prev.week && prev.via === "implied" && e.via === "stated")) {
      best.set(e.nodeId, e);
    }
  };

  for (const a of mapping.assumed) {
    consider({ nodeId: a.nodeId, week: a.week ?? 1, quote: a.quote, via: "stated" });
  }
  for (const t of mapping.taught) {
    if (!idx.byId.has(t.nodeId)) continue;
    for (const p of idx.prereqs.get(t.nodeId) ?? []) {
      consider({ nodeId: p, week: t.week, via: "implied", neededFor: t.nodeId, quote: t.quote });
    }
  }

  return [...best.values()].sort((a, b) => a.week - b.week || a.nodeId.localeCompare(b.nodeId));
}

/** Deterministic fallback: the stated prerequisites of the sample syllabus. */
export function fallbackMapping(): SyllabusMapping {
  return {
    courseTitle: "Linear Algebra",
    assumed: [
      { nodeId: "solving_linear_equations", quote: "solving linear equations", week: 1 },
      { nodeId: "fraction_arithmetic", quote: "working with fractions and signed quantities", week: 1 },
      { nodeId: "negative_numbers", quote: "working with fractions and signed quantities", week: 1 },
      { nodeId: "variables_and_expressions", quote: "manipulating symbolic expressions", week: 1 },
      { nodeId: "function_notation", quote: "reading function notation such as f(x) and f(g(x))", week: 1 },
      { nodeId: "function_composition", quote: "reading function notation such as f(x) and f(g(x))", week: 1 },
      { nodeId: "coordinate_plane", quote: "plotting points and lines in the coordinate plane is assumed", week: 1 },
    ],
    taught: [
      { nodeId: "systems_of_equations", week: 1, quote: "Week 1 — Systems of linear equations" },
      { nodeId: "gaussian_elimination", week: 2, quote: "Week 2 — Gaussian elimination and row echelon form" },
      { nodeId: "vector_arithmetic", week: 3, quote: "Week 3 — Vectors in R^n" },
      { nodeId: "linear_combination", week: 3, quote: "Linear combinations" },
      { nodeId: "span", week: 4, quote: "Week 4 — Span and linear independence" },
      { nodeId: "linear_independence", week: 4, quote: "Week 4 — Span and linear independence" },
      { nodeId: "linear_transformations", week: 5, quote: "Week 5 — Linear transformations" },
      { nodeId: "matrix_as_transformation", week: 5, quote: "columns as images of the basis vectors" },
      { nodeId: "matrix_multiplication", week: 6, quote: "Matrix multiplication as composition of transformations" },
      { nodeId: "invertibility", week: 7, quote: "Week 7 — Inverse matrices" },
      { nodeId: "determinant_general", week: 8, quote: "Week 8 — Determinants" },
      { nodeId: "column_space_rank", week: 9, quote: "Column space and null space" },
      { nodeId: "basis", week: 10, quote: "Week 10 — Basis and dimension" },
      { nodeId: "change_of_basis", week: 11, quote: "Week 11 — Coordinates relative to a basis. Change of basis" },
      { nodeId: "similarity", week: 12, quote: "Week 12 — Similarity of matrices" },
      { nodeId: "eigenvectors", week: 13, quote: "Week 13 — Eigenvalues and eigenvectors" },
      { nodeId: "diagonalization", week: 14, quote: "Week 14 — Diagonalization" },
    ],
  };
}

export async function mapSyllabus(syllabus: string, dag: Dag): Promise<LLMResult<SyllabusMapping>> {
  return callLLM({
    namespace: "syllabus",
    prompt: buildSyllabusPrompt(syllabus, dag),
    responseSchema: RESPONSE_SCHEMA,
    schema: SyllabusMappingSchema,
    fixture: fallbackMapping(),
  });
}
