/**
 * Segment retrieval. Pure logic — no React, no network, no LLM calls.
 * Cosine over an in-memory array; at 366 chunks a vector DB would be pure overhead.
 */
import { cosine } from "./chunk.js";
import type { TranscriptChunk, DagNode } from "./types.js";

export type Scored = TranscriptChunk & { score: number };

/**
 * @param maxPerVideo Cap on chunks contributed by any single video.
 *   Without it the corpus votes by volume: the three 47-minute MIT lectures are ~43% of
 *   all chunks and monopolise every top-K, burying shorter videos that explain the concept
 *   better. The cap also guarantees the candidate pool spans multiple channels, which is
 *   what makes "here's a different explanation" possible on re-remediation.
 */
export function rankChunks(
  query: number[],
  chunks: TranscriptChunk[],
  topK = 12,
  maxPerVideo = 3
): Scored[] {
  const ranked = chunks
    .map((c) => ({ ...c, score: cosine(query, c.embedding) }))
    .sort((a, b) => b.score - a.score);

  const perVideo = new Map<string, number>();
  const kept: Scored[] = [];
  for (const c of ranked) {
    const n = perVideo.get(c.videoId) ?? 0;
    if (n >= maxPerVideo) continue;
    perVideo.set(c.videoId, n + 1);
    kept.push(c);
    if (kept.length === topK) break;
  }
  return kept;
}

/**
 * The retrieval query for a gap. The misconception is included deliberately: it is
 * what turns "a video about matrices" into "the 90 seconds addressing this error".
 */
export function gapQueryText(node: DagNode, misconception?: string): string {
  const base = `${node.label}. ${node.blurb}`;
  return misconception ? `${base} Common misunderstanding: ${misconception}` : base;
}

/**
 * Merge kept chunks that overlap or sit adjacent in the same video into single spans.
 * Chunks overlap by ~25s by construction, so without this every clip is a near-duplicate
 * of its neighbour.
 * @param gapSec Merge across gaps up to this size (kept chunks straddling a dropped one).
 */
export function mergeAdjacent<T extends { videoId: string; start: number; end: number }>(
  segments: T[],
  gapSec = 15
): Array<{ videoId: string; start: number; end: number; sources: T[] }> {
  const byVideo = new Map<string, T[]>();
  for (const s of segments) {
    if (!byVideo.has(s.videoId)) byVideo.set(s.videoId, []);
    byVideo.get(s.videoId)!.push(s);
  }

  const out: Array<{ videoId: string; start: number; end: number; sources: T[] }> = [];
  for (const [videoId, list] of byVideo) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    let cur = { videoId, start: sorted[0].start, end: sorted[0].end, sources: [sorted[0]] };
    for (const s of sorted.slice(1)) {
      if (s.start <= cur.end + gapSec) {
        cur.end = Math.max(cur.end, s.end);
        cur.sources.push(s);
      } else {
        out.push(cur);
        cur = { videoId, start: s.start, end: s.end, sources: [s] };
      }
    }
    out.push(cur);
  }
  return out;
}

/** Clamp a merged span to a sane clip length. Brevity is the product. */
export function clampSpan(start: number, end: number, maxSec = 240): { start: number; end: number } {
  return { start: Math.round(start), end: Math.round(Math.min(end, start + maxSec)) };
}
