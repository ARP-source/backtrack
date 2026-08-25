/**
 * Near-miss adjudication. Fuzzy matching settles typos and clear misses on its own; this
 * runs only on answers that sit in between — plausible phrasings that string distance
 * cannot fairly judge. One batched call per submission, never one per blank.
 */
import { z } from "zod";
import { callLLM, type LLMResult } from "./llm";

export const AdjudicationSchema = z.object({
  verdicts: z.array(
    z.object({
      blankId: z.string(),
      correct: z.boolean(),
      why: z.string().max(200).optional(),
    })
  ),
});

export type Adjudication = z.infer<typeof AdjudicationSchema>;

export type NearMiss = {
  blankId: string;
  input: string;
  answer: string;
  acceptable: string[];
  concept: string;
  line: string;
};

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          blankId: { type: "string" },
          correct: { type: "boolean" },
          why: { type: "string" },
        },
        required: ["blankId", "correct"],
      },
    },
  },
  required: ["verdicts"],
};

export function buildAdjudicationPrompt(items: NearMiss[]): string {
  const blocks = items
    .map(
      (i) =>
        `blankId: ${i.blankId}\nconcept: ${i.concept}\nthe line: ${i.line}\nexpected: ${i.answer}${
          i.acceptable.length ? ` (also accepted: ${i.acceptable.join("; ")})` : ""
        }\nstudent wrote: ${i.input}`
    )
    .join("\n\n");

  return `A student filled in blanks in their notes while watching a video. Automatic matching could not decide these ones.

For each, decide whether the student's answer shows they UNDERSTOOD the idea. You are marking comprehension, not spelling.

- Mark correct: a synonym, a paraphrase, the right idea in their own words, a different but equally valid way to say it, or the right answer with extra words around it.
- Mark incorrect: a different concept, a term they clearly confused for this one, a vague restatement of the question, or something that only overlaps by coincidence.
- When genuinely torn, mark incorrect. This feeds a decision about whether to re-teach the concept, and wrongly waving someone through leaves a real gap in place.

"why" is one short clause, addressed to the student, only when marking incorrect.

ANSWERS TO JUDGE:

${blocks}`;
}

/** Conservative fallback: unresolved near-misses do not pass. */
export function fallbackAdjudication(items: NearMiss[]): Adjudication {
  return { verdicts: items.map((i) => ({ blankId: i.blankId, correct: false })) };
}

export async function adjudicate(items: NearMiss[]): Promise<LLMResult<Adjudication>> {
  return callLLM({
    namespace: `adjudicate-${items.map((i) => i.blankId).join("_").slice(0, 40)}`,
    prompt: buildAdjudicationPrompt(items),
    responseSchema: RESPONSE_SCHEMA,
    schema: AdjudicationSchema,
    fixture: fallbackAdjudication(items),
  });
}
