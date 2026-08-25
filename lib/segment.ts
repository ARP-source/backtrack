/**
 * Client-safe segment shapes and helpers.
 *
 * Deliberately separate from crash-course.ts: that module reaches the LLM layer and
 * therefore node:fs/node:crypto, and a single value import from a client component would
 * drag all of it into the browser bundle. Nothing here touches Node.
 */
import type { NodeId } from "./types";

export type PlanSource = "cache" | "live" | "fixture";

export type Segment = {
  nodeId: NodeId;
  videoId: string;
  title: string;
  channel: string;
  start: number;
  end: number;
  why_this_clip: string;
  score: number;
};

export type GapPlan = {
  nodeId: NodeId;
  label: string;
  blurb: string;
  misconception?: string;
  segments: Segment[];
  /** Verified as teaching this concept but not selected — the pool a reopened node draws from. */
  alternates: Segment[];
  totalSec: number;
  /** Whether the selection was verified live, replayed from cache, or fell back. */
  source: PlanSource;
  note?: string;
  /** Candidates considered, for the "how we got here" panel. */
  considered: number;
  rejected: number;
};

/**
 * youtube.com/embed with start/end — the player enforces the bounds.
 * No video or audio is ever downloaded, cut, or re-hosted.
 */
export function embedUrl(s: Pick<Segment, "videoId" | "start" | "end">): string {
  return `https://www.youtube.com/embed/${s.videoId}?start=${s.start}&end=${s.end}&rel=0`;
}

export function timestamp(seconds: number): string {
  const t = Math.round(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
