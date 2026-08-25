/**
 * Guided notes: a short note block per clip with cloze blanks at the load-bearing points.
 *
 * The blanks are the mechanism that closes the loop. Each one is tagged with the DAG node
 * it tests, so filling them in is not busywork — it is a second, independent measurement
 * of the same node the diagnostic flagged. Miss enough of them and the node reopens.
 */
import { z } from "zod";
import { callLLM, type LLMResult } from "./llm";
import type { DagNode } from "./types";

export const BlankSchema = z.object({
  id: z.string().min(1),
  /** Seconds from video start: when the clip reveals this answer. */
  timestamp: z.number(),
  answer: z.string().min(1),
  acceptable: z.array(z.string()).default([]),
  nodeId: z.string().min(1),
});

export const NoteSchema = z.object({
  /** Lines of the note. A blank appears inline as {{blankId}}. */
  lines: z.array(z.string().min(1)).min(2).max(9),
  blanks: z.array(BlankSchema).min(1).max(6),
});

export type Blank = z.infer<typeof BlankSchema>;
export type GuidedNote = z.infer<typeof NoteSchema>;

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    lines: { type: "array", items: { type: "string" } },
    blanks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          timestamp: { type: "number" },
          answer: { type: "string" },
          acceptable: { type: "array", items: { type: "string" } },
          nodeId: { type: "string" },
        },
        required: ["id", "timestamp", "answer", "acceptable", "nodeId"],
      },
    },
  },
  required: ["lines", "blanks"],
};

export function buildNotePrompt(
  node: DagNode,
  misconception: string | undefined,
  clip: { title: string; channel: string; start: number; end: number; text: string }
): string {
  return `Write a short set of guided notes a student fills in WHILE watching one video clip.

CONCEPT BEING FIXED: ${node.label}
MASTERY LOOKS LIKE: ${node.blurb}
${misconception ? `THE STUDENT'S SPECIFIC ERROR: ${misconception}` : ""}

CLIP: "${clip.title}" (${clip.channel}), covering ${fmt(clip.start)}–${fmt(clip.end)}.
TRANSCRIPT OF THE CLIP:
${clip.text}

Produce 3 to 6 short lines that track the clip's actual explanation in order, with 2 to 4 blanks.

Rules for the blanks — these matter more than anything else here:
- Put a blank ONLY where the answer IS the idea. Blanking "the columns tell you where the ___ vectors land" tests understanding; blanking "in this ___ we will see" tests nothing.
- NEVER blank an arbitrary noun, a number that is merely read aloud, or a word recoverable from the sentence's grammar alone.
- Every answer must be one to four words, and must be stated or unmistakably implied in the transcript above.
- "acceptable" must list genuine alternative phrasings a correct student would type (synonyms, singular/plural, with or without an article). Three or four entries. Do not list wrong answers.
- "timestamp" is the second within the clip's range where the answer is revealed. It must lie between ${Math.floor(clip.start)} and ${Math.ceil(clip.end)}.
- "nodeId" must be exactly "${node.id}" for every blank.
- Blank ids are "b1", "b2", … and each id must appear EXACTLY ONCE across all lines, written as {{b1}}.

Rules for the lines:
- Plain text. No markdown, no LaTeX. Write vectors like [1, 2] and matrices like [[1, 2], [3, 4]].
- Each line under 90 characters. A line may contain no blanks.
- Write them as notes a student would actually keep, not as quiz questions.${
    misconception ? `\n- At least one blank must directly confront the student's specific error.` : ""
  }`;
}

function fmt(s: number): string {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Drop anything inconsistent rather than rendering a broken note: blanks with no
 * placeholder, placeholders with no blank, duplicate ids, out-of-range timestamps.
 */
export function sanitizeNote(note: GuidedNote, node: DagNode, start: number, end: number): GuidedNote {
  const seen = new Set<string>();
  const blanks = note.blanks.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });

  const body = note.lines.join("\n");
  const used = new Set([...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));

  const kept = blanks
    .filter((b) => used.has(b.id))
    .map((b) => ({
      ...b,
      nodeId: node.id,
      timestamp: Math.min(Math.max(b.timestamp, start), end),
      acceptable: [...new Set(b.acceptable.filter((a) => a.trim().length > 0))],
    }));

  const keptIds = new Set(kept.map((b) => b.id));
  // Strip placeholders whose blank did not survive, so no {{b3}} is ever shown raw.
  const lines = note.lines
    .map((l) => l.replace(/\{\{(\w+)\}\}/g, (m, id) => (keptIds.has(id) ? m : "…")))
    .filter((l) => l.trim().length > 0);

  return { lines, blanks: kept };
}

/** Deterministic note when there is no key or the call fails. Blunt, but it still checks. */
export function fallbackNote(node: DagNode): GuidedNote {
  return {
    lines: [`${node.label} — in one line:`, `{{b1}}`, `(from the clip you just watched)`],
    blanks: [
      {
        id: "b1",
        timestamp: 0,
        answer: node.label.toLowerCase(),
        acceptable: [node.label.toLowerCase(), node.blurb.toLowerCase().slice(0, 40)],
        nodeId: node.id,
      },
    ],
  };
}

export async function generateNote(
  node: DagNode,
  misconception: string | undefined,
  clip: { videoId: string; title: string; channel: string; start: number; end: number; text: string }
): Promise<LLMResult<GuidedNote>> {
  const res = await callLLM({
    namespace: `note-${node.id}-${clip.videoId}-${Math.round(clip.start)}`,
    prompt: buildNotePrompt(node, misconception, clip),
    responseSchema: RESPONSE_SCHEMA,
    schema: NoteSchema,
    fixture: fallbackNote(node),
  });
  return { ...res, value: sanitizeNote(res.value, node, clip.start, clip.end) };
}
