import { describe, it, expect } from "vitest";
import { chunkCues, cosine, CHUNK_MAX_SEC, type Cue } from "./chunk.js";

/** Synthetic cues: `n` cues of `dur` seconds each, back to back. */
function cues(n: number, dur = 5, text = (i: number) => `sentence ${i}.`): Cue[] {
  return Array.from({ length: n }, (_, i) => ({
    text: text(i),
    start: i * dur,
    end: (i + 1) * dur,
  }));
}

describe("chunkCues", () => {
  it("returns nothing for an empty transcript", () => {
    expect(chunkCues("v", [], true)).toEqual([]);
  });

  it("keeps every chunk within the max window", () => {
    for (const chunk of chunkCues("v", cues(120), true)) {
      expect(chunk.end - chunk.start).toBeLessThanOrEqual(CHUNK_MAX_SEC);
    }
  });

  it("overlaps consecutive chunks — a concept on a cut boundary must survive somewhere", () => {
    const out = chunkCues("v", cues(120), true);
    expect(out.length).toBeGreaterThan(2);
    for (let i = 1; i < out.length; i++) {
      // Each chunk starts before the previous one ended.
      expect(out[i].start).toBeLessThan(out[i - 1].end);
    }
  });

  it("emits no runt chunks (the 5-second outro problem)", () => {
    // 3Blue1Brown-shaped: a long video whose final cues are a short sign-off.
    const out = chunkCues("v", cues(97), true);
    for (const chunk of out) {
      expect(chunk.end - chunk.start).toBeGreaterThanOrEqual(30);
    }
  });

  it("covers the whole transcript with no unreachable gap", () => {
    const input = cues(100);
    const out = chunkCues("v", input, true);
    expect(out[0].start).toBe(0);
    expect(out.at(-1)!.end).toBeCloseTo(input.at(-1)!.end, 0);
  });

  it("still chunks auto-generated captions that contain no sentence marks", () => {
    // MIT lecture 1 has 5116 words and exactly one punctuation mark. With sentence
    // snapping enabled this used to swallow the entire video into one chunk.
    const noPunct = cues(200, 5, (i) => `word${i} and then some more words`);
    const out = chunkCues("v", noPunct, false);
    expect(out.length).toBeGreaterThan(5);
    for (const chunk of out) {
      expect(chunk.end - chunk.start).toBeLessThanOrEqual(CHUNK_MAX_SEC);
    }
  });

  it("tags every chunk with its source video", () => {
    expect(chunkCues("abc123", cues(50), true).every((c) => c.videoId === "abc123")).toBe(true);
  });
});

describe("cosine", () => {
  it("is 1 for identical unit vectors and 0 for orthogonal ones", () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosine([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });
});
