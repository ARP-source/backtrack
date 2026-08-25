/**
 * Turns confirmed root gaps into a short, ordered set of timestamped clips.
 * Orchestration only — the embedder is injected so this module stays free of the
 * transformers runtime and remains unit-testable.
 */
import { rankChunks, gapQueryText, mergeAdjacent, type Scored } from "./retrieval";
import { verifySegments } from "./verify";
import type { DagNode, TranscriptChunk } from "./types";
import type { Segment, GapPlan } from "./segment";

// Shapes and the embed helper live in ./segment so client components can import them
// without dragging this module's LLM/node:fs dependencies into the browser bundle.
export { embedUrl, timestamp } from "./segment";
export type { Segment, GapPlan } from "./segment";

/** Brevity is the product — these caps are a feature, not a limitation. */
export const CANDIDATES_PER_GAP = 12;
export const MAX_SEGMENTS_PER_GAP = 4;
export const MAX_SECONDS_PER_GAP = 15 * 60;
export const MAX_SEGMENT_SECONDS = 240;

export type VideoMetaMap = Record<string, { title: string; channel: string }>;
export type Embedder = (text: string) => Promise<number[]>;

export async function planForGap(
  node: DagNode,
  misconception: string | undefined,
  chunks: TranscriptChunk[],
  meta: VideoMetaMap,
  embed: Embedder
): Promise<GapPlan> {
  const titleOf = (id: string) => meta[id]?.title ?? id;

  const query = await embed(gapQueryText(node, misconception));
  const candidates = rankChunks(query, chunks, CANDIDATES_PER_GAP);

  const verified = await verifySegments(node, misconception, candidates, titleOf);
  const byId = new Map(verified.value.verdicts.map((v) => [v.id, v]));

  // Keep only what the model says actually teaches, applying any tightened bounds —
  // clamped inside the original chunk so a hallucinated timestamp cannot escape the span.
  const kept = candidates
    .map((c, i) => ({ c, v: byId.get(i) }))
    .filter((x) => x.v?.verdict === "teaches")
    .map(({ c, v }) => {
      const start = clamp(v!.start ?? c.start, c.start, c.end);
      const end = clamp(v!.end ?? c.end, start, c.end);
      return {
        ...c,
        start,
        end: end > start ? end : c.end,
        why_this_clip: v!.why_this_clip,
      };
    });

  const merged = mergeAdjacent(kept)
    .map((m) => {
      const best = [...m.sources].sort((a, b) => b.score - a.score)[0];
      const end = Math.min(m.end, m.start + MAX_SEGMENT_SECONDS);
      return {
        nodeId: node.id,
        videoId: m.videoId,
        title: meta[m.videoId]?.title ?? m.videoId,
        channel: meta[m.videoId]?.channel ?? "",
        start: Math.round(m.start),
        end: Math.round(end),
        why_this_clip: best.why_this_clip,
        score: best.score,
      } satisfies Segment;
    })
    .sort((a, b) => b.score - a.score);

  // Cap count and total runtime; always return at least one segment if anything survived.
  const segments: Segment[] = [];
  let total = 0;
  for (const s of merged) {
    if (segments.length >= MAX_SEGMENTS_PER_GAP) break;
    const dur = s.end - s.start;
    if (segments.length > 0 && total + dur > MAX_SECONDS_PER_GAP) break;
    segments.push(s);
    total += dur;
  }

  return {
    nodeId: node.id,
    label: node.label,
    blurb: node.blurb,
    misconception,
    segments,
    totalSec: total,
    source: verified.source,
    note: verified.note,
    considered: candidates.length,
    rejected: candidates.length - kept.length,
  };
}

export async function buildCrashCourse(
  gaps: Array<{ node: DagNode; misconception?: string }>,
  chunks: TranscriptChunk[],
  meta: VideoMetaMap,
  embed: Embedder
): Promise<GapPlan[]> {
  const plans: GapPlan[] = [];
  // Sequential: the free tier's per-minute limit is the binding constraint, and a gap
  // count of 2–4 makes parallelism worth nothing here anyway.
  for (const g of gaps) {
    plans.push(await planForGap(g.node, g.misconception, chunks, meta, embed));
  }
  return plans;
}


function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
