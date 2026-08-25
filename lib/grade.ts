/**
 * Cloze-blank grading. Pure logic — no network, no React, unit-testable.
 *
 * Fuzzy string matching resolves almost everything: a student who types "colums" or
 * "the columns" understood the idea. Only genuine near-misses — plausible but not clearly
 * equivalent — are escalated to the model, so a typo never costs an API call and a wrong
 * mental model never gets waved through.
 */

export type BlankVerdict = "correct" | "near" | "wrong" | "empty";

export type GradedBlank = {
  blankId: string;
  input: string;
  verdict: BlankVerdict;
  /** Best similarity against the answer and its accepted alternatives, 0–1. */
  score: number;
  matched?: string;
};

/** Above this, a difference is a typo. */
export const CORRECT_THRESHOLD = 0.84;
/** Between this and CORRECT_THRESHOLD, ask the model. Below it, simply wrong. */
export const NEAR_THRESHOLD = 0.55;

const ARTICLES = new Set(["the", "a", "an"]);

export function normalize(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Leading articles carry no meaning in a one-or-two-word answer.
  const words = cleaned.split(" ").filter((w, i) => !(i === 0 && ARTICLES.has(w)));
  return words.join(" ");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = [...curr];
  }
  return prev[b.length];
}

/** 1 = identical, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;
  // Containment counts: "columns of the matrix" for an expected answer of "columns" is
  // right, and edit distance alone would punish it for length.
  if (x.includes(y) || y.includes(x)) return 0.94;
  const max = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / max;
}

export function gradeBlank(
  input: string,
  blank: { id: string; answer: string; acceptable?: string[] }
): GradedBlank {
  const trimmed = input.trim();
  if (!trimmed) return { blankId: blank.id, input: "", verdict: "empty", score: 0 };

  const candidates = [blank.answer, ...(blank.acceptable ?? [])];
  let best = 0;
  let matched = blank.answer;
  for (const c of candidates) {
    const s = similarity(trimmed, c);
    if (s > best) {
      best = s;
      matched = c;
    }
  }

  const verdict: BlankVerdict =
    best >= CORRECT_THRESHOLD ? "correct" : best >= NEAR_THRESHOLD ? "near" : "wrong";

  return { blankId: blank.id, input: trimmed, verdict, score: Number(best.toFixed(3)), matched };
}

export type NodeOutcome = {
  nodeId: string;
  total: number;
  correct: number;
  missed: number;
  /** True when the student got enough wrong that the node should reopen. */
  reopen: boolean;
};

/**
 * Did the remediation actually take?
 *
 * A node reopens when at least half its blanks came back wrong (and at least one did).
 * A single slip on a four-blank note is not evidence of a persistent gap; half of them is.
 * Empty answers count as missed — skipping the check is not passing it.
 */
export function outcomeByNode(
  graded: GradedBlank[],
  blanks: Array<{ id: string; nodeId: string }>
): NodeOutcome[] {
  const nodeOf = new Map(blanks.map((b) => [b.id, b.nodeId]));
  const buckets = new Map<string, { total: number; correct: number }>();

  for (const g of graded) {
    const nodeId = nodeOf.get(g.blankId);
    if (!nodeId) continue;
    const b = buckets.get(nodeId) ?? { total: 0, correct: 0 };
    b.total++;
    if (g.verdict === "correct") b.correct++;
    buckets.set(nodeId, b);
  }

  return [...buckets.entries()].map(([nodeId, b]) => {
    const missed = b.total - b.correct;
    return { nodeId, total: b.total, correct: b.correct, missed, reopen: missed > 0 && missed * 2 >= b.total };
  });
}
