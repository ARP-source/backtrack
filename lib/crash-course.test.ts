import { describe, it, expect, beforeAll } from "vitest";
import { mergeAdjacent, clampSpan, rankChunks, gapQueryText } from "./retrieval.js";
import { planForGap, embedUrl, MAX_SEGMENTS_PER_GAP, MAX_SEGMENT_SECONDS } from "./crash-course.js";
import { fallbackVerdicts, buildVerifyPrompt } from "./verify.js";
import type { DagNode, TranscriptChunk } from "./types.js";

const NODE: DagNode = {
  id: "matrix_multiplication",
  label: "Matrix multiplication",
  blurb: "Reads a product as the composition of two transformations.",
  depth: 7,
  prereqs: [],
  misconceptions: ["believes it is elementwise, like addition"],
};

/** Deterministic pseudo-embedding — no model needed, and similarity is controllable. */
const vec = (seed: number): number[] => {
  const v = Array.from({ length: 8 }, (_, i) => Math.sin(seed * (i + 1)));
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

const chunk = (videoId: string, start: number, end: number, seed: number): TranscriptChunk => ({
  videoId,
  start,
  end,
  text: `segment ${videoId} ${start}`,
  embedding: vec(seed),
});

describe("mergeAdjacent", () => {
  it("merges overlapping chunks from the same video into one span", () => {
    const merged = mergeAdjacent([
      { videoId: "a", start: 0, end: 75 },
      { videoId: "a", start: 50, end: 125 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ start: 0, end: 125 });
  });

  it("keeps distant spans in the same video separate", () => {
    const merged = mergeAdjacent([
      { videoId: "a", start: 0, end: 75 },
      { videoId: "a", start: 600, end: 675 },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("never merges across different videos", () => {
    const merged = mergeAdjacent([
      { videoId: "a", start: 0, end: 75 },
      { videoId: "b", start: 10, end: 85 },
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("clampSpan", () => {
  it("caps a runaway span", () => {
    expect(clampSpan(100, 9999, 240)).toEqual({ start: 100, end: 340 });
  });
});

describe("retrieval query", () => {
  it("folds the student's actual misconception into the query", () => {
    const q = gapQueryText(NODE, NODE.misconceptions[0]);
    expect(q).toContain("elementwise");
    expect(gapQueryText(NODE)).not.toContain("elementwise");
  });

  it("caps how many chunks a single video may contribute", () => {
    const chunks = Array.from({ length: 10 }, (_, i) => chunk("hog", i * 100, i * 100 + 75, 1));
    chunks.push(chunk("other", 0, 75, 1.001));
    const ranked = rankChunks(vec(1), chunks, 12, 3);
    expect(ranked.filter((c) => c.videoId === "hog")).toHaveLength(3);
    expect(ranked.some((c) => c.videoId === "other")).toBe(true);
  });
});

describe("verification prompt", () => {
  it("states the student's specific error so retrieval can target it", () => {
    const p = buildVerifyPrompt(NODE, NODE.misconceptions[0], [
      { ...chunk("a", 0, 75, 1), score: 0.9 },
    ], () => "Some Video");
    expect(p).toContain("elementwise");
    expect(p).toContain("Some Video");
    expect(p).toContain("[0]");
  });

  it("fallback keeps only the top three candidates", () => {
    const cands = Array.from({ length: 8 }, (_, i) => ({ ...chunk("a", i * 100, i * 100 + 75, i), score: 1 - i / 10 }));
    const kept = fallbackVerdicts(NODE, cands).verdicts.filter((v) => v.verdict === "teaches");
    expect(kept).toHaveLength(3);
  });
});

describe("planForGap on the fixture path", () => {
  const meta = { a: { title: "Video A", channel: "Ch" }, b: { title: "Video B", channel: "Ch" } };
  const chunks = [
    chunk("a", 0, 75, 1),
    chunk("a", 50, 125, 1.01),
    chunk("b", 300, 375, 1.02),
    chunk("b", 900, 975, 1.03),
  ];
  const embed = async () => vec(1);

  beforeAll(() => {
    // Force the true cold path: no key, no cache.
    delete process.env.GEMINI_API_KEY;
    process.env.BACKTRACK_NO_CACHE = "1";
  });

  it("still produces a usable crash course with no API key", async () => {
    const plan = await planForGap(NODE, NODE.misconceptions[0], chunks, meta, embed);
    expect(plan.source).toBe("fixture");
    expect(plan.segments.length).toBeGreaterThan(0);
    expect(plan.note).toMatch(/GEMINI_API_KEY/);
  });

  it("respects the segment count and length caps", async () => {
    const plan = await planForGap(NODE, NODE.misconceptions[0], chunks, meta, embed);
    expect(plan.segments.length).toBeLessThanOrEqual(MAX_SEGMENTS_PER_GAP);
    for (const s of plan.segments) {
      expect(s.end - s.start).toBeLessThanOrEqual(MAX_SEGMENT_SECONDS);
      expect(s.end).toBeGreaterThan(s.start);
    }
  });

  it("emits a bounded embed URL and never a media file", async () => {
    const plan = await planForGap(NODE, NODE.misconceptions[0], chunks, meta, embed);
    const url = embedUrl(plan.segments[0]);
    expect(url).toMatch(/^https:\/\/www\.youtube\.com\/embed\/[\w-]+\?start=\d+&end=\d+/);
  });
});
