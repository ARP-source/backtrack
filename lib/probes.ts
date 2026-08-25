/**
 * Probe questions: multiple choice where each wrong option encodes a NAMED misconception.
 *
 * That mapping is the point. A wrong answer does not just say "failed this node" — it says
 * *which* wrong mental model the student holds, and that misconception is then injected
 * into the retrieval query for the crash course.
 *
 * Probes are generated once, offline, and committed to data/probes.json, so the diagnostic
 * runs with zero network latency and identical questions every time.
 */
import { z } from "zod";
import type { DagNode, NodeId } from "./types";

export const ProbeOptionSchema = z.object({
  text: z.string().min(1),
  correct: z.boolean(),
  /** Which named misconception this distractor encodes. Absent on the correct option. */
  misconception: z.string().nullable().optional(),
});

export const ProbeSchema = z.object({
  nodeId: z.string(),
  question: z.string().min(1),
  options: z.array(ProbeOptionSchema).min(3).max(5),
});

export const ProbeBatchSchema = z.object({ probes: z.array(ProbeSchema) });

export type Probe = z.infer<typeof ProbeSchema>;
export type ProbeOption = z.infer<typeof ProbeOptionSchema>;

export const PROBE_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    probes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          question: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                correct: { type: "boolean" },
                misconception: { type: "string" },
              },
              required: ["text", "correct"],
            },
          },
        },
        required: ["nodeId", "question", "options"],
      },
    },
  },
  required: ["probes"],
};

export function buildProbePrompt(nodes: DagNode[]): string {
  const specs = nodes
    .map(
      (n) =>
        `nodeId: ${n.id}\nconcept: ${n.label}\nmastery looks like: ${n.blurb}\nmisconceptions to use as distractors:\n${n.misconceptions
          .map((m) => `  - ${m}`)
          .join("\n")}`
    )
    .join("\n\n");

  return `Write one diagnostic multiple-choice question for each concept below.

These questions decide whether a student truly understands a prerequisite, so they must be DISCRIMINATING, not recall checks. A student holding the listed misconception must be pulled toward the matching wrong option; a student who genuinely understands must find the correct one obvious.

Rules:
- Exactly 4 options. Exactly one correct.
- Each wrong option must correspond to ONE of the listed misconceptions for that concept. Set its "misconception" field to that misconception string, copied verbatim.
- If a concept has fewer than 3 misconceptions listed, invent a further plausible wrong answer and set its "misconception" to a short description of the error it encodes.
- The correct option must omit "misconception".
- Test understanding, not arithmetic. Prefer "what does this mean" and "which of these is true" over long computations. A student should answer in under 30 seconds without paper.
- Keep every option roughly the same length. Do not make the correct one conspicuously longer or more hedged.
- Plain text only. No LaTeX, no markdown. Write vectors like [1, 2] and matrices like [[1, 2], [3, 4]].
- Do not name the misconception in the option text; state the wrong belief as if it were correct.

CONCEPTS:

${specs}`;
}

/**
 * Deterministic probe built straight from the DAG when no generated one exists.
 * Blunt, but it means the diagnostic can always ask *something* without a network call.
 */
export function fallbackProbe(node: DagNode): Probe {
  return {
    nodeId: node.id,
    question: `Which best describes ${node.label.toLowerCase()}?`,
    options: [
      { text: node.blurb, correct: true },
      ...node.misconceptions.slice(0, 3).map((m) => ({
        text: `It means: ${m}`,
        correct: false,
        misconception: m,
      })),
    ],
  };
}

export type ProbeBook = Record<NodeId, Probe>;

/** Looks up a generated probe, falling back to the derived one. Never throws. */
export function probeFor(book: ProbeBook, node: DagNode): Probe {
  const p = book[node.id];
  if (!p || p.options.filter((o) => o.correct).length !== 1) return fallbackProbe(node);
  return p;
}
