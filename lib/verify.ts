/**
 * Segment verification: the precision stage of retrieval.
 *
 * Embeddings give recall — they surface anything topically near the gap, including a
 * five-second "next video I'll cover matrices" outro. This pass reads the candidates and
 * asks the question similarity cannot: does this segment *teach* the concept, or merely
 * mention it?
 *
 * All candidates for a gap go in ONE call. That is not only a rate-limit concession: the
 * model sees them side by side and can rank them against each other rather than judging
 * each in a vacuum.
 */
import { z } from "zod";
import { callLLM, type LLMResult } from "./llm.js";
import type { DagNode } from "./types.js";
import type { Scored } from "./retrieval.js";

export const VerdictSchema = z.object({
  id: z.number().int(),
  verdict: z.enum(["teaches", "mentions", "unrelated"]),
  why_this_clip: z.string().min(1).max(300),
  /** Refined bounds, seconds from video start. Null means "keep the candidate's bounds". */
  start: z.number().nullable().optional(),
  end: z.number().nullable().optional(),
});

export const VerdictsSchema = z.object({ verdicts: z.array(VerdictSchema) });

export type Verdict = z.infer<typeof VerdictSchema>;
export type Verdicts = z.infer<typeof VerdictsSchema>;

/** Gemini responseSchema — constrains generation; zod still validates what comes back. */
const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          verdict: { type: "string", enum: ["teaches", "mentions", "unrelated"] },
          why_this_clip: { type: "string" },
          start: { type: "number" },
          end: { type: "number" },
        },
        required: ["id", "verdict", "why_this_clip"],
      },
    },
  },
  required: ["verdicts"],
};

export function buildVerifyPrompt(
  node: DagNode,
  misconception: string | undefined,
  candidates: Scored[],
  titleOf: (videoId: string) => string
): string {
  const blocks = candidates
    .map(
      (c, i) =>
        `[${i}] video "${titleOf(c.videoId)}" ${fmt(c.start)}–${fmt(c.end)}\n${c.text}`
    )
    .join("\n\n");

  return `A student is missing a specific prerequisite. Your job is to pick the video segments that will actually fix it.

CONCEPT: ${node.label}
MASTERY LOOKS LIKE: ${node.blurb}
${misconception ? `THE STUDENT'S SPECIFIC ERROR: ${misconception}` : ""}

Below are ${candidates.length} transcript segments. For each, decide:
- "teaches"   — explains this concept well enough that a confused student would understand it after watching. Prefer segments that address the student's specific error above.
- "mentions"  — refers to the concept in passing, names it, or previews it, without explaining it.
- "unrelated" — about something else.

Be strict. A segment that says "we'll cover this next time", recaps a result without reasoning, or only uses the term while doing something else is "mentions", not "teaches". It is far better to return two excellent segments than six mediocre ones.

For each segment return:
- id: the number in brackets
- verdict
- why_this_clip: ONE sentence, addressed to the student, saying what this clip will fix. Concrete. Not "this explains matrices" but "this shows why the columns are where the basis vectors land". Required even when dropping.
- start/end: OPTIONAL tighter bounds in seconds, only if the useful explanation occupies part of the segment. Must stay inside the given range.

SEGMENTS:
${blocks}`;
}

function fmt(s: number): string {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Deterministic fallback used when there is no key or the call fails. Keeps the top three
 * by embedding score — noticeably worse than a verified selection, but it always yields a
 * usable crash course rather than an empty screen.
 */
export function fallbackVerdicts(node: DagNode, candidates: Scored[]): Verdicts {
  return {
    verdicts: candidates.map((c, i) => ({
      id: i,
      verdict: i < 3 ? ("teaches" as const) : ("unrelated" as const),
      why_this_clip: `Covers ${node.label.toLowerCase()} — selected by similarity, not verified.`,
    })),
  };
}

export async function verifySegments(
  node: DagNode,
  misconception: string | undefined,
  candidates: Scored[],
  titleOf: (videoId: string) => string
): Promise<LLMResult<Verdicts>> {
  return callLLM({
    namespace: `verify-${node.id}`,
    prompt: buildVerifyPrompt(node, misconception, candidates, titleOf),
    responseSchema: RESPONSE_SCHEMA,
    schema: VerdictsSchema,
    fixture: fallbackVerdicts(node, candidates),
  });
}
